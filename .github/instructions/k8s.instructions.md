# Kubernetes Integration Instructions

## Client Bootstrap

Always bootstrap the K8s client using in-cluster config:

```js
const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();
kc.loadInCluster();

const appsV1 = kc.makeApiClient(k8s.AppsV1Api);
const coreV1 = kc.makeApiClient(k8s.CoreV1Api);
const batchV1 = kc.makeApiClient(k8s.BatchV1Api);
```

Export these clients from a shared `src/k8s/client.js` module. Never instantiate new clients per request.

---

## Scale-Down Contract (`src/k8s/scaleDown.js`)

```
Input:  namespace (string), triggeredBy (string)
Output: { success, workloads: [{ name, kind, previousReplicas }], errors: [] }

Steps:
1. List all Deployments in namespace
2. List all StatefulSets in namespace
3. Build snapshot object: { namespace, timestamp, workloads: [...] }
4. Write snapshot to ConfigMap: kuberest-snapshot-<namespace> in tool's own namespace
5. Patch each Deployment replicas → 0
6. Patch each StatefulSet replicas → 0
7. Fire comms hook (non-blocking)
8. Return result
```

**CRITICAL**: Step 4 (write ConfigMap) must complete successfully before step 5 begins. If ConfigMap write fails, abort and return error — do NOT scale anything down.

---

## Scale-Up Contract (`src/k8s/scaleUp.js`)

```
Input:  namespace (string), triggeredBy (string)
Output: { success, workloads: [{ name, kind, restoredReplicas }], errors: [] }

Steps:
1. Read ConfigMap: kuberest-snapshot-<namespace>
2. If ConfigMap missing → return error, do not proceed
3. For each workload in snapshot, patch replicas back to snapshotted value
4. Delete or clear ConfigMap entry after successful restore
5. Fire comms hook (non-blocking)
6. Return result
```

---

## ConfigMap Schema

```json
{
  "apiVersion": "v1",
  "kind": "ConfigMap",
  "metadata": {
    "name": "kuberest-snapshot-<namespace>",
    "namespace": "<tool-namespace>"
  },
  "data": {
    "snapshot": "{\"namespace\":\"payments\",\"timestamp\":\"2026-05-02T02:00:00Z\",\"workloads\":[{\"name\":\"payment-api\",\"kind\":\"Deployment\",\"replicas\":3}]}"
  }
}
```

The `snapshot` key holds a JSON string. Parse it with `JSON.parse(cm.data.snapshot)`.

---

## CronJob Management (`src/k8s/cronManager.js`)

- List CronJobs: `batchV1.listNamespacedCronJob(toolNamespace)`
- Suspend a CronJob: patch `spec.suspend = true`
- Resume a CronJob: patch `spec.suspend = false`
- Update schedule: patch `spec.schedule = newCronExpression`
- Never delete CronJobs from the UI — only suspend/resume/reschedule

---

## Validation Contract (`src/k8s/validate.js`)

```
Input:  namespace (string)
Output: { namespace, passed: [], failed: [], summary: { total, passing, failing } }

For each Deployment and StatefulSet:
  For each container in spec.template.spec.containers:
    Check: resources.requests.cpu exists
    Check: resources.requests.memory exists
    Check: resources.limits.cpu exists
    Check: resources.limits.memory exists
    If any missing → add to failed[] with details of which fields are absent
```

---

## Error Handling

All K8s API calls must be wrapped:

```js
try {
  const res = await appsV1.listNamespacedDeployment(namespace);
  return res.body.items;
} catch (err) {
  const msg = err?.body?.message || err.message || 'Unknown K8s error';
  throw new Error(`K8s API error: ${msg}`);
}
```

Never let raw K8s HTTP errors surface to the UI.

---

## Namespace for Tool Resources

The tool's own namespace (where ConfigMaps and CronJobs live) is read from the environment:

```js
const TOOL_NAMESPACE = process.env.TOOL_NAMESPACE || 'kuberest';
```

Inject this as an env var in the Deployment manifest.
