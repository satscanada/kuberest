# KubeRest Quickstart

Get KubeRest running and verify Phases 1–4 (foundation, K8s engine, API, cron entrypoint) before building the UI and manifests.

## Prerequisites

- Node.js 20+
- Docker (for `npm run test:docker` and image builds)
- Kubernetes cluster (for in-cluster deployment; optional for local unit tests)

## 1. Install dependencies

```bash
git clone https://github.com/satscanada/kuberest.git
cd kuberest
npm install
```

## 2. Run the test suite (Phases 1–4)

Tests use mocked Kubernetes clients — no live cluster required.

```bash
npm test
```

Expected: **16 tests passing** across config, K8s engine, API routes, and cron CLI helpers.

### Run tests in Docker

```bash
npm run test:docker
```

This uses `docker-compose.test.yml` to run the same suite inside `node:20-alpine`.

## 3. Configure the app

Copy and edit `config.yaml`:

| Section | What to set |
|---------|-------------|
| `auth.jwt_secret` | Random secret for JWT signing |
| `auth.users` | Usernames + bcrypt `password_hash` values |
| `namespaces` | Target namespaces and `enabled` flag |
| `schedule` | Default cron expressions (used by manifests later) |
| `comms` | Optional webhook (`enabled: false` to skip) |

Generate a bcrypt hash:

```bash
node -e "const b=require('bcryptjs'); console.log(b.hashSync('yourpassword',10))"
```

## 4. Local development (out of cluster)

Point at a local kubeconfig and use development mode:

```bash
export KUBECONFIG=~/.kube/config
export NODE_ENV=development
export LOG_LEVEL=debug
npm run dev
```

Server listens on `http://localhost:3000`.

> UI pages (Phase 5) are not built yet. Use the API directly (see below).

## 5. API smoke test

Start the server (`npm run dev`), then:

### Login (sets httpOnly cookie)

```bash
curl -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"yourpassword"}'
```

### Check session

```bash
curl -b cookies.txt http://localhost:3000/auth/me
```

### Namespace status

```bash
curl -b cookies.txt http://localhost:3000/api/status/namespaces
```

### Manual scale-down (admin)

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/scale/down \
  -H 'Content-Type: application/json' \
  -d '{"namespace":"payments"}'
```

### List CronJobs

```bash
curl -b cookies.txt http://localhost:3000/api/cron/jobs
```

## 6. Cron entrypoint (Phase 4)

Inside the cluster (or locally with `NODE_ENV=development` and a valid kubeconfig):

```bash
# Scale down all enabled namespaces
npm run cron -- --mode scale-down --all

# Scale up one namespace
npm run cron -- --mode scale-up --namespace payments
```

## 7. Build and publish Docker image

Images are built **only when you push a version tag** (see README CI/CD section).

```bash
git tag v0.1.0
git push origin v0.1.0
```

Pull from Docker Hub after the GitHub Action completes:

```bash
docker pull <your-dockerhub-username>/kuberest:0.1.0
```

## 8. What's next

| Phase | Status | Contents |
|-------|--------|----------|
| 1–4 | Done | Foundation, K8s engine, API, cron entrypoint |
| 5 | Next | Web UI (`src/ui/`) |
| 6 | Pending | Kubernetes manifests |
| 7 | Partial | README done; cluster smoke tests pending |

See `TODO.md` for the full checklist.

## Test credentials (test suite only)

The file `tests/fixtures/config.test.yaml` defines:

- **admin** / **password**
- **viewer** / **password**

These are for automated tests only — do not use in production `config.yaml`.
