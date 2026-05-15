# KubeRest Quickstart

Get KubeRest running locally, run the test suite, and use the web UI.

## Prerequisites

- Node.js 20+
- Docker Desktop (or Docker Engine + Compose)
- Kubernetes cluster with kubeconfig at `~/.kube/config` (for live API/UI data)

## 1. Install dependencies

```bash
git clone https://github.com/satscanada/kuberest.git
cd kuberest
npm install
```

## 2. Run tests (Phases 1–5)

```bash
npm test
```

Expected: **24 tests passing** (config, K8s engine, API, cron CLI, UI static assets).

In Docker:

```bash
npm run test:docker
```

## 3. Run locally with Docker (recommended)

Build and start the app:

```bash
npm run docker:up
```

| Command | Action |
|---------|--------|
| `npm run docker:up` | Build image and start on port 3000 |
| `npm run docker:logs` | Tail application logs |
| `npm run docker:down` | Stop and remove container |

Open **http://localhost:3000** in your browser.

### Docker login credentials

`config.docker.yaml` is mounted into the container:

| User | Password | Role |
|------|----------|------|
| `admin` | `admin` | Full access (scale, cron edit) |
| `viewer` | `viewer` | Read-only (scale/cron actions hidden) |

### What Docker Compose does

- Builds from `Dockerfile`
- Sets `NODE_ENV=development` and mounts `~/.kube/config` at `/kube/config`
- Rewrites `127.0.0.1` / `localhost` API URLs to `desktop-control-plane` for Docker Desktop/local clusters where kubeconfig points to localhost
- Mounts `config.docker.yaml` as `/app/config.yaml`
- Exposes port **3000**

## 4. UI pages

| URL | Purpose |
|-----|---------|
| `/login` | Sign in |
| `/dashboard` | Namespace status cards and aggregate replica metrics (auto-refresh 30s) |
| `/scale` | Namespace dropdown, workload table, and manual scale down/up per namespace or workload (admin) |
| `/cron` | View/edit CronJob schedules and create jobs with the admin wizard |
| `/snapshots` | Inspect active snapshot ConfigMaps and stored replica counts |
| `/validate` | Namespace dropdown and resource requests/limits validation scan |
| Namespaces tab | Admin-only namespace discovery and tracking enable/disable controls |

The current UI is built from `frontend/` with React + Vite and served from `src/ui/`. Run `npm run ui:build` after changing frontend files.

## 5. Local development without Docker

```bash
export KUBECONFIG=~/.kube/config
export NODE_ENV=development
export LOG_LEVEL=debug
npm run dev
```

React UI hot reload:

```bash
npm run ui:dev
```

Edit `config.yaml` for credentials, or copy `config.docker.yaml` values.

## 6. API smoke test (optional)

```bash
curl -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}'

curl -b cookies.txt http://localhost:3000/api/status/namespaces
```

## 7. Cron entrypoint

```bash
npm run cron -- --mode scale-down --all
npm run cron -- --mode scale-up --namespace payments
```

## 8. Publish Docker image (CI)

Push a version tag to trigger GitHub Actions → Docker Hub:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 9. What's next

| Phase | Status |
|-------|--------|
| 1–7 | Done |
| Deferred | HPA support, audit log, ingress/TLS, retries, multi-cluster |

## Test suite credentials

`tests/fixtures/config.test.yaml` uses **admin** / **password** and **viewer** / **password** for automated tests only.
