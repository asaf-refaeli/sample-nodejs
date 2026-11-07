# ADR-0006: Image publishing: one image per commit on main

## Context
- The app and its Helm chart live in the same repository (ADR-0003).
- Many merges to `main` change only the chart or docs, not the app.
- The GitOps repo pins the chart revision and the image tag together, so both must be traceable to the same commit.
- Branch protection will require the CI checks to pass before a PR can merge.

## Decision
Build and push an image on every push to `main`, regardless of which files changed, because:
- Each commit on `main` has an image tagged with the same commit SHA, so the GitOps repo pins chart and image as one matching pair.
- The rule is the same for every commit: no path logic to maintain or explain.
- The image pushed is the one built, tested and scanned in the same run.
- The repository holds a single service; a full build takes a few minutes, so skipping builds saves little.

Supporting rules:
- Tags are the full commit SHA; the ECR repository has tag immutability enabled.
- ECR lifecycle policy: keep the last 30 tagged images, expire untagged images after 7 days.
- The base image is pinned by digest, so a commit that changes only the chart or docs produces a functionally identical image. Base image updates arrive as their own Dependabot PRs.

## Alternatives considered
- Path filters on the workflow (`paths` / `paths-ignore`, e.g. skip on `docs/**`): rejected. When a workflow is skipped by a path filter, its checks stay "Pending"; if those checks are required by branch protection, the PR cannot be merged ([GitHub Docs: troubleshooting required status checks](https://docs.github.com/en/enterprise-server@3.0/github/administering-a-repository/defining-the-mergeability-of-pull-requests/troubleshooting-required-status-checks)). GitHub's workaround is a second, dummy workflow with the same name that always passes; this produces a green check from a job that checked nothing, so path-filtered workflows should not be used for required checks ([Mergify: path filters are not a CI gate](https://mergify.com/blog/path-filters-are-not-a-ci-gate)).
- Skip only the push when app files didn't change: rejected because chart and image would no longer share a commit SHA, and the GitOps update would need logic to find which older image matches the current chart.
- Build only what changed (affected detection): suited to monorepos with many services where full builds are slow; not worth the added logic for a single service.

## Consequences
- Good: every commit on `main` is deployable as one pinned pair; deploy history maps one-to-one to commits.
- Good: when a deploy breaks, `git diff` between the last good and the broken commit shows every input that changed.
- Bad: chart-only and docs-only merges produce new, functionally identical images; storage is bounded by the lifecycle policy.
- Bad: every merge runs the full pipeline, including the image build and scan.

## Update (after ADR-0007 and ADR-0008)
- The GitOps repo now pins release versions (chart git tag, image version tag), not a commit SHA pair. The pairing reason above no longer applies; the rest of the decision stands.
- Release commits (`chore: release main`) and the release PR don't build: they change only versions and changelogs. The release tags the parent commit's image, built and tested when it merged (ADR-0007). Every other commit on `main` still builds.
- Change detection per job (app vs chart) is the next step if the build gets slow. It needs skipped builds to carry the previous image tag forward, so every commit still has an image.
