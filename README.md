# KubeRest

KubeRest is a Kubernetes workload scheduler that starts and stops namespaces on a schedule you define — with a simple UI and API for manual control when you need it.

The default configuration uses a Friday evening scale-down and Monday morning scale-up (a common dev-cluster cost pattern), but schedules are fully configurable. Use whatever cadence fits your team: nightly off-hours, weekday business hours only, per-environment windows, and more.

It is designed as an internal/dev utility and favors simple, explicit behavior over production-grade complexity.

## What KubeRest Does

- **Schedules workload stop/start** via Kubernetes CronJobs with configurable cron expressions and timezone.
- **Stops workloads** by scaling Deployments and StatefulSets to `0` replicas.
- **Starts workloads** by restoring replicas from a saved snapshot.
- Takes a replica snapshot into a ConfigMap **before** any scale-down (so restore is always predictable).
- Exposes an intuitive web UI and REST API for status, manual scale, schedule editing, and validation.
- Sends optional non-blocking comms events to an external endpoint.
- Scans workloads for missing CPU/memory requests and limits.

## Current Build Status

The project is under active build. Current status:

- Completed: Phase 1 (Foundation)
- Completed: Phase 2 (Core K8s Engine)
- Pending: Phase 3+ (Express routes, server, UI, manifests, cron entrypoint)

Implemented modules today:

- `src/config.js`
- `src/logger.js`
- `src/k8s/client.js`
- `src/k8s/comms.js`
- `src/k8s/scaleDown.js`
- `src/k8s/scaleUp.js`
- `src/k8s/validate.js`
- `src/k8s/cronManager.js`

## Hard Invariants

These are non-negotiable behavior rules:

1. In-cluster kubeconfig by default (`kc.loadInCluster()`).
2. ConfigMap is the only state store.
3. Snapshot must be written before any scale-down patch.
4. Scale-up restores only what exists in snapshot.
5. Comms hook is non-blocking and never breaks caller flow.
6. Cron entrypoint is `scripts/cronEntry.js`.
7. Auth model is JWT in httpOnly cookie, users stored in `config.yaml`.
8. CronJobs use `timeZone: America/Denver`.

## Tech Stack

- Node.js 20
- Express
- `@kubernetes/client-node`
- `js-yaml`
- `pino`
- `jsonwebtoken`
- `bcryptjs`
- `cookie-parser`

## Repository Layout

```text
kuberest/
├── src/
│   ├── config.js
│   ├── logger.js
│   ├── k8s/
│   │   ├── client.js
│   │   ├── comms.js
│   │   ├── scaleDown.js
│   │   ├── scaleUp.js
│   │   ├── validate.js
│   │   └── cronManager.js
│   ├── routes/               # planned
│   └── ui/                   # planned
├── scripts/                  # planned cron entrypoint
├── manifests/                # planned k8s manifests
├── config.yaml
├── package.json
├── Dockerfile
├── CLAUDE.md
├── LOAD_CONTEXT.md
└── TODO.md
```

## Prerequisites

- Node.js `>=20`
- npm
- Access to a Kubernetes cluster
- ServiceAccount/RBAC permissions (when deployed in-cluster)

## Installation

```bash
npm install
```

## Configuration

Main configuration file: `config.yaml`

### Auth block

- `auth.jwt_secret`: signing secret for JWT cookies.
- `auth.token_expiry`: token lifetime.
- `auth.users`: static users with `username`, `password_hash`, `role`.

Generate bcrypt hashes:

```bash
node -e "const b=require('bcryptjs'); console.log(b.hashSync('yourpassword',10))"
```

### Namespace block

`namespaces` defines which namespaces are in scope and whether each is enabled.

### Schedule block

Defines when automated stop and start run. CronJobs are created from these values and can be edited later from the UI.

- `schedule.scale_down`: cron expression for when workloads are stopped (replicas → `0`).
- `schedule.scale_up`: cron expression for when workloads are started (replicas restored from snapshot).

Example defaults (Mountain Time, via CronJob `timeZone`):

| Action     | Default cron   | Meaning              |
|------------|----------------|----------------------|
| Scale down | `0 20 * * 5`   | Friday 8:00 PM       |
| Scale up   | `0 6 * * 1`    | Monday 6:00 AM       |

These are starting points, not fixed behavior. Change them in `config.yaml` or through the Cron management UI.

