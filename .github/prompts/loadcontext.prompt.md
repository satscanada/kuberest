# /loadcontext — KubeRest

Use this prompt at the start of any new AI-assisted session to restore full project context.

---

## Paste this into your AI assistant to load context:

```
I am continuing development on KubeRest — a Node.js weekend workload optimizer that runs inside a Kubernetes cluster.

Please read the following files before assisting me:
1. CLAUDE.md — architecture decisions, constraints, and build state
2. LOAD_CONTEXT.md — current progress and next task
3. TODO.md — full task checklist with status
4. .github/copilot-instructions.md — coding conventions, file responsibilities, config shape

Key invariants to never violate:
- In-cluster kubeconfig only (kc.loadInCluster())
- ConfigMap is the ONLY state store — snapshot before scale-down, restore on scale-up
- Comms hook is fire-and-forget — never blocks, never throws
- CronJob entrypoint is scripts/cronEntry.js with --mode flag
- Auth is JWT + httpOnly cookie, users hardcoded in config.yaml

Current stack: Node.js 20, Express 4, @kubernetes/client-node, vanilla JS frontend, js-yaml, pino, bcryptjs, jsonwebtoken

Wait for me to tell you the current task before generating any code.
```

---

## Quick Reference

| Concern | Location |
|---------|----------|
| K8s scale logic | `src/k8s/scaleDown.js`, `src/k8s/scaleUp.js` |
| Validation | `src/k8s/validate.js` |
| Comms hook | `src/k8s/comms.js` |
| CronJob manager | `src/k8s/cronManager.js` |
| Express routes | `src/routes/` |
| UI pages | `src/ui/` |
| K8s manifests | `manifests/` |
| CronJob entrypoint | `scripts/cronEntry.js` |
| Config | `config.yaml` |
| Build state | `CLAUDE.md` |
| Next task | `LOAD_CONTEXT.md` |
