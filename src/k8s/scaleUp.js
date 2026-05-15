const { appsV1 } = require("./client");
const { sendCommsEvent } = require("./comms");
const { getK8sErrorMessage } = require("./helpers");
const { clearSnapshot, readSnapshot, writeSnapshot } = require("./snapshot");
const logger = require("../logger");

async function restoreDeployment(namespace, name, replicas) {
  await appsV1.patchNamespacedDeployment({
    name,
    namespace,
    body: [{ op: "replace", path: "/spec/replicas", value: replicas }]
  });
}

async function restoreStatefulSet(namespace, name, replicas) {
  await appsV1.patchNamespacedStatefulSet({
    name,
    namespace,
    body: [{ op: "replace", path: "/spec/replicas", value: replicas }]
  });
}

async function restoreWorkload(namespace, workload) {
  const desiredReplicas = workload.replicas ?? 0;
  if (workload.kind === "Deployment") {
    await restoreDeployment(namespace, workload.name, desiredReplicas);
  } else if (workload.kind === "StatefulSet") {
    await restoreStatefulSet(namespace, workload.name, desiredReplicas);
  } else {
    throw new Error(`Unsupported workload kind in snapshot: ${workload.kind}`);
  }

  return {
    name: workload.name,
    kind: workload.kind,
    restoredReplicas: desiredReplicas
  };
}

async function scaleUp(namespace, triggeredBy) {
  const errors = [];
  const restoredWorkloads = [];

  try {
    const snapshot = await readSnapshot(namespace);

    for (const workload of snapshot.workloads) {
      try {
        restoredWorkloads.push(await restoreWorkload(namespace, workload));
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

async function scaleUpWorkload(namespace, workloadRef, triggeredBy) {
  const errors = [];
  const restoredWorkloads = [];

  try {
    if (!["Deployment", "StatefulSet"].includes(workloadRef.kind)) {
      throw new Error("kind must be Deployment or StatefulSet");
    }

    const snapshot = await readSnapshot(namespace);
    const workload = snapshot.workloads.find((entry) => entry.kind === workloadRef.kind && entry.name === workloadRef.name);

    if (!workload) {
      throw new Error(`Snapshot not found for ${workloadRef.kind}/${workloadRef.name}`);
    }

    try {
      restoredWorkloads.push(await restoreWorkload(namespace, workload));
    } catch (error) {
      const message = `Failed restoring ${workload.kind}/${workload.name}: ${getK8sErrorMessage(error)}`;
      errors.push(message);
      logger.warn({ namespace, workload: workload.name, kind: workload.kind, err: message }, "Workload scale-up restore failed");
    }

    if (errors.length === 0) {
      const remainingWorkloads = snapshot.workloads.filter((entry) => !(entry.kind === workload.kind && entry.name === workload.name));
      if (remainingWorkloads.length === 0) {
        await clearSnapshot(namespace);
      } else {
        await writeSnapshot(namespace, {
          ...snapshot,
          workloads: remainingWorkloads
        });
      }
    }

    const success = errors.length === 0;
    sendCommsEvent({
      event: "manual_scale_up",
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
    const message = error.message || "Workload scale up failed";
    logger.warn({ namespace, workload: workloadRef?.name, kind: workloadRef?.kind, err: message }, "Workload scale-up operation failed");

    sendCommsEvent({
      event: "manual_scale_up",
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
  scaleUp,
  scaleUpWorkload
};
