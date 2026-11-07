# Sample Node.js App: CI/CD and DevSecOps

[![CI](https://github.com/asaf-refaeli/sample-nodejs/actions/workflows/ci.yml/badge.svg)](https://github.com/asaf-refaeli/sample-nodejs/actions/workflows/ci.yml)

A small Express app used as a deployment target. The focus is the infrastructure around it: a GitHub Actions pipeline with security gates, a Helm chart, and GitOps deployment with Argo CD.

## Pipeline

```
 test ─┐
       ├─► image: build ─► integration test ─► Trivy scan ─► push to ECR* ─┐
 sast ─┘                                                                   ├─► release* ─► update-gitops*
 helm ─────────────────────────────────────────────────────────────────────┘
```
`*` runs only on merge to `main`.

| Job | Tool | Fails when |
|---|---|---|
| `test` | Jest + Supertest | Any unit test fails |
| `sast` | Semgrep | Any finding with severity `ERROR` in the code |
| `helm` | chart-testing (`ct lint`), kubeconform | Chart lint error, or a rendered resource doesn't match the Kubernetes schema |
| `image` | Docker | Image doesn't build |
| `image` → integration test | `scripts/integration-test.sh` | Image doesn't start read-only as a non-root user, or any endpoint fails |
| `image` → Trivy | Trivy | Any `HIGH` or `CRITICAL` vulnerability in the image (fixed or not) |
| `image` → push | AWS CLI, GitHub OIDC | Login or push to ECR fails; the image is tagged with the commit SHA |
| `release` | release-please, AWS CLI | Opening the release PR or creating the release fails; on an app release, the image can't be tagged with its version in ECR |
| `update-gitops` | GitHub App token, yq | The new versions can't be committed to the GitOps repo (runs only after a release) |
| `pr-title` (separate workflow) | action-semantic-pull-request | The PR title isn't a Conventional Commit |

- Runs on every pull request to `main` and on every push to `main`.
- Versions are bumped by release-please through a release PR; app and chart are versioned independently (see [ADR-0007](docs/adr/0007-version-bumping.md)).
- The release PR and the release commit run only `helm` and `release`: they change only versions and changelogs, and the release tags the previous commit's already-tested image.
- Semgrep and Trivy findings are also uploaded to the GitHub Security tab.
- Third-party actions are pinned by commit SHA and tool images by digest; Dependabot keeps the actions up to date.

## Repository layout

```
.
├── app.js                      # The app
├── app.test.js                 # Unit tests
├── Dockerfile                  # Multi-stage build
├── scripts/
│   └── integration-test.sh     # Container integration test
├── chart/                      # Helm chart
│   └── ci/                     # Values files for the chart checks
├── .github/
│   ├── workflows/ci.yml        # The pipeline
│   ├── workflows/pr-title.yml  # PR title check
│   └── dependabot.yml          # Keeps pinned actions and the base image up to date
├── release-please-config.json  # Versioning: packages and release types
├── .release-please-manifest.json # Last released version of each package
└── docs/adr/                   # Architecture decision records
```

## Decisions

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-git-workflow.md) | Git workflow: GitHub Flow |
| [0002](docs/adr/0002-ci-platform.md) | CI platform: GitHub Actions |
| [0003](docs/adr/0003-helm-chart-location.md) | Helm chart lives in this repo; environment values and deployed versions live in the GitOps repo |
| [0004](docs/adr/0004-workload-type.md) | Workload type: Deployment (stateless app) |
| [0005](docs/adr/0005-sast-tool.md) | SAST tool: Semgrep |
| [0006](docs/adr/0006-image-per-commit.md) | One image per commit on `main`, tagged with the commit SHA |
| [0007](docs/adr/0007-version-bumping.md) | Versioning: release-please, independent app and chart versions |
| [0008](docs/adr/0008-gitops-update.md) | Deployment: CI commits released versions to the GitOps repo with a GitHub App |

## Run locally

Requires Docker. Node.js 22 is only needed to run the tests outside a container.

```bash
# Unit tests
npm ci && npm test

# Build and run the image
docker build -t sample-app:local .
docker run --rm -p 8080:8080 sample-app:local

# Integration test (needs port 8080 free)
scripts/integration-test.sh sample-app:local
```

The other checks (SAST, chart lint and schema validation, image scan) run in CI on every pull request; see [Pipeline](#pipeline).

## Endpoints

| Path | Purpose | Exposed by the Ingress |
|---|---|---|
| `/my-app` | Hello world; increments `root_access_total` | Yes |
| `/about` | App description | Yes |
| `/live` | Liveness probe | No |
| `/ready` | Readiness probe | No |
| `/metrics` | Prometheus metrics | No (scraped in-cluster via ServiceMonitor) |
| `/classified` | Internal endpoint | No |

The app listens on `PORT` (default `8080`).

## Deployment

Argo CD deploys from the [GitOps repo](https://github.com/asaf-refaeli/eks-gitops). Its `sample-app` Application renders this repo's chart with values from the GitOps repo, and holds two pins:

| Pin | File in the GitOps repo | Example |
|---|---|---|
| Chart version | `bootstrap/apps/sample-app.yaml` (`targetRevision` of the chart source) | `sample-app-v0.1.2` (git tag in this repo) |
| App version | `workloads/apps/sample-app/values.yaml` (`image.tag`) | `"1.0.1"` (image tag in ECR) |

- On each release, the `update-gitops` job commits the new version(s) to the GitOps repo, both pins in one commit. That commit is the deploy.
- A rollback is a `git revert` of that commit; Argo CD syncs back to the previous versions.
- CI writes to the GitOps repo with a GitHub App installed only on that repo (see [ADR-0008](docs/adr/0008-gitops-update.md)).

## Node.js version

Runs on Node.js 22 LTS; the exact version is pinned in the `Dockerfile`. The original README listed 22.1.0. The image uses the latest 22.x patch for security fixes, verified by the unit and integration tests.
