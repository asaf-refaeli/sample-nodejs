# Sample Node.js App: CI/CD and DevSecOps

[![CI](https://github.com/asaf-refaeli/sample-nodejs/actions/workflows/ci.yml/badge.svg)](https://github.com/asaf-refaeli/sample-nodejs/actions/workflows/ci.yml)

A small Express app used as a deployment target. The focus is the infrastructure around it: a GitHub Actions pipeline with security gates, a Helm chart, and GitOps deployment with Argo CD.

Built as a home assignment for a DevOps role, by a single developer. The app code is intentionally trivial; the work is the pipeline, the chart and the deployment.

## How a change ships

1. A pull request runs tests, SAST, chart checks, and an image build with an integration test and a vulnerability scan. The PR title must be a Conventional Commit.
2. The merge to `main` runs the same checks and pushes the image to ECR, tagged with the commit SHA.
3. release-please opens a release PR with the next version and changelog.
4. Merging the release PR creates the git tag and adds the version tag to the already-tested image in ECR.
5. `update-gitops` commits the new version to the [GitOps repo](https://github.com/asaf-refaeli/eks-gitops); Argo CD syncs it to the cluster.

Details: [Pipeline](#pipeline), [Deployment](#deployment).

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
- The release PR and the release commit run only `helm` and `release`: they change only versions and changelogs, and the release tags the previous commit's already-tested image.

## Versioning

[release-please](https://github.com/googleapis/release-please) calculates versions from [Conventional Commits](https://www.conventionalcommits.org/). The app and the chart have separate versions:

| Package | Bumped by commits that change | Version written to | Tag |
|---|---|---|---|
| App | Anything outside `chart/` | `package.json`, `CHANGELOG.md`, `appVersion` in `chart/Chart.yaml` | `v1.0.0`, plus the same version as an ECR image tag |
| Chart | Files under `chart/` | `version` in `chart/Chart.yaml`, `chart/CHANGELOG.md` | `sample-app-v0.2.0` |

- The commit type sets the bump: `fix` is a patch, `feat` a minor, a breaking change a major (a minor for the chart while it's 0.x). `chore`, `docs`, `ci` and other types don't release.
- PRs are squash-merged, so the PR title becomes the commit release-please reads; the `pr-title` check enforces the format.
- Every merge updates one open release PR with the next versions and changelogs. Merging it is the release; nothing is versioned by hand.

Configuration: `release-please-config.json`, last released versions in `.release-please-manifest.json`. Why release-please and the alternatives considered: [ADR-0007](docs/adr/0007-version-bumping.md).

## Security controls

- **No stored cloud keys:** CI reaches AWS through GitHub OIDC and an IAM role that trusts only this repo's `main` branch.
- **Pinned supply chain:** third-party actions are pinned by commit SHA, tool images by digest, the base image by digest, and the kubeconform binary by checksum. Dependabot updates the actions and the base image; a base image update ships as a patch release.
- **Least privilege:** the workflow defaults to `contents: read`; each job adds only what it needs, and `update-gitops` gets none.
- **Gates:** Semgrep (code) and Trivy (image) fail the build; their findings are uploaded to the GitHub Security tab.
- **Hardened container:** runs as a non-root user with a read-only root filesystem and all capabilities dropped; npm is removed from the final image. The integration test runs the image the same way.
- **Immutable images:** ECR tag immutability is on; a release adds a tag to an existing image instead of rebuilding it.
- **GitOps access:** CI writes to the GitOps repo as a GitHub App installed only on that repo, with a token that expires after one hour (see [ADR-0008](docs/adr/0008-gitops-update.md)).
- **Not exposed:** the Ingress routes only `/my-app` and `/about`; probes, metrics and `/classified` stay inside the cluster.

## Deployment

Argo CD deploys from the [GitOps repo](https://github.com/asaf-refaeli/eks-gitops). Its `sample-app` Application renders this repo's chart with values from the GitOps repo, and holds two pins:

| Pin | File in the GitOps repo | Current |
|---|---|---|
| Chart version | `bootstrap/apps/sample-app.yaml` (`targetRevision` of the chart source) | `sample-app-v0.2.0` (git tag in this repo) |
| App version | `workloads/apps/sample-app/values.yaml` (`image.tag`) | `"1.0.0"` (image tag in ECR) |

- On each release, the `update-gitops` job commits the new version(s) to the GitOps repo, both pins in one commit. That commit is the deploy.
- A rollback is a `git revert` of that commit; Argo CD syncs back to the previous versions.

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
| `/metrics` | Prometheus metrics; the chart can create a ServiceMonitor (off by default) | No |
| `/classified` | Internal endpoint | No |

The app listens on `PORT` (default `8080`).

## Repository layout

```
.
├── app.js                      # The app
├── app.test.js                 # Unit tests
├── Dockerfile                  # Multi-stage build
├── CHANGELOG.md                # App releases (written by release-please)
├── scripts/
│   └── integration-test.sh     # Container integration test
├── chart/                      # Helm chart (CHANGELOG.md: chart releases)
│   └── ci/                     # Values files for the chart checks
├── .github/
│   ├── workflows/ci.yml        # The pipeline
│   ├── workflows/pr-title.yml  # PR title check
│   └── dependabot.yml          # Keeps pinned actions and the base image up to date
├── release-please-config.json  # Versioning: packages and release types
├── .release-please-manifest.json # Last released version of each package
└── docs/adr/                   # Architecture decision records
```

## Node.js version

Runs on Node.js 22 LTS; the exact version is pinned in the `Dockerfile`. The original README listed 22.1.0. The image uses the latest 22.x patch for security fixes, verified by the unit and integration tests.
