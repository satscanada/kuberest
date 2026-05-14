const { appsV1 } = require("./client");

function getK8sErrorMessage(error) {
  return (
    error?.body?.message ||
    error?.response?.body?.message ||
    error?.message ||
    "Unknown K8s error"
  );
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

function findMissingResourceFields(container) {
  const missing = [];
  const resources = container.resources || {};
  const requests = resources.requests || {};
  const limits = resources.limits || {};

  if (!requests.cpu) {
    missing.push("resources.requests.cpu");
  }
  if (!requests.memory) {
    missing.push("resources.requests.memory");
  }
  if (!limits.cpu) {
    missing.push("resources.limits.cpu");
  }
  if (!limits.memory) {
    missing.push("resources.limits.memory");
  }

  return missing;
}

async function validateNamespace(namespace) {
  const [deployments, statefulSets] = await Promise.all([
    listDeployments(namespace),
    listStatefulSets(namespace)
  ]);

  const passed = [];
  const failed = [];

  const workloads = [
    ...deployments.map((item) => ({ kind: "Deployment", item })),
    ...statefulSets.map((item) => ({ kind: "StatefulSet", item }))
  ];

  for (const workload of workloads) {
    const workloadName = workload.item.metadata?.name || "unknown";
    const containers = workload.item.spec?.template?.spec?.containers || [];

    for (const container of containers) {
      const missingFields = findMissingResourceFields(container);
      const entry = {
        workload: workloadName,
        kind: workload.kind,
        container: container.name || "unknown"
      };

      if (missingFields.length === 0) {
        passed.push(entry);
      } else {
        failed.push({
          ...entry,
          missing: missingFields
        });
      }
    }
  }

  return {
    namespace,
    passed,
    failed,
    summary: {
      total: passed.length + failed.length,
      passing: passed.length,
      failing: failed.length
    }
  };
}

module.exports = {
  validateNamespace
};
