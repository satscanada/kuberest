const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

function purgeKubeRestModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(ROOT)) {
      delete require.cache[key];
    }
  }
}

function useTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.KUBEREST_CONFIG_PATH = path.join(__dirname, "../fixtures/config.test.yaml");
  process.env.TOOL_NAMESPACE = "kuberest-test";
  purgeKubeRestModules();
}

function sampleDeployment(name, replicas = 2) {
  return {
    metadata: { name },
    spec: { replicas },
    status: { readyReplicas: replicas }
  };
}

function installK8sMocks(overrides = {}) {
  const client = require("../../src/k8s/client");
  const callLog = [];

  const deployments = overrides.deployments || [sampleDeployment("payment-api", 2)];
  const statefulSets = overrides.statefulSets || [];
  let snapshotStore = overrides.initialSnapshot || null;

  client.appsV1 = {
    listNamespacedDeployment: async (namespace) => {
      callLog.push({ method: "listNamespacedDeployment", namespace });
      return { body: { items: deployments } };
    },
    listNamespacedStatefulSet: async (namespace) => {
      callLog.push({ method: "listNamespacedStatefulSet", namespace });
      return { body: { items: statefulSets } };
    },
    patchNamespacedDeployment: async (name, namespace) => {
      callLog.push({ method: "patchNamespacedDeployment", name, namespace });
      return {};
    },
    patchNamespacedStatefulSet: async (name, namespace) => {
      callLog.push({ method: "patchNamespacedStatefulSet", name, namespace });
      return {};
    }
  };

  client.coreV1 = {
    createNamespacedConfigMap: async (ns, body) => {
      callLog.push({ method: "createNamespacedConfigMap", name: body.metadata.name });
      snapshotStore = JSON.parse(body.data.snapshot);
      return {};
    },
    replaceNamespacedConfigMap: async (name, ns, body) => {
      callLog.push({ method: "replaceNamespacedConfigMap", name });
      snapshotStore = JSON.parse(body.data.snapshot);
      return {};
    },
    readNamespacedConfigMap: async (name) => {
      callLog.push({ method: "readNamespacedConfigMap", name });
      if (!snapshotStore) {
        const error = new Error("not found");
        error.statusCode = 404;
        throw error;
      }
      return {
        body: {
          data: {
            snapshot: JSON.stringify(snapshotStore)
          }
        }
      };
    },
    deleteNamespacedConfigMap: async (name) => {
      callLog.push({ method: "deleteNamespacedConfigMap", name });
      snapshotStore = null;
      return {};
    }
  };

  client.batchV1 = {
    listNamespacedCronJob: async () => ({
      body: {
        items: [
          {
            metadata: { name: "kuberest-scale-down", namespace: "kuberest-test" },
            spec: { schedule: "0 20 * * 5", suspend: false, timeZone: "America/Denver" }
          }
        ]
      }
    }),
    patchNamespacedCronJob: async (name, ns, body) => {
      callLog.push({ method: "patchNamespacedCronJob", name, body });
      return {};
    }
  };

  return { callLog, getSnapshot: () => snapshotStore };
}

module.exports = {
  purgeKubeRestModules,
  useTestConfig,
  installK8sMocks,
  sampleDeployment
};
