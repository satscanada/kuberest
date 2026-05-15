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

| Phase | Status |
|-------|--------|
| 1 — Foundation | Done |
| 2 — Core K8s Engine | Done |
| 3 — Express Server + Routes | Done |
| 4 — CronJob Entrypoint | Done |
| 5 — UI | Done |
| 6 — Kubernetes Manifests | Done |
| 7 — Polish | Done |

**Quick start:** see [QUICKSTART.md](QUICKSTART.md)

Implemented modules:

- `src/config.js`, `src/logger.js`, `src/app.js`, `src/server.js`
- `src/k8s/*` — client, comms, scaleDown, scaleUp, validate, cronManager
- `src/routes/*` — auth, status, scale, validate, cron
- `frontend/*` — React + Vite source for the modern UI
- `src/ui/*` — built frontend assets served by Express
- `scripts/cronEntry.js`
- `tests/*` — Phase 1–5 test package
- `docker-compose.yml` — local Docker deployment

## Hard Invariants

These are non-negotiable behavior rules:

1. In-cluster kubeconfig in production (`kubeConfig.loadFromCluster()`).
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
- React 19 + Vite 8 (UI)

## Repository Layout

```text
kuberest/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config.js
│   ├── logger.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── status.js
│   │   ├── scale.js
│   │   ├── validate.js
│   │   └── cron.js
│   ├── k8s/
│   │   ├── client.js
│   │   ├── comms.js
│   │   ├── scaleDown.js
│   │   ├── scaleUp.js
│   │   ├── validate.js
│   │   └── cronManager.js
│   └── ui/                   # built React bundle served by Express
├── frontend/                 # React + Vite source
├── scripts/
│   └── cronEntry.js
├── tests/
│   ├── fixtures/
│   ├── helpers/
│   └── *.test.js
├── manifests/                # Phase 6
├── config.yaml
├── config.docker.yaml        # local Docker credentials
├── package.json
├── Dockerfile
├── docker-compose.yml        # local deployment
├── docker-compose.test.yml
├── QUICKSTART.md
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
npm --prefix frontend install
```

## Testing (Phases 1–5)

Mock-based tests — no Kubernetes cluster required:

```bash
npm test
```

Run the same suite in Docker:

```bash
npm run test:docker
```

See [QUICKSTART.md](QUICKSTART.md) for local Docker deployment and UI access.

## Local Docker deployment

Run KubeRest in Docker with your local kubeconfig mounted:

```bash
npm run docker:up
```

Open **http://localhost:3000** and sign in with:

| User | Password |
|------|----------|
| `admin` | `admin` |
| `viewer` | `viewer` |

Uses `config.docker.yaml` (mounted over `config.yaml`). Requires `~/.kube/config` for API calls to your cluster.

```bash
npm run docker:logs   # follow logs
npm run docker:down   # stop
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

Backend only:

```bash
npm run dev
```

Frontend (hot reload via Vite):

```bash
npm run ui:dev
```

Build frontend bundle into `src/ui`:

```bash
npm run ui:build
```

## Web UI

The UI is a React + Vite single-page app built into `src/ui` and served by Express. Its visual system follows `DESIGN.md`: black global navigation, parchment workspace, SF/system typography, pill controls, consistent SVG icons, and the single Action Blue (`#0066cc`) interactive color.

Main workflows:

- Dashboard: aggregate replica metrics and namespace state cards.
- Scale: namespace dropdown, workload table, and admin-only scale up/down actions.
- CronJobs: schedule table plus a three-step creation wizard for intent, cadence, target, and review.
- Snapshots: read-only view of active snapshot ConfigMaps and stored replica counts.
- Validate: namespace dropdown, validation trigger, summary, and pass/fail table.
- Namespaces: admin-only cluster namespace discovery with enable/disable tracking controls.

## Available npm Scripts

