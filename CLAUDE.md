# CLAUDE.md — KubeRest

## What This Is

KubeRest is a Node.js-based weekend workload optimizer that runs inside a Kubernetes cluster. It scales down configured namespaces on Friday evenings and restores them Monday mornings, using a CronJob + ConfigMap pattern. It includes a lightweight Express UI for manual control, resource validation, and CronJob management.

This is a **dev/internal tool** — not production-grade. No audit log, no HA, no retry logic.

---

## Hard Constraints — Never Override

| # | Constraint |
|---|-----------|
| 1 | In-cluster kubeconfig only — `kc.loadInCluster()` |
| 2 | ConfigMap is the only state store — no DB, no filesystem persistence |
| 3 | Snapshot BEFORE scale-down — if ConfigMap write fails, abort entire operation |
| 4 | Scale-up restores ONLY what is in the ConfigMap — never assumes current state |
| 5 | Comms hook is fire-and-forget — never awaited, never blocks, never throws to caller |
| 6 | CronJob entrypoint is `scripts/cronEntry.js` — same Docker image as the server |
| 7 | Auth = JWT in httpOnly cookie — users hardcoded in `config.yaml` |
| 8 | CronJob timezone = `America/Denver` via K8s `timeZone` field (requires K8s 1.27+) |

---

## Tech Stack

| Concern | Library |
|---------|---------|
| Runtime | Node.js 20 |
| HTTP server | Express 4 |
| K8s client | `@kubernetes/client-node` |
| Config parsing | `js-yaml` |
| Auth | `jsonwebtoken` + `bcryptjs` |
| Logging | `pino` |
| Frontend | Vanilla JS + HTML (no build step) |

---

## Project Structure

```
kuberest/
├── src/
│   ├── server.js
│   ├── config.js
│   ├── logger.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── scale.js
│   │   ├── cron.js
│   │   ├── validate.js
│   │   └── status.js
│   ├── k8s/
│   │   ├── client.js
│   │   ├── scaleDown.js
│   │   ├── scaleUp.js
│   │   ├── validate.js
│   │   ├── cronManager.js
│   │   └── comms.js
│   └── ui/
│       ├── login.html
│       ├── dashboard.html
│       ├── scale.html
│       ├── cron.html
│       ├── validate.html
│       ├── css/style.css
│       └── js/common.js
├── scripts/
│   └── cronEntry.js
├── manifests/
│   ├── namespace.yaml
│   ├── serviceaccount.yaml
│   ├── rbac.yaml
│   ├── configmap-config.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── cronjob-scale-down.yaml
│   └── cronjob-scale-up.yaml
├── config.yaml
├── Dockerfile
├── package.json
├── CLAUDE.md
├── LOAD_CONTEXT.md
└── TODO.md
```

---

## ConfigMap Naming Convention

| ConfigMap | Purpose |
|-----------|---------|
| `kuberest-config` | Tool config (mounted from config.yaml) |
| `kuberest-snapshot-<namespace>` | Replica snapshot for namespace before scale-down |

All ConfigMaps live in the tool's own namespace (`TOOL_NAMESPACE` env var, default: `kuberest`).

---

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `TOOL_NAMESPACE` | `kuberest` | Namespace where tool and its ConfigMaps live |
| `LOG_LEVEL` | `info` | Pino log level |
| `PORT` | `3000` | Express listen port |

---

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
| GET | `/api/cron/jobs` | Any | List CronJobs |
| PATCH | `/api/cron/:name/schedule` | Admin | Update cron schedule |
| PATCH | `/api/cron/:name/suspend` | Admin | Suspend/resume CronJob |
| POST | `/api/validate` | Any | Run resource validation |

---

## Build State

| Checkpoint | Status |
|-----------|--------|
| `.github/copilot-instructions.md` | ✅ Complete |
| `.github/prompts/loadcontext.prompt.md` | ✅ Complete |
| `.github/instructions/*.instructions.md` | ✅ Complete (4 files) |
| `CLAUDE.md` | ✅ Complete |
| `LOAD_CONTEXT.md` | ⬜ Next |
| `TODO.md` | ⬜ Pending |
| Source code | ⬜ Not started |
| Manifests | ⬜ Not started |

---

## Known Decisions & Rationale

- **No HPA awareness**: Scaling down HPAs alongside Deployments adds complexity. Out of scope for MVP. Document as known gap.
- **ConfigMap as state**: Simple, no external dependency, fits the dev-tool philosophy. Tradeoff: not transactional. Acceptable for weekend scheduling use case.
- **No retry on comms**: Downstream service owns delivery. KubeRest is just a signal emitter.
- **bcrypt for password hashing**: Even though users are hardcoded, passwords should not be plaintext in config.yaml. Generate hashes with `node -e "const b=require('bcryptjs'); console.log(b.hashSync('yourpassword',10))"`.
