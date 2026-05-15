const { coreV1 } = require("./client");
const { getK8sErrorMessage, isNotFound, listItems } = require("./helpers");

const TOOL_NAMESPACE = process.env.TOOL_NAMESPACE || "kuberest";
const SNAPSHOT_KEY = "snapshot";

function snapshotConfigMapName(namespace) {
  return `kuberest-snapshot-${namespace}`;
}

function parseSnapshot(snapshotRaw) {
  if (!snapshotRaw) {
    throw new Error("Snapshot ConfigMap found but snapshot data is missing");
  }

  const snapshot = JSON.parse(snapshotRaw);
  if (!Array.isArray(snapshot.workloads)) {
    throw new Error("Snapshot data is invalid: workloads must be an array");
  }
  return snapshot;
}

async function readSnapshot(namespace) {
  try {
    const response = await coreV1.readNamespacedConfigMap({
      name: snapshotConfigMapName(namespace),
      namespace: TOOL_NAMESPACE
    });
    return parseSnapshot(response?.data?.[SNAPSHOT_KEY]);
  } catch (error) {
    if (isNotFound(error)) {
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

async function readSnapshotOrNull(namespace) {
  try {
    return await readSnapshot(namespace);
  } catch (error) {
    if (error.message === `Snapshot not found for namespace ${namespace}`) {
      return null;
    }
    throw error;
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
    await coreV1.createNamespacedConfigMap({ namespace: TOOL_NAMESPACE, body: configMapBody });
    return;
  } catch (error) {
    if (error?.code !== 409 && error?.statusCode !== 409 && error?.response?.statusCode !== 409) {
      throw new Error(`K8s API error writing snapshot: ${getK8sErrorMessage(error)}`);
    }
  }

  try {
    await coreV1.replaceNamespacedConfigMap({
      name,
      namespace: TOOL_NAMESPACE,
      body: configMapBody
    });
  } catch (error) {
    throw new Error(`K8s API error replacing snapshot: ${getK8sErrorMessage(error)}`);
  }
}

async function clearSnapshot(namespace) {
  try {
    await coreV1.deleteNamespacedConfigMap({
      name: snapshotConfigMapName(namespace),
      namespace: TOOL_NAMESPACE
    });
  } catch (error) {
    throw new Error(`K8s API error clearing snapshot: ${getK8sErrorMessage(error)}`);
  }
}

async function listSnapshots() {
  try {
    const response = await coreV1.listNamespacedConfigMap({ namespace: TOOL_NAMESPACE });
    return listItems(response)
      .filter((item) => item.metadata?.name?.startsWith("kuberest-snapshot-"))
      .map((item) => {
        try {
          const snapshot = parseSnapshot(item.data?.[SNAPSHOT_KEY]);
          return {
            name: item.metadata.name,
            namespace: snapshot.namespace || item.metadata.name.replace("kuberest-snapshot-", ""),
            timestamp: snapshot.timestamp || null,
            workloads: snapshot.workloads
          };
        } catch (error) {
          return {
            name: item.metadata.name,
            namespace: item.metadata.name.replace("kuberest-snapshot-", ""),
            timestamp: null,
            workloads: [],
            error: error.message
          };
        }
      });
  } catch (error) {
    throw new Error(`K8s API error listing snapshots: ${getK8sErrorMessage(error)}`);
  }
}

module.exports = {
  clearSnapshot,
  listSnapshots,
  readSnapshot,
  readSnapshotOrNull,
  snapshotConfigMapName,
  writeSnapshot
};
