# Verification

Screenshots of real pipeline runs, releases and deploys to the EKS cluster, taken on 2026-11-08. Each section links the PRs it comes from.

Live app: https://sample-app.asafr.dev/my-app

## What is verified

1. [Chart change: PodDisruptionBudget](#1-chart-change-poddisruptionbudget-chart-030): a chart-only release (`0.3.0`) deployed through GitOps, with the PDB on the cluster before and after.
2. [App fix: graceful shutdown](#2-app-fix-graceful-shutdown-app-112): a patch release (`1.1.2`) from PR to the running image in Argo CD.
3. [Feature and revert](#3-feature-and-revert-app-120--121): a minor release (`1.2.0`) visible in the browser, then reverted with `git revert` as `1.2.1`.
4. [Security and quality gates failing on purpose](#4-security-and-quality-gates-failing-on-purpose): SAST, image scan, PR title, unit tests and chart schema, each blocking the pipeline.

## How a release flows

```
feature PR ─► checks ─► merge ─► image pushed to ECR (commit SHA tag)
            ─► release PR (version + changelog) ─► merge ─► git tag + ECR version tag
            ─► update-gitops commits the version to eks-gitops ─► Argo CD syncs ─► live
```

Every release below went through this flow without a manual step.

## 1. Chart change: PodDisruptionBudget (chart 0.3.0)

A `feat(chart)` change bumps only the chart version; the app version stays the same.
PRs: [#37](https://github.com/asaf-refaeli/sample-nodejs/pull/37) (change), [#38](https://github.com/asaf-refaeli/sample-nodejs/pull/38) (release).

PR checks pass, and kubeconform validates the new PodDisruptionBudget against the Kubernetes schema:

![PDB PR checks](screenshots/01-pdb-pr-checks.png)
![helm job](screenshots/02-pdb-helm-job.png)

Before the release, the cluster has no PDB:

![no PDB](screenshots/03-pdb-before.png)

The release PR bumps only the chart (`0.2.0` → `0.3.0`). The run then commits the new chart pin to eks-gitops:

![chart release PR](screenshots/04-chart-release-pr-0.3.0.png)
![chart release run](screenshots/05-chart-release-run-0.3.0.png)
![GitOps chart pin](screenshots/06-gitops-chart-pin-0.3.0.png)

Argo CD syncs it, and the PDB exists on the cluster:

![Argo CD with PDB](screenshots/07-argocd-pdb.png)
![PDB after](screenshots/08-pdb-after.png)

## 2. App fix: graceful shutdown (app 1.1.2)

The app runs as PID 1 in the container and had no SIGTERM handler, so every pod stop waited the full 30s grace period and ended in SIGKILL. The fix closes the server on SIGTERM and exits with code 0.
PRs: [#39](https://github.com/asaf-refaeli/sample-nodejs/pull/39) (fix), [#40](https://github.com/asaf-refaeli/sample-nodejs/pull/40) (release).

![fix PR checks](screenshots/09-shutdown-fix-pr-checks.png)
![fix diff](screenshots/10-shutdown-fix-pr-diff.png)

A `fix` commit gives a patch release. The release PR shows every file where the version is written:

![release PR 1.1.2](screenshots/11-release-pr-1.1.2.png)
![version diff 1.1.1 to 1.1.2](screenshots/12-release-pr-1.1.2-version-diff.png)

The release run tags the image and commits `image.tag: "1.1.2"` to eks-gitops. Argo CD runs the new image:

![release run 1.1.2](screenshots/13-release-run-1.1.2.png)
![GitOps commit 1.1.2](screenshots/14-gitops-commit-1.1.2.png)
![Argo CD image 1.1.2](screenshots/15-argocd-images-1.1.2.png)

A `preStop` sleep (chart `0.4.0`, [#41](https://github.com/asaf-refaeli/sample-nodejs/pull/41)) keeps a stopping pod serving while the ALB deregisters it, so the fast exit doesn't cause 502s.

## 3. Feature and revert (app 1.2.0 → 1.2.1)

A visible feature, released and deployed, then reverted with `git revert` (not edited by hand). Versions only move forward: the revert is a new patch release, not a return to `1.1.2`.
PRs: [#43](https://github.com/asaf-refaeli/sample-nodejs/pull/43) (feature), [#44](https://github.com/asaf-refaeli/sample-nodejs/pull/44) (release 1.2.0), [#45](https://github.com/asaf-refaeli/sample-nodejs/pull/45) (revert), [#46](https://github.com/asaf-refaeli/sample-nodejs/pull/46) (release 1.2.1).

Before:

![my-app before](screenshots/16-my-app-before-1.2.0.png)

The feature merges, the image is built, scanned and pushed, and a `feat` commit gives a minor release:

![release PR 1.2.0](screenshots/17-release-pr-1.2.0.png)
![merge run](screenshots/18-feat-merge-run-1.2.0.png)
![version diff 1.1.2 to 1.2.0](screenshots/19-release-pr-1.2.0-version-diff.png)

The release PR only changes versions and changelogs, so it runs only the chart check and the PR title check:

![release PR checks](screenshots/20-release-pr-1.2.0-checks.png)

Deployed and live:

![my-app 1.2.0](screenshots/21-my-app-1.2.0-live.png)
![release run 1.2.0](screenshots/22-release-run-1.2.0.png)

The revert is created from the merged PR with GitHub's Revert button and titled `fix:`, so it releases as a patch:

![revert PR](screenshots/23-revert-pr-open.png)
![release PR 1.2.1](screenshots/24-release-pr-1.2.1.png)

Live again with the original text:

![my-app 1.2.1](screenshots/25-my-app-1.2.1-live.png)

## 4. Security and quality gates failing on purpose

Each PR breaks one thing on purpose and is never merged. Every failure stops the pipeline before an image could be pushed.

| Gate | PR | Change | Result |
|---|---|---|---|
| SAST (Semgrep) | [#47](https://github.com/asaf-refaeli/sample-nodejs/pull/47) | `eval()` on user input | `sast` fails, `image` skipped |
| Image scan (Trivy) | [#48](https://github.com/asaf-refaeli/sample-nodejs/pull/48) | End-of-life base image `node:16-alpine` | Trivy finds 6 HIGH, `image` fails before the push |
| PR title | [#49](https://github.com/asaf-refaeli/sample-nodejs/pull/49) | Title without a Conventional Commit type | `pr-title` fails |
| Unit tests | [#50](https://github.com/asaf-refaeli/sample-nodejs/pull/50) | Wrong expected value in a test | `test` fails, `image` skipped |
| Chart schema | [#51](https://github.com/asaf-refaeli/sample-nodejs/pull/51) | String where Kubernetes requires an integer | `helm lint` passes, kubeconform fails |

SAST:

![SAST gate](screenshots/26-sast-gate-fail.png)

Image scan:

![Trivy gate](screenshots/27-trivy-gate-fail.png)
![Trivy CVE table](screenshots/28-trivy-cve-table.png)

PR title:

![PR title gate](screenshots/29-pr-title-gate-fail.png)

Unit tests:

![test gate](screenshots/30-test-gate-fail.png)

Chart schema: the lint step passes, and the schema check catches what it misses.

![helm gate run](screenshots/31-helm-gate-run.png)
![kubeconform error](screenshots/32-helm-gate-kubeconform.png)
