const k8s = require("@kubernetes/client-node");

const kubeConfig = new k8s.KubeConfig();
kubeConfig.loadInCluster();

const appsV1 = kubeConfig.makeApiClient(k8s.AppsV1Api);
const coreV1 = kubeConfig.makeApiClient(k8s.CoreV1Api);
const batchV1 = kubeConfig.makeApiClient(k8s.BatchV1Api);

module.exports = {
  appsV1,
  coreV1,
  batchV1
};
