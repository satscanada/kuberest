# Comms Hook + CronJob Entry Instructions

## Comms Hook (`src/k8s/comms.js`)

### Contract
- Reads `comms` block from config at call time
- If `comms.enabled` is false or block is missing → return immediately, no-op
- POSTs JSON payload to `comms.endpoint`
- Sets `comms.secret_header` header to `comms.secret_value` if both are present
- Applies `comms.timeout_ms` as request timeout (use `AbortController`)
- Fire-and-forget: caller does NOT await — wrap in `.catch(() => {})` at call site
- Logs success at `debug`, logs failure at `warn` — never `error` (not critical path)

### Implementation Pattern

```js
const { loadConfig } = require('../config');
const logger = require('../logger');

async function sendCommsEvent(payload) {
  const config = loadConfig();
  if (!config.comms?.enabled) return;

  const { endpoint, secret_header, secret_value, timeout_ms = 3000 } = config.comms;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout_ms);

  const headers = { 'Content-Type': 'application/json' };
  if (secret_header && secret_value) headers[secret_header] = secret_value;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    logger.debug({ status: res.status }, 'Comms event sent');
  } catch (err) {
    logger.warn({ err: err.message }, 'Comms hook failed (non-critical)');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendCommsEvent };
```

### Call Site Pattern (in scaleDown.js, scaleUp.js)

```js
// Fire and forget — do NOT await
sendCommsEvent({ event: 'scale_down', ... }).catch(() => {});
```

---

## CronJob Entry (`scripts/cronEntry.js`)

### Purpose
This is the entrypoint for the CronJob pods. It runs as a one-shot process — executes the scale action then exits.

### Usage
```
node scripts/cronEntry.js --mode scale-down --namespace payments
node scripts/cronEntry.js --mode scale-up --namespace payments
node scripts/cronEntry.js --mode scale-down --all   # all enabled namespaces from config
node scripts/cronEntry.js --mode scale-up --all
```

### Implementation Pattern

```js
const { scaleDown } = require('../src/k8s/scaleDown');
const { scaleUp } = require('../src/k8s/scaleUp');
const { loadConfig } = require('../src/config');
const logger = require('../src/logger');

async function main() {
  const args = process.argv.slice(2);
  const mode = args[args.indexOf('--mode') + 1];
  const allFlag = args.includes('--all');
  const nsFlag = args.includes('--namespace') ? args[args.indexOf('--namespace') + 1] : null;

  const config = loadConfig();
  const namespaces = allFlag
    ? config.namespaces.filter(n => n.enabled).map(n => n.name)
    : nsFlag ? [nsFlag] : [];

  if (!namespaces.length) {
    logger.error('No namespaces resolved — check --all or --namespace flag');
    process.exit(1);
  }

  const fn = mode === 'scale-down' ? scaleDown : mode === 'scale-up' ? scaleUp : null;
  if (!fn) { logger.error(`Unknown mode: ${mode}`); process.exit(1); }

  for (const ns of namespaces) {
    try {
      const result = await fn(ns, 'cron');
      logger.info({ namespace: ns, result }, `${mode} complete`);
    } catch (err) {
      logger.error({ namespace: ns, err: err.message }, `${mode} failed`);
      process.exit(1);
    }
  }
  process.exit(0);
}

main();
```

### CronJob Manifest Pattern

The K8s CronJob uses `timeZone` field (requires K8s 1.27+):

```yaml
spec:
  schedule: "0 20 * * 5"
  timeZone: "America/Denver"   # Mountain Time
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: kuberest-cron
              image: kuberest:latest
              command: ["node", "scripts/cronEntry.js", "--mode", "scale-down", "--all"]
```

Use `timeZone: "America/Denver"` for Mountain Time. Do NOT manually offset UTC.
