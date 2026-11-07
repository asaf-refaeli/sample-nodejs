# ADR-0008: Deployment: CI commits released versions to the GitOps repo with a GitHub App

## Context
- Argo CD deploys sample-app from the GitOps repo (`eks-gitops`): chart from this repo at a git tag, values from `eks-gitops`.
- Releases (ADR-0007) produce an app version (image tag in ECR) and a chart version (git tag). Something has to write them to `eks-gitops`.
- `GITHUB_TOKEN` can only write to the repo the workflow runs in.
- `main` in `eks-gitops` is protected by a ruleset that requires pull requests.

## Decision
A CI job (`update-gitops`) commits the released versions directly to `eks-gitops` `main`, authenticated as a GitHub App, because:
- The deploy is a Git commit: what runs is always what `eks-gitops` says, and `git revert` is the rollback.
- The release PR in this repo is already the human gate; a second PR per deploy would add a manual step with nothing new to review.
- A GitHub App is GitHub's documented way to access another repository from a workflow ([GitHub Docs: GitHub App in a workflow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)). It is installed on `eks-gitops` only, with Contents read/write only, and each run gets a token that expires after one hour. It isn't tied to a person.

Supporting rules:
- Two pins: `image.tag` in `workloads/apps/sample-app/values.yaml` (app release) and the chart source's `targetRevision` in `bootstrap/apps/sample-app.yaml` (chart release). Both in one commit when both are released.
- The job runs after the `release` job, so the version-tagged image already exists in ECR.
- The App is on the bypass list of the `eks-gitops` pull-request ruleset; force pushes and deletions stay blocked for everyone.
- `yq` edits the files; it drops empty lines, so the two files are kept without them.

## Alternatives considered
- Deploy key: rejected. Simpler, but the SSH key itself never expires and is used directly on every run ([GitHub Docs: deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)).
- Fine-grained personal access token: rejected. Tied to a personal account and expires on a fixed date.
- Opening a PR in `eks-gitops` instead of committing: rejected. Adds a second manual gate after the release PR.
- `argocd app set -p image.tag=...`: rejected. The value would live only in the cluster; Argo CD's docs call parameter overrides an anti-pattern to GitOps ([Argo CD Docs: parameter overrides](https://argo-cd.readthedocs.io/en/stable/user-guide/parameters/)).
- Argo CD Image Updater: rejected. An extra in-cluster component, while CI already knows the exact released version.
- Wrapper chart in `eks-gitops`: deferred. Needs the chart published to a registry first.

## Consequences
- Good: every deploy and rollback is a reviewable commit in `eks-gitops`, linked to the source commit.
- Good: no long-lived credential is used directly by the job; the App's token is short-lived and scoped to one repo.
- Bad: one stored secret (the App's private key) can mint write tokens for `eks-gitops`; it must be rotated if leaked.
- Bad: the App bypasses the pull-request rule in `eks-gitops`, so its commits aren't reviewed there.