### Comms block

- `comms.enabled`: toggle external event dispatch.
- `comms.endpoint`: webhook URL.
- `comms.secret_header` / `comms.secret_value`: optional shared-secret header.
- `comms.timeout_ms`: request timeout in milliseconds.

## Environment Variables

- `TOOL_NAMESPACE` (default: `kuberest`)
- `LOG_LEVEL` (default: `info`)
- `PORT` (default: `3000`)
- `KUBEREST_CONFIG_PATH` (optional path override for `config.yaml`)

## Local Development Notes

Production runtime is in-cluster. For local testing against a local kube context, set:

```bash
export KUBECONFIG=~/.kube/config
export NODE_ENV=development
```

> Note: a local fallback in `src/k8s/client.js` is planned and tracked in `TODO.md`.

## Available npm Scripts

- `npm start` -> starts `src/server.js` (Phase 3 pending)
- `npm run dev` -> watch mode for `src/server.js` (Phase 3 pending)
- `npm run cron` -> runs `scripts/cronEntry.js` (Phase 4 pending)

## Engine Modules (Implemented)

### `src/k8s/comms.js`

- Sends optional webhook events.
- Uses `AbortController` timeout.
- Logs warn on failure (non-critical path).

### `src/k8s/scaleDown.js`

- Lists Deployments + StatefulSets.
- Writes snapshot ConfigMap in tool namespace.
- Patches replicas to `0`.
- Emits fire-and-forget comms event.

### `src/k8s/scaleUp.js`

- Reads snapshot ConfigMap.
- Restores snapshotted replicas.
- Clears snapshot ConfigMap after full success.
- Emits fire-and-forget comms event.

### `src/k8s/validate.js`

- Scans containers for:
  - `resources.requests.cpu`
  - `resources.requests.memory`
  - `resources.limits.cpu`
  - `resources.limits.memory`
- Returns pass/fail details and summary counts.

### `src/k8s/cronManager.js`

- Lists CronJobs in `TOOL_NAMESPACE`.
- Updates `spec.suspend`.
- Updates `spec.schedule`.

## Snapshot ConfigMap Convention

- Name: `kuberest-snapshot-<namespace>`
- Namespace: `TOOL_NAMESPACE` (default `kuberest`)
- Data key: `snapshot` (JSON string)

## Comms Payload Contract

```json
{
  "event": "scale_down | scale_up | manual_scale_down | manual_scale_up | validation_complete",
  "timestamp": "2026-05-12T00:00:00.000Z",
  "namespace": "payments",
  "triggered_by": "cron | user:<username>",
  "details": {
    "workloads_affected": 4,
    "status": "success | partial | failed"
  }
}
```

## Planned API Surface (Phase 3)

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /api/status/namespaces`
- `GET /api/status/namespace/:ns`
- `POST /api/scale/down`
- `POST /api/scale/up`
- `GET /api/cron/jobs`
- `PATCH /api/cron/:name/schedule`
- `PATCH /api/cron/:name/suspend`
- `POST /api/validate`

## Docker

### Local build

```bash
docker build -t kuberest:latest .
```

Run container (example):

```bash
docker run --rm -p 3000:3000 \
  -e TOOL_NAMESPACE=kuberest \
  -e LOG_LEVEL=info \
  kuberest:latest
