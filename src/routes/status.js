const express = require("express");
const { requireAuth } = require("./auth");
const { loadConfig } = require("../config");
const { appsV1, coreV1 } = require("../k8s/client");
const logger = require("../logger");

const router = express.Router();
const config = loadConfig();
const TOOL_NAMESPACE = process.env.TOOL_NAMESPACE || "kuberest";

function getK8sErrorMessage(error) {
  return (
    error?.body?.message ||
    error?.response?.body?.message ||
    error?.message ||
    "Unknown K8s error"
  );
}

function snapshotConfigMapName(namespace) {
  return `kuberest-snapshot-${namespace}`;
}

async function readSnapshot(namespace) {
  try {
    const response = await coreV1.readNamespacedConfigMap(snapshotConfigMapName(namespace), TOOL_NAMESPACE);
    const snapshotRaw = response.body?.data?.snapshot;

    if (!snapshotRaw) {
      return null;
    }

    return JSON.parse(snapshotRaw);
  } catch (error) {
    if (error?.response?.statusCode === 404 || error?.statusCode === 404) {
      return null;
    }
    throw new Error(`K8s API error reading snapshot: ${getK8sErrorMessage(error)}`);
  }
}

async function listWorkloads(namespace) {
  const [deployments, statefulSets] = await Promise.all([
    appsV1.listNamespacedDeployment(namespace),
    appsV1.listNamespacedStatefulSet(namespace)
  ]);

  const deploymentItems = (deployments.body.items || []).map((item) => ({
    name: item.metadata?.name,
    kind: "Deployment",
    replicas: item.status?.readyReplicas ?? 0,
    desired: item.spec?.replicas ?? 0
  }));

  const statefulSetItems = (statefulSets.body.items || []).map((item) => ({
    name: item.metadata?.name,
    kind: "StatefulSet",
    replicas: item.status?.readyReplicas ?? 0,
    desired: item.spec?.replicas ?? 0
  }));

  return [...deploymentItems, ...statefulSetItems];
}

function summarizeWorkloads(workloads) {
  return {
    workloadCount: workloads.length,
    totalReplicas: workloads.reduce((sum, item) => sum + item.replicas, 0),
    desiredReplicas: workloads.reduce((sum, item) => sum + item.desired, 0)
  };
}

router.get("/namespaces", requireAuth(), async (req, res) => {
  try {
    const namespaces = await Promise.all(
      config.namespaces.map(async (entry) => {
        const snapshot = await readSnapshot(entry.name);
        let workloads = [];
        let summary = { workloadCount: 0, totalReplicas: 0, desiredReplicas: 0 };

        try {
          workloads = await listWorkloads(entry.name);
          summary = summarizeWorkloads(workloads);
        } catch (error) {
          logger.warn({ namespace: entry.name, err: getK8sErrorMessage(error) }, "Failed to list workloads for status");
        }

        return {
          name: entry.name,
          enabled: entry.enabled,
          hasSnapshot: Boolean(snapshot),
          snapshotTimestamp: snapshot?.timestamp || null,
          scaledDown: Boolean(snapshot) && summary.desiredReplicas === 0,
          ...summary
        };
      })
    );

    return res.json({ success: true, data: namespaces });
  } catch (error) {
    logger.error({ err: error.message }, "Failed to fetch namespace status");
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/namespace/:ns", requireAuth(), async (req, res) => {
  const namespace = req.params.ns;
  const configured = config.namespaces.find((entry) => entry.name === namespace);

  if (!configured) {
    return res.status(400).json({ success: false, error: `Namespace not configured: ${namespace}` });
  }

  try {
    const [workloads, snapshot] = await Promise.all([
      listWorkloads(namespace),
      readSnapshot(namespace)
    ]);

    return res.json({
      success: true,
      data: {
        namespace,
        enabled: configured.enabled,
        hasSnapshot: Boolean(snapshot),
        workloads,
        snapshot,
        summary: summarizeWorkloads(workloads)
      }
    });
  } catch (error) {
    logger.error({ namespace, err: error.message }, "Failed to fetch namespace detail");
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
