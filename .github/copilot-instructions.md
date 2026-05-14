# KubeRest — Copilot Instructions

## Project Identity
- **Name**: KubeRest
- **Purpose**: Weekend workload optimizer for Kubernetes — scales down namespaces on Friday evening, restores them Monday morning. Dev/internal tooling, not production-grade.
- **Runtime**: Inside Kubernetes cluster (in-cluster kubeconfig via `@kubernetes/client-node`)
- **Stack**: Node.js 20, Express 4, vanilla JS frontend, Kubernetes CronJobs, ConfigMap as state store

---

## Architecture Rules — Never Violate

1. **In-cluster only** — always use `kc.loadInCluster()`, never file-based kubeconfig
2. **ConfigMap is the state store** — replica snapshots are written to a ConfigMap before scale-down; scale-up reads from it. No database, no file system persistence.
3. **Snapshot before scale** — `scaleDown.js` MUST write the ConfigMap snapshot BEFORE touching any replicas
4. **Restore only what was snapshotted** — `scaleUp.js` reads the ConfigMap and restores only the workloads listed. It never assumes current state.
5. **Comms is fire-and-forget** — the notification hook must never block or throw. Wrap in try/catch, apply `timeout_ms` from config. If `comms.enabled` is false or block is absent, skip silently.
6. **Auth is JWT + httpOnly cookie** — no sessions in memory beyond the signed JWT. Users are hardcoded in `config.yaml`.
7. **CronJob entrypoint is `scripts/cronEntry.js`** — it accepts a `--mode scale-down` or `--mode scale-up` argument and calls the appropriate engine. The Express app and the cron script are the same Docker image.

---

## File Responsibilities

| File | Responsibility |
|------|---------------|
| `src/server.js` | Express app bootstrap, middleware, route mounting |
| `src/routes/auth.js` | Login/logout, JWT issue, role check middleware |
| `src/routes/scale.js` | Manual scale-down/up API endpoints |
| `src/routes/cron.js` | CronJob view/enable/disable/edit endpoints |
| `src/routes/validate.js` | Resource validation trigger + result endpoint |
| `src/routes/status.js` | Namespace + workload status endpoint |
| `src/k8s/scaleDown.js` | Snapshot replicas → write ConfigMap → patch replicas to 0 |
| `src/k8s/scaleUp.js` | Read ConfigMap → restore replicas → clear ConfigMap entry |
| `src/k8s/validate.js` | Scan Deployments + StatefulSets for missing requests/limits |
| `src/k8s/comms.js` | Fire-and-forget POST to configured endpoint |
| `src/k8s/cronManager.js` | Read/patch CronJob manifests via K8s API |
| `scripts/cronEntry.js` | CLI entrypoint for CronJob pods |
| `src/ui/` | Static HTML + vanilla JS files served by Express |
| `config.yaml` | Users, target namespaces, comms config |
| `manifests/` | All Kubernetes YAML (ServiceAccount, RBAC, CronJobs, Deployment) |

---

## Config Shape (`config.yaml`)

```yaml
auth:
  jwt_secret: "change-me-in-production"
  token_expiry: "8h"
  users:
    - username: admin
      password_hash: "<bcrypt>"
      role: admin
    - username: viewer
      password_hash: "<bcrypt>"
      role: viewer

namespaces:
  - name: payments
    enabled: true
  - name: reporting
    enabled: true

schedule:
  scale_down: "0 20 * * 5"   # 8 PM MT Friday (UTC offset applied in CronJob TZ field)
  scale_up:   "0 6 * * 1"    # 6 AM MT Monday

comms:
  enabled: true
  endpoint: "https://your-notification-service/api/events"
  secret_header: "X-KubeRest-Secret"
  secret_value: "your-static-token"
  timeout_ms: 3000
```

---

## Comms Payload Contract

```json
{
  "event": "scale_down | scale_up | manual_scale_down | manual_scale_up | validation_complete",
  "timestamp": "<ISO8601>",
  "namespace": "<namespace>",
  "triggered_by": "cron | user:<username>",
  "details": {
    "workloads_affected": 4,
    "status": "success | partial | failed"
  }
}
```

---

## UI Pages

| Route | Page |
|-------|------|
| `/` | Redirect to `/dashboard` or `/login` |
| `/login` | Login form |
| `/dashboard` | Namespace cards with replica status |
| `/scale` | Manual scale-down/up triggers per namespace |
| `/cron` | CronJob schedule viewer + editor |
| `/validate` | Resource validation trigger + results table |

---

## RBAC Roles

| Role | Permissions |
|------|-------------|
| `admin` | All actions — scale, validate, edit cron, login/logout |
| `viewer` | Read-only — view status, view validation results, view cron schedule |

---

## Kubernetes RBAC Required

The ServiceAccount needs:
- `get/list/watch/patch/update` on `deployments`, `statefulsets` in target namespaces
- `get/list/watch/create/update/patch` on `configmaps` in the tool's own namespace
- `get/list/watch/patch/update` on `cronjobs` in the tool's own namespace

---

## Coding Conventions

- `async/await` throughout — no raw Promise chains
- All K8s API errors caught and returned as `{ success: false, error: message }`
- No `console.log` in production paths — use a lightweight logger (e.g. `pino`) with level gating
- Config loaded once at startup via a `config.js` module — never re-read mid-request
- Environment variables override config.yaml values where marked

---

## What This Is NOT

- Not production-grade — no audit trail, no retry logic, no HA
- Not multi-cluster
- Not HPA-aware (does not touch HPAs)
- No persistent database
