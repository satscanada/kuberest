const path = require("node:path");
const fs = require("node:fs");
const yaml = require("js-yaml");

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
  let configStore = yaml.load(fs.readFileSync(process.env.KUBEREST_CONFIG_PATH, "utf8"));

  client.appsV1 = {
    listNamespacedDeployment: async ({ namespace }) => {
      callLog.push({ method: "listNamespacedDeployment", namespace });
      return { items: deployments };
    },
    listNamespacedStatefulSet: async ({ namespace }) => {
      callLog.push({ method: "listNamespacedStatefulSet", namespace });
      return { items: statefulSets };
    },
    patchNamespacedDeployment: async ({ name, namespace }) => {
      callLog.push({ method: "patchNamespacedDeployment", name, namespace });
      return {};
    },
    patchNamespacedStatefulSet: async ({ name, namespace }) => {
      callLog.push({ method: "patchNamespacedStatefulSet", name, namespace });
      return {};
    }
  };

  client.coreV1 = {
    listNamespace: async () => ({
      items: overrides.namespaces || [
        { metadata: { name: "default" }, status: { phase: "Active" } },
        { metadata: { name: "payments" }, status: { phase: "Active" } },
        { metadata: { name: "reporting" }, status: { phase: "Active" } },
        { metadata: { name: "sandbox" }, status: { phase: "Active" } }
      ]
    }),
    listNamespacedConfigMap: async () => ({
      items: snapshotStore
        ? [
            {
              metadata: { name: "kuberest-snapshot-payments", namespace: "kuberest-test" },
              data: { snapshot: JSON.stringify(snapshotStore) }
            }
          ]
        : []
    }),
    createNamespacedConfigMap: async ({ namespace, body }) => {
      callLog.push({ method: "createNamespacedConfigMap", name: body.metadata.name });
      snapshotStore = JSON.parse(body.data.snapshot);
      return {};
    },
    replaceNamespacedConfigMap: async ({ name, body }) => {
      callLog.push({ method: "replaceNamespacedConfigMap", name });
      if (name === "kuberest-config") {
        configStore = yaml.load(body.data["config.yaml"]);
      } else {
        snapshotStore = JSON.parse(body.data.snapshot);
      }
      return {};
    },
    readNamespacedConfigMap: async ({ name }) => {
      callLog.push({ method: "readNamespacedConfigMap", name });
      if (name === "kuberest-config") {
        return {
          metadata: { name, namespace: "kuberest-test" },
          data: {
            "config.yaml": yaml.dump(configStore)
          }
        };
      }
      if (!snapshotStore) {
        const error = new Error("not found");
        error.code = 404;
        throw error;
      }
      return {
        data: {
          snapshot: JSON.stringify(snapshotStore)
        }
      };
    },
    deleteNamespacedConfigMap: async ({ name }) => {
      callLog.push({ method: "deleteNamespacedConfigMap", name });
      snapshotStore = null;
      return {};
    }
  };

  client.batchV1 = {
    listNamespacedCronJob: async () => ({
      items: [
        {
          metadata: { name: "kuberest-scale-down", namespace: "kuberest-test" },
          spec: { schedule: "0 20 * * 5", suspend: false, timeZone: "America/Denver" }
        }
      ]
    }),
    patchNamespacedCronJob: async ({ name, body }) => {
      callLog.push({ method: "patchNamespacedCronJob", name, body });
      return {};
    },
    readNamespacedCronJob: async ({ name }) => {
      callLog.push({ method: "readNamespacedCronJob", name });
      return {
        metadata: { name, namespace: "kuberest-test" },
        spec: {
          jobTemplate: {
            spec: {
              template: {
                spec: {
                  restartPolicy: "OnFailure",
                  containers: [{ name: "kuberest-cron", image: "kuberest:test" }]
                }
              }
            }
          }
        }
      };
    },
    createNamespacedJob: async ({ namespace, body }) => {
      callLog.push({ method: "createNamespacedJob", namespace, body });
      return {};
    },
    createNamespacedCronJob: async ({ namespace, body }) => {
      callLog.push({ method: "createNamespacedCronJob", namespace, body });
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
