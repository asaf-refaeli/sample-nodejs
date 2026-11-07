# ADR-0007: Versioning: release-please with independent app and chart versions

## Context
- The assignment requires version bumping. Today `package.json` stays at `1.0.0`, the chart is bumped by hand, images have only SHA tags, and there are no git tags.
- The app and the chart change independently: a template change doesn't change the app, and an app change doesn't always change the chart.
- Versions are written in several places (`package.json`, `Chart.yaml`, git tags, ECR tags). A number nobody updates becomes a second, wrong source of truth.
- `main` is protected: every change goes through a PR with required checks. No bot should bypass that.
- Commits follow Conventional Commits, so versions can be calculated from history.

## Decision
Use release-please with two packages (app and chart), because:
- It calculates each version from commits: last release + the biggest change since (breaking > `feat` > `fix`).
- It writes the versions into the files through a release PR, so the files stay real and `main` is only changed through PRs.
- There is one release PR at a time, rebuilt from `main` on every merge, so parallel PRs can't produce conflicting versions.
- It supports independent versions per path without custom scripts.

| Package | Bumped when | Files | Tag |
|---|---|---|---|
| App (`.`, excludes `chart/`) | `feat`/`fix` outside `chart/` | `package.json`, `package-lock.json`, `CHANGELOG.md`, `Chart.yaml` `appVersion` | `v1.1.0` |
| Chart (`chart/`) | `feat`/`fix` under `chart/` | `Chart.yaml` `version`, `chart/CHANGELOG.md` | `sample-app-v0.1.2` |

Supporting rules:
- Squash merge only, with a CI check on the PR title: the title becomes the commit release-please reads ([release-please README](https://github.com/googleapis/release-please) recommends squash merges).
- `appVersion` = latest app release, the default image tag; the GitOps repo sets `image.tag`. Standard Helm scaffold pattern; `appVersion` is informational and unrelated to the chart `version` ([Helm Docs: Charts](https://helm.sh/docs/topics/charts/)).
- ct's version-increment check is off: the chart bump moved from the author to the release PR.
- On release, the image built from the release commit gets a version tag in ECR. No rebuild; the image contains no version.
- The release PR runs with `GITHUB_TOKEN`; its checks start after "Approve workflows to run" ([GitHub Docs: GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)). No stored token.
- The GitOps repo deploys release versions (`image.tag`, chart tag). ADR-0006 still applies to building.

## Alternatives considered
- semantic-release: rejected. Fully automatic, but writing versions into files requires a bot that commits directly to `main`, bypassing branch protection; without it, files hold stale versions. One version per repo.
- Auto-merging the release PR: rejected. Removes the release gate release-please exists for.
- CI bumps the version inside each feature PR: rejected. Parallel PRs can claim the same version, bump size needs custom logic, and the change isn't reviewed.
- Manual chart bump enforced by ct: Helm's standard, rejected because the chart version should change automatically.

## Consequences
- Good: every version in the repo is real and tool-written; app and chart are versioned independently.
- Good: the release PR previews the next release; a pod traces back to its code (image `1.1.0` → tag `v1.1.0` → commit).
- Bad: a human merges the release PR (continuous delivery, not deployment); it should be merged often to keep releases small.
- Bad: the bump size comes from the PR title type; a breaking change titled `fix` gets only a patch bump. The title check enforces the format, not the correct type.