- `npm start` -> starts `src/server.js`
- `npm run dev` -> watch mode for `src/server.js`
- `npm run cron` -> runs `scripts/cronEntry.js`
- `npm run ui:dev` -> starts Vite for frontend development
- `npm run ui:build` -> builds the React UI and copies assets into `src/ui`
- `npm run docker:up` -> builds and starts the local Docker deployment
- `npm run docker:down` -> stops the local Docker deployment

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
- Creates CronJobs that call `scripts/cronEntry.js` with `--mode` and `--all` or `--namespace`.
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

## API Surface

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/login` | None | Issue JWT cookie |
| POST | `/auth/logout` | Any | Clear cookie |
| GET | `/auth/me` | Any | Return `{ username, role }` |
| GET | `/api/status/namespaces` | Any | All namespace status cards |
| GET | `/api/status/namespace/:ns` | Any | Workload detail for one namespace |
| POST | `/api/scale/down` | Admin | Scale down namespace |
| POST | `/api/scale/up` | Admin | Scale up namespace |
| POST | `/api/scale/down/workload` | Admin | Scale down one Deployment/StatefulSet after snapshot |
| POST | `/api/scale/up/workload` | Admin | Restore one Deployment/StatefulSet from snapshot |
| POST | `/api/scale/preview` | Admin | Preview namespace/workload scale operation |
| GET | `/api/cron/jobs` | Any | List CronJobs |
| POST | `/api/cron/jobs` | Admin | Create CronJob (scale-up/down, all or namespace target) |
| POST | `/api/cron/:name/run` | Admin | Create a one-off Job from a CronJob |
| PATCH | `/api/cron/:name/schedule` | Admin | Update cron schedule |
| PATCH | `/api/cron/:name/suspend` | Admin | Suspend/resume CronJob |
| GET | `/api/snapshots` | Any | List active replica snapshots |
| POST | `/api/validate` | Any | Run resource validation |
| GET | `/api/admin/namespaces` | Admin | List cluster namespaces with tracking state |
| PATCH | `/api/admin/namespaces/:name` | Admin | Enable/disable namespace tracking |

All responses: `{ success: true, data: {} }` or `{ success: false, error: "" }`.

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

The workflow runs **only** when you push a version tag — not on ordinary commits to `main`.

| Event | Tags pushed to Docker Hub |
|-------|---------------------------|
| Push tag `v1.2.3` | `latest`, `1.2.3`, `1.2`, `1`, commit SHA |

Tag names must start with `v` (e.g. `v0.1.0`, `v1.0.0`).

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

```bash
git push origin main
```

Pushing to `main` alone does **not** build an image. The Docker workflow runs when you publish a release tag (see below).

#### Step 5 — Publish a release (build + push image)

Create and push a semver tag. This triggers the workflow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Or create a **GitHub Release** from the repo UI (**Releases** → **Draft a new release** → choose/create tag `v0.1.0` → **Publish release**). Pushing the tag is what starts the build.

Open **Actions** and confirm **Build and Push Docker Image** completes successfully.

#### Step 6 — Verify the image on Docker Hub

1. Go to `https://hub.docker.com/r/<your-dockerhub-username>/kuberest`.
2. Confirm tags such as `latest` and the commit SHA appear under **Tags**.

Pull the image:

```bash
docker pull <your-dockerhub-username>/kuberest:latest
```

#### Step 7 — Use the image in Kubernetes (when manifests are ready)

Reference the published image in your Deployment/CronJob manifests:

```yaml
image: <your-dockerhub-username>/kuberest:latest
```

For reproducible deploys, pin a specific semver tag (e.g. `0.1.0`) instead of `latest`.

#### Troubleshooting

| Problem | Fix |
|---------|-----|
| `denied: requested access to the resource is denied` | Check `DOCKERHUB_USERNAME` matches the account that owns the repo; token has write permission. |
| Repository does not exist on Docker Hub | Create `kuberest` repository first, or change `IMAGE_NAME` in the workflow. |
| Workflow does not run | Push a tag matching `v*` (e.g. `v0.1.0`); plain `main` pushes do not trigger builds. |
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
