const { appsV1, coreV1 } = require("./client");
const { sendCommsEvent } = require("./comms");
const logger = require("../logger");

const TOOL_NAMESPACE = process.env.TOOL_NAMESPACE || "kuberest";
const SNAPSHOT_KEY = "snapshot";
const PATCH_OPTIONS = {
  headers: {
    "Content-Type": "application/merge-patch+json"
  }
};

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
    const snapshotRaw = response.body?.data?.[SNAPSHOT_KEY];

    if (!snapshotRaw) {
      throw new Error("Snapshot ConfigMap found but snapshot data is missing");
    }

    const snapshot = JSON.parse(snapshotRaw);
    if (!Array.isArray(snapshot.workloads)) {
      throw new Error("Snapshot data is invalid: workloads must be an array");
    }

    return snapshot;
  } catch (error) {
    if (error?.response?.statusCode === 404 || error?.statusCode === 404) {
      throw new Error(`Snapshot not found for namespace ${namespace}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Snapshot parse failed: ${error.message}`);
    }
    if (error.message?.startsWith("Snapshot")) {
      throw error;
    }
    throw new Error(`K8s API error reading snapshot: ${getK8sErrorMessage(error)}`);
  }
}

async function clearSnapshot(namespace) {
  try {
    await coreV1.deleteNamespacedConfigMap(snapshotConfigMapName(namespace), TOOL_NAMESPACE);
  } catch (error) {
    throw new Error(`K8s API error clearing snapshot: ${getK8sErrorMessage(error)}`);
  }
}

async function restoreDeployment(namespace, name, replicas) {
  await appsV1.patchNamespacedDeployment(
    name,
    namespace,
    { spec: { replicas } },
    undefined,
    undefined,
    undefined,
    undefined,
    PATCH_OPTIONS
  );
}

async function restoreStatefulSet(namespace, name, replicas) {
  await appsV1.patchNamespacedStatefulSet(
    name,
    namespace,
    { spec: { replicas } },
    undefined,
    undefined,
    undefined,
    undefined,
    PATCH_OPTIONS
  );
}

async function scaleUp(namespace, triggeredBy) {
  const errors = [];
  const restoredWorkloads = [];

  try {
    const snapshot = await readSnapshot(namespace);

    for (const workload of snapshot.workloads) {
      const desiredReplicas = workload.replicas ?? 0;
      try {
        if (workload.kind === "Deployment") {
          await restoreDeployment(namespace, workload.name, desiredReplicas);
        } else if (workload.kind === "StatefulSet") {
          await restoreStatefulSet(namespace, workload.name, desiredReplicas);
        } else {
          throw new Error(`Unsupported workload kind in snapshot: ${workload.kind}`);
        }

        restoredWorkloads.push({
          name: workload.name,
          kind: workload.kind,
          restoredReplicas: desiredReplicas
        });
      } catch (error) {
        const message = `Failed restoring ${workload.kind}/${workload.name}: ${getK8sErrorMessage(error)}`;
        errors.push(message);
        logger.warn({ namespace, workload: workload.name, kind: workload.kind, err: message }, "Scale-up restore failed");
      }
    }

    if (errors.length === 0) {
      await clearSnapshot(namespace);
    }

    const success = errors.length === 0;
    sendCommsEvent({
      event: "scale_up",
      timestamp: new Date().toISOString(),
      namespace,
      triggered_by: triggeredBy,
      details: {
        workloads_affected: restoredWorkloads.length,
        status: success ? "success" : "partial"
      }
    }).catch(() => {});

    return {
      success,
      workloads: restoredWorkloads,
      errors
    };
  } catch (error) {
    const message = error.message || "Scale up failed";
    logger.warn({ namespace, err: message }, "Scale-up operation failed");

    sendCommsEvent({
      event: "scale_up",
      timestamp: new Date().toISOString(),
      namespace,
      triggered_by: triggeredBy,
      details: {
        workloads_affected: 0,
        status: "failed"
      }
    }).catch(() => {});

    return {
      success: false,
      workloads: [],
      errors: [message]
    };
  }
}

module.exports = {
  scaleUp
};
