const k8s = require("@kubernetes/client-node");

const kubeConfig = new k8s.KubeConfig();

if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
  kubeConfig.loadFromDefault();
} else {
  kubeConfig.loadFromCluster();
}

const appsV1 = kubeConfig.makeApiClient(k8s.AppsV1Api);
const coreV1 = kubeConfig.makeApiClient(k8s.CoreV1Api);
const batchV1 = kubeConfig.makeApiClient(k8s.BatchV1Api);

module.exports = {
  appsV1,
  coreV1,
  batchV1
};
