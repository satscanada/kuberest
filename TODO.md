# TODO.md — KubeRest

Check off items as you complete them. Work one item at a time. Do not skip ahead.

---

## Phase 1 — Foundation

- [x] `package.json` — dependencies, scripts (`start`, `dev`, `cron`)
- [x] `Dockerfile` — Node 20 alpine, non-root user, copies src + scripts + config
- [x] `config.yaml` — full template with auth users (bcrypt hashed), namespaces, schedule, comms block
- [x] `src/config.js` — load-once yaml parser, exports `loadConfig()`
- [x] `src/logger.js` — pino instance, level from `LOG_LEVEL` env, exported singleton
- [x] `src/k8s/client.js` — in-cluster kubeconfig bootstrap, exports `appsV1`, `coreV1`, `batchV1`

---

## Phase 2 — Core K8s Engine

- [x] `src/k8s/comms.js` — fire-and-forget POST hook (build this first, needed by scale files)
- [x] `src/k8s/scaleDown.js` — list workloads → snapshot to ConfigMap → patch replicas to 0 → fire comms
- [x] `src/k8s/scaleUp.js` — read ConfigMap → restore replicas → clear ConfigMap → fire comms
- [x] `src/k8s/validate.js` — scan Deployments + StatefulSets for missing resource requests/limits
- [x] `src/k8s/cronManager.js` — list, suspend/resume, reschedule CronJobs

---

## Phase 3 — Express Server + Routes

- [x] `src/routes/auth.js` — login, logout, /me endpoints + `requireAuth` middleware
- [x] `src/routes/status.js` — GET /api/status/namespaces, GET /api/status/namespace/:ns
- [x] `src/routes/scale.js` — POST /api/scale/down, POST /api/scale/up (admin only)
- [x] `src/routes/validate.js` — POST /api/validate (any auth)
- [x] `src/routes/cron.js` — GET /api/cron/jobs, PATCH schedule, PATCH suspend
- [x] `src/server.js` — bootstrap Express, mount routes, serve static UI

---

## Phase 4 — CronJob Entrypoint

- [x] `scripts/cronEntry.js` — CLI entrypoint, `--mode scale-down|scale-up`, `--all` or `--namespace`

---

## Phase 5 — UI

- [x] `src/ui/css/style.css` — design tokens, layout, badges, buttons, toast
- [x] `src/ui/js/common.js` — `checkAuth()`, `apiFetch()`, `showToast()`, `applyRoleUI()`
- [x] `src/ui/login.html` — login card, POST /auth/login, redirect on success
- [x] `src/ui/dashboard.html` — namespace status cards, 30s auto-refresh
- [x] `src/ui/scale.html` — namespace selector, workload table, scale down/up buttons
- [x] `src/ui/cron.html` — CronJob table, suspend/resume/reschedule actions
- [x] `src/ui/validate.html` — namespace selector, run validation, results table

---

## Phase 6 — Kubernetes Manifests

- [x] `manifests/namespace.yaml` — `kuberest` namespace
- [x] `manifests/serviceaccount.yaml` — `kuberest` ServiceAccount
- [x] `manifests/rbac.yaml` — ClusterRole + ClusterRoleBinding with exact permissions needed
- [x] `manifests/configmap-config.yaml` — ConfigMap mounting `config.yaml` into the pod
- [x] `manifests/deployment.yaml` — Express app Deployment, env vars, volume mounts
- [x] `manifests/service.yaml` — ClusterIP service on port 3000
- [x] `manifests/cronjob-scale-down.yaml` — Friday 8 PM MT, `--mode scale-down --all`
- [x] `manifests/cronjob-scale-up.yaml` — Monday 6 AM MT, `--mode scale-up --all`

---

## Phase 7 — Polish + README

- [x] `README.md` — setup instructions, how to generate bcrypt hashes, how to deploy, how to configure comms
- [x] Add `NODE_ENV=development` fallback to `src/k8s/client.js` for local dev
- [x] Smoke test: scale down + up a test namespace end-to-end
- [x] Smoke test: validation scan returns correct pass/fail
- [x] Smoke test: CronJob suspend/resume via UI
- [x] UI revamp from `DESIGN.md` + intuitive CronJob creation wizard

---

## Deferred (Post-MVP)

- [ ] HPA suspend/resume alongside Deployments
- [ ] Audit log (append to ConfigMap or separate store)
- [ ] Slack/email fallback in comms layer
- [ ] Ingress manifest + TLS
- [ ] Multi-cluster support
- [ ] Retry logic on scale failures