```

### CI/CD: GitHub Actions → Docker Hub

This repo includes `.github/workflows/docker-publish.yml`, which builds the image and pushes it to Docker Hub.

**Triggers**

| Event | Tags pushed |
|-------|-------------|
| Push to `main` | `latest`, commit SHA |
| Push tag `v1.2.3` | `1.2.3`, `1.2`, `1`, commit SHA |
| Manual run (`workflow_dispatch`) | Same rules based on ref |

**Image name**

```
<your-dockerhub-username>/kuberest
```

To use a different repository name, change `IMAGE_NAME` in the workflow file.

---

### Guide: Link Docker Hub to this GitHub Action

#### Step 1 — Create a Docker Hub account and repository

1. Sign up or log in at [hub.docker.com](https://hub.docker.com).
2. Go to **Repositories** → **Create Repository**.
3. Name it `kuberest` (or match `IMAGE_NAME` in the workflow).
4. Set visibility (public or private).

You do **not** need Docker Hub “Automated Builds” for this setup. GitHub Actions builds the image and pushes it; Docker Hub only stores the result.

#### Step 2 — Create a Docker Hub access token

1. Open [Docker Hub → Account Settings → Security](https://hub.docker.com/settings/security).
2. Click **New Access Token**.
3. Description: e.g. `github-actions-kuberest`.
4. Permissions: **Read, Write, Delete** (write is required to push images).
5. Copy the token immediately — it is shown only once.

Use a **token**, not your Docker Hub account password, in GitHub secrets.

#### Step 3 — Add secrets to your GitHub repository

1. Open your GitHub repo → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret** and add:

| Secret name | Value |
|-------------|--------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username (not email) |
| `DOCKERHUB_TOKEN` | The access token from Step 2 |

No other secrets are required for the default workflow.

#### Step 4 — Push code to GitHub

1. Initialize git and add the remote if you have not already:

```bash
git init
git remote add origin git@github.com:<your-user>/kuberest.git
git add .
git commit -m "Add Docker publish workflow"
git branch -M main
git push -u origin main
```

2. After the push, open **Actions** in GitHub and confirm **Build and Push Docker Image** runs successfully.

#### Step 5 — Verify the image on Docker Hub

1. Go to `https://hub.docker.com/r/<your-dockerhub-username>/kuberest`.
2. Confirm tags such as `latest` and the commit SHA appear under **Tags**.

Pull the image:

```bash
docker pull <your-dockerhub-username>/kuberest:latest
```

#### Step 6 — Use the image in Kubernetes (when manifests are ready)

Reference the published image in your Deployment/CronJob manifests:

```yaml
image: <your-dockerhub-username>/kuberest:latest
```

For reproducible deploys, pin a specific tag (commit SHA or semver) instead of `latest`.

#### Optional — Release with semver tags

To publish versioned images:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow tags the image as `0.1.0`, `0.1`, and `0` in addition to the commit SHA.

#### Optional — Run the workflow manually

GitHub → **Actions** → **Build and Push Docker Image** → **Run workflow** → choose branch → **Run workflow**.

#### Troubleshooting

| Problem | Fix |
|---------|-----|
| `denied: requested access to the resource is denied` | Check `DOCKERHUB_USERNAME` matches the account that owns the repo; token has write permission. |
| Repository does not exist on Docker Hub | Create `kuberest` repository first, or change `IMAGE_NAME` in the workflow. |
| Workflow does not run | Ensure default branch is `main`, or edit workflow `branches` to match yours. |
| Login fails | Regenerate token; confirm secret name is exactly `DOCKERHUB_TOKEN`. |

#### Security notes

- Never commit Docker Hub credentials to the repo.
- Rotate `DOCKERHUB_TOKEN` periodically.
- Prefer semver or SHA tags in production manifests over `latest`.

## How Scheduling Works

```text
┌─────────────┐     cron schedule      ┌──────────────────┐
│  CronJob    │ ─────────────────────► │ scripts/cronEntry │
│  (K8s)      │   scale-down / up      │  (one-shot pod)   │
└─────────────┘                        └────────┬─────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    ▼                           ▼                           ▼
             scaleDown.js                  scaleUp.js                   comms.js
         snapshot → patch 0            read snapshot → restore         (fire-and-forget)
```

- **Automated**: CronJobs invoke `scripts/cronEntry.js` with `--mode scale-down|scale-up` and `--all` or `--namespace`.
- **Manual**: Admins trigger the same engine through `POST /api/scale/down` and `POST /api/scale/up`.
- **Schedule management**: View, suspend, resume, and reschedule CronJobs without deleting them.

## Kubernetes Deployment (Planned)

Manifest work is tracked in `TODO.md` and includes:

- Namespace and ServiceAccount
- RBAC
- Deployment and Service
- ConfigMap mount for `config.yaml`
- CronJobs for automated scale-down/up (schedule from `config.yaml`, `timeZone: America/Denver`)

## Known Gaps / Non-Goals

- No HPA suspend/resume support
- No audit log
- No retry logic for failures
- No multi-cluster support
- Not production HA

## Development Workflow

1. Read `CLAUDE.md` and `LOAD_CONTEXT.md`.
2. Pick the next unchecked item from `TODO.md`.
3. Build one file at a time.
4. Keep invariants intact.

## License

Internal use only. Add a formal license if this project will be distributed externally.
