# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

A minimal Express.js app used as a deployment target for DevOps work: Kubernetes deployment and CI/CD pipeline demos. The app code is intentionally trivial. Most of the work here is expected to be infrastructure around it (containerization, manifests/charts, pipelines, monitoring).

## Commands

- Install deps: `npm ci` (lockfile is committed)
- Run: `npm start` (`node app.js`, listens on `PORT`, default `8080`)
- Unit tests: `npm test` (Jest + Supertest, `app.test.js`)
- Container integration test: `scripts/integration-test.sh <image>`
- Runtime: Node.js 22 LTS, exact version pinned in the `Dockerfile`

The container runs `node app.js` directly, not `npm start`: npm is removed from the runtime image, and Node must be PID 1 so the SIGTERM handler receives the signal.

## Architecture

Everything lives in `app.js`:

- **Endpoints:** `/my-app` (hello world, increments a counter), `/about`, `/ready` (readiness probe), `/live` (liveness probe), `/metrics` (Prometheus scrape), `/classified` (returns "You should not be here!!!", so it presumably shouldn't be publicly reachable).
- **Metrics:** uses a custom `prom-client` `Registry` (not the global default). Default Node process metrics plus the `root_access_total` counter are registered on it, and `/metrics` serves that registry. New metrics must be registered on `register` to appear at `/metrics`.
- Probe endpoints always return 200; they don't check dependencies.

## Decisions
Decisions are documented as ADRs in `docs/adr/` using `docs/adr/0000-template.md`.
Their purpose is to explain why each choice was made.
- Use GitHub flow as git workflow
- Use GitHub Actions for CI
- Image registry is ECR
<!-- Add each decision here once it's made. Until something is listed, ask before choosing. -->

## Conventions
- Commits: Conventional Commits (`feat:`, `fix:`, `ci:`, `chore:`, `docs:`)
- Comments only where the reason isn't obvious. No emojis.
- Keep changes scoped to the task; propose new tools or dependencies before adding them.

## Security
- Do not run state-changing `kubectl`, `helm`, `aws`, or `git push` commands.
- Do not read or write credentials, kubeconfigs, or `.env` files.
- Do not hardcode account IDs, ARNs, hostnames, or secrets.
