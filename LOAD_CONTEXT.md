# LOAD_CONTEXT.md — KubeRest

Load this file at the start of every dev session. It tells you exactly where the project is and what to build next.

---

## Current Status

**Phase**: Scaffold complete — source code not yet started
**Last completed**: All checkpoint documentation (`.github/`, `CLAUDE.md`, `LOAD_CONTEXT.md`, `TODO.md`)
**Next task**: Begin Phase 1 — Foundation (see TODO.md)

---

## Build Phases

### Phase 1 — Foundation
`package.json`, `Dockerfile`, `config.yaml`, `src/config.js`, `src/logger.js`, `src/k8s/client.js`

### Phase 2 — Core K8s Engine
`src/k8s/scaleDown.js`, `src/k8s/scaleUp.js`, `src/k8s/validate.js`, `src/k8s/cronManager.js`, `src/k8s/comms.js`

### Phase 3 — Express Server + Routes
`src/server.js`, `src/routes/auth.js`, `src/routes/scale.js`, `src/routes/cron.js`, `src/routes/validate.js`, `src/routes/status.js`

### Phase 4 — CronJob Entrypoint
`scripts/cronEntry.js`

### Phase 5 — UI
`src/ui/login.html`, `src/ui/dashboard.html`, `src/ui/scale.html`, `src/ui/cron.html`, `src/ui/validate.html`, `src/ui/css/style.css`, `src/ui/js/common.js`

### Phase 6 — Kubernetes Manifests
All files in `manifests/`

---

## How to Resume a Session

1. Read `CLAUDE.md` — architecture constraints, hard rules, tech stack
2. Read this file — current phase and next task
3. Read `TODO.md` — pick the first unchecked item in the current phase
4. Read the relevant `.github/instructions/*.instructions.md` for the files you're building
5. Build one file at a time, confirm before moving to next

---

## Critical Reminders for Every Session

- `kc.loadInCluster()` — never file-based kubeconfig
- Write ConfigMap BEFORE patching replicas on scale-down
- Comms is always fire-and-forget: `sendCommsEvent({...}).catch(() => {})`
- CronJob TZ = `America/Denver` via K8s `timeZone` field
- Config loaded once via `src/config.js` — never re-read per request
- All API responses: `{ success: true, data: {} }` or `{ success: false, error: "" }`

---

## Environment Setup for Local Testing (out-of-cluster dev only)

> For local dev only — the production image always uses in-cluster config.

```bash
# Point to a local cluster
export KUBECONFIG=~/.kube/config
# Override in-cluster detection
export NODE_ENV=development
```

Add a `loadConfig()` fallback in `src/k8s/client.js` that uses `loadFromDefault()` when `NODE_ENV=development` and `loadInCluster()` otherwise.

---

## Dependency Versions (pin these)

```json
{
  "@kubernetes/client-node": "^0.21.0",
  "express": "^4.19.0",
  "js-yaml": "^4.1.0",
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "pino": "^9.0.0",
  "cookie-parser": "^1.4.6"
}
```
