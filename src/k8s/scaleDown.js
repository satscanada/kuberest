const { appsV1 } = require("./client");
const { sendCommsEvent } = require("./comms");
const { getK8sErrorMessage, listItems } = require("./helpers");
const { readSnapshotOrNull, writeSnapshot } = require("./snapshot");
const logger = require("../logger");

async function listDeployments(namespace) {
  try {
    const response = await appsV1.listNamespacedDeployment({ namespace });
    return listItems(response);
  } catch (error) {
    throw new Error(`K8s API error listing deployments: ${getK8sErrorMessage(error)}`);
  }
}

async function listStatefulSets(namespace) {
  try {
    const response = await appsV1.listNamespacedStatefulSet({ namespace });
    return listItems(response);
  } catch (error) {
    throw new Error(`K8s API error listing statefulsets: ${getK8sErrorMessage(error)}`);
  }
}

async function scaleDeploymentToZero(namespace, name) {
  await appsV1.patchNamespacedDeployment({
    name,
    namespace,
    body: [{ op: "replace", path: "/spec/replicas", value: 0 }]
  });
}

async function scaleStatefulSetToZero(namespace, name) {
  await appsV1.patchNamespacedStatefulSet({
    name,
    namespace,
    body: [{ op: "replace", path: "/spec/replicas", value: 0 }]
  });
}

async function findWorkload(namespace, kind, name) {
  const items = kind === "Deployment" ? await listDeployments(namespace) : await listStatefulSets(namespace);
  const workload = items.find((item) => item.metadata?.name === name);
  if (!workload) {
    throw new Error(`${kind} not found in namespace ${namespace}: ${name}`);
  }
  return {
    name,
    kind,
    previousReplicas: workload.spec?.replicas ?? 0
  };
}

function mergeSnapshotWorkloads(snapshot, workload) {
  const workloads = [...(snapshot?.workloads || [])];
  const index = workloads.findIndex((entry) => entry.kind === workload.kind && entry.name === workload.name);
  const nextEntry = {
    name: workload.name,
    kind: workload.kind,
    replicas: workload.previousReplicas
  };

  if (index >= 0) {
    workloads[index] = nextEntry;
  } else {
    workloads.push(nextEntry);
  }

  return workloads;
}

async function scaleDown(namespace, triggeredBy) {
  const errors = [];

  try {
    const [deployments, statefulSets] = await Promise.all([
      listDeployments(namespace),
      listStatefulSets(namespace)
    ]);

    const workloads = [
      ...deployments.map((item) => ({
        name: item.metadata?.name,
        kind: "Deployment",
        previousReplicas: item.spec?.replicas ?? 0
      })),
      ...statefulSets.map((item) => ({
        name: item.metadata?.name,
        kind: "StatefulSet",
        previousReplicas: item.spec?.replicas ?? 0
      }))
    ];

    const snapshot = {
      namespace,
      timestamp: new Date().toISOString(),
      workloads: workloads.map((workload) => ({
        name: workload.name,
        kind: workload.kind,
        replicas: workload.previousReplicas
      }))
    };

    await writeSnapshot(namespace, snapshot);

    for (const workload of workloads) {
      try {
        if (workload.kind === "Deployment") {
          await scaleDeploymentToZero(namespace, workload.name);
        } else {
          await scaleStatefulSetToZero(namespace, workload.name);
        }
      } catch (error) {
        const message = `Failed scaling ${workload.kind}/${workload.name}: ${getK8sErrorMessage(error)}`;
        errors.push(message);
        logger.warn({ namespace, workload: workload.name, kind: workload.kind, err: message }, "Scale-down patch failed");
      }
    }

    const success = errors.length === 0;
    sendCommsEvent({
      event: "scale_down",
      timestamp: new Date().toISOString(),
      namespace,
      triggered_by: triggeredBy,
      details: {
        workloads_affected: workloads.length - errors.length,
        status: success ? "success" : "partial"
      }
    }).catch(() => {});

    return {
      success,
      workloads,
      errors
    };
  } catch (error) {
    const message = error.message || "Scale down failed";
    logger.warn({ namespace, err: message }, "Scale-down operation failed");

    sendCommsEvent({
      event: "scale_down",
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

async function scaleDownWorkload(namespace, workloadRef, triggeredBy) {
  const errors = [];

  try {
    if (!["Deployment", "StatefulSet"].includes(workloadRef.kind)) {
      throw new Error("kind must be Deployment or StatefulSet");
    }

    const workload = await findWorkload(namespace, workloadRef.kind, workloadRef.name);
    const existingSnapshot = await readSnapshotOrNull(namespace);
    const snapshot = {
      namespace,
      timestamp: existingSnapshot?.timestamp || new Date().toISOString(),
      workloads: mergeSnapshotWorkloads(existingSnapshot, workload)
    };

    await writeSnapshot(namespace, snapshot);

    try {
      if (workload.kind === "Deployment") {
        await scaleDeploymentToZero(namespace, workload.name);
      } else {
        await scaleStatefulSetToZero(namespace, workload.name);
      }
    } catch (error) {
      const message = `Failed scaling ${workload.kind}/${workload.name}: ${getK8sErrorMessage(error)}`;
      errors.push(message);
      logger.warn({ namespace, workload: workload.name, kind: workload.kind, err: message }, "Workload scale-down patch failed");
    }

    const success = errors.length === 0;
    sendCommsEvent({
      event: "manual_scale_down",
      timestamp: new Date().toISOString(),
      namespace,
      triggered_by: triggeredBy,
      details: {
        workloads_affected: success ? 1 : 0,
        status: success ? "success" : "partial"
      }
    }).catch(() => {});

    return {
      success,
      workloads: [workload],
      errors
    };
  } catch (error) {
    const message = error.message || "Workload scale down failed";
    logger.warn({ namespace, workload: workloadRef?.name, kind: workloadRef?.kind, err: message }, "Workload scale-down operation failed");

    sendCommsEvent({
      event: "manual_scale_down",
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
  scaleDown,
  scaleDownWorkload
};
