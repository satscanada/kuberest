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

async function listDeployments(namespace) {
  try {
    const response = await appsV1.listNamespacedDeployment(namespace);
    return response.body.items || [];
  } catch (error) {
    throw new Error(`K8s API error listing deployments: ${getK8sErrorMessage(error)}`);
  }
}

async function listStatefulSets(namespace) {
  try {
    const response = await appsV1.listNamespacedStatefulSet(namespace);
    return response.body.items || [];
  } catch (error) {
    throw new Error(`K8s API error listing statefulsets: ${getK8sErrorMessage(error)}`);
  }
}

async function writeSnapshot(namespace, snapshot) {
  const name = snapshotConfigMapName(namespace);
  const configMapBody = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name,
      namespace: TOOL_NAMESPACE
    },
    data: {
      [SNAPSHOT_KEY]: JSON.stringify(snapshot)
    }
  };

  try {
    await coreV1.createNamespacedConfigMap(TOOL_NAMESPACE, configMapBody);
    return;
  } catch (error) {
    if (error?.response?.statusCode !== 409 && error?.statusCode !== 409) {
      throw new Error(`K8s API error writing snapshot: ${getK8sErrorMessage(error)}`);
    }
  }

  try {
    await coreV1.replaceNamespacedConfigMap(name, TOOL_NAMESPACE, configMapBody);
  } catch (error) {
    throw new Error(`K8s API error replacing snapshot: ${getK8sErrorMessage(error)}`);
  }
}

async function scaleDeploymentToZero(namespace, name) {
  await appsV1.patchNamespacedDeployment(
    name,
    namespace,
    { spec: { replicas: 0 } },
    undefined,
    undefined,
    undefined,
    undefined,
    PATCH_OPTIONS
  );
}

async function scaleStatefulSetToZero(namespace, name) {
  await appsV1.patchNamespacedStatefulSet(
    name,
    namespace,
    { spec: { replicas: 0 } },
    undefined,
    undefined,
    undefined,
    undefined,
    PATCH_OPTIONS
  );
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

    // Hard invariant: snapshot write must succeed before any scale-down patches.
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

module.exports = {
  scaleDown
};
