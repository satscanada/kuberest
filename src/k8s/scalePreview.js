const { appsV1 } = require("./client");
const { getK8sErrorMessage, listItems } = require("./helpers");
const { readSnapshot } = require("./snapshot");

async function listWorkloads(namespace) {
  const [deployments, statefulSets] = await Promise.all([
    appsV1.listNamespacedDeployment({ namespace }),
    appsV1.listNamespacedStatefulSet({ namespace })
  ]);

  return [
    ...listItems(deployments).map((item) => ({
      name: item.metadata?.name,
      kind: "Deployment",
      currentReplicas: item.spec?.replicas ?? 0,
      readyReplicas: item.status?.readyReplicas ?? 0
    })),
    ...listItems(statefulSets).map((item) => ({
      name: item.metadata?.name,
      kind: "StatefulSet",
      currentReplicas: item.spec?.replicas ?? 0,
      readyReplicas: item.status?.readyReplicas ?? 0
    }))
  ];
}

async function previewScaleDown(namespace, workloadRef = null) {
  try {
    const workloads = await listWorkloads(namespace);
    const affected = workloadRef
      ? workloads.filter((item) => item.kind === workloadRef.kind && item.name === workloadRef.name)
      : workloads;

    if (workloadRef && affected.length === 0) {
      throw new Error(`${workloadRef.kind}/${workloadRef.name} not found in namespace ${namespace}`);
    }

    return {
      action: "scale-down",
      namespace,
      workloads: affected.map((item) => ({
        ...item,
        snapshotReplicas: item.currentReplicas,
        targetReplicas: 0
      }))
    };
  } catch (error) {
    throw new Error(`Scale-down preview failed: ${getK8sErrorMessage(error)}`);
  }
}

async function previewScaleUp(namespace, workloadRef = null) {
  try {
    const snapshot = await readSnapshot(namespace);
    const affected = workloadRef
      ? snapshot.workloads.filter((item) => item.kind === workloadRef.kind && item.name === workloadRef.name)
      : snapshot.workloads;

    if (workloadRef && affected.length === 0) {
      throw new Error(`Snapshot not found for ${workloadRef.kind}/${workloadRef.name}`);
    }

    return {
      action: "scale-up",
      namespace,
      snapshotTimestamp: snapshot.timestamp || null,
      workloads: affected.map((item) => ({
        name: item.name,
        kind: item.kind,
        targetReplicas: item.replicas ?? 0
      }))
    };
  } catch (error) {
    throw new Error(`Scale-up preview failed: ${getK8sErrorMessage(error)}`);
  }
}

module.exports = {
  previewScaleDown,
  previewScaleUp
};
