const { batchV1 } = require("./client");

const TOOL_NAMESPACE = process.env.TOOL_NAMESPACE || "kuberest";
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

async function listCronJobs() {
  try {
    const response = await batchV1.listNamespacedCronJob(TOOL_NAMESPACE);
    return (response.body.items || []).map((item) => ({
      name: item.metadata?.name,
      namespace: item.metadata?.namespace,
      schedule: item.spec?.schedule,
      suspend: Boolean(item.spec?.suspend),
      timeZone: item.spec?.timeZone || null
    }));
  } catch (error) {
    throw new Error(`K8s API error listing cronjobs: ${getK8sErrorMessage(error)}`);
  }
}

async function setCronJobSuspend(name, suspend) {
  try {
    await batchV1.patchNamespacedCronJob(
      name,
      TOOL_NAMESPACE,
      { spec: { suspend } },
      undefined,
      undefined,
      undefined,
      undefined,
      PATCH_OPTIONS
    );
    return {
      name,
      suspend
    };
  } catch (error) {
    throw new Error(`K8s API error patching cronjob suspend: ${getK8sErrorMessage(error)}`);
  }
}

async function updateCronJobSchedule(name, schedule) {
  try {
    await batchV1.patchNamespacedCronJob(
      name,
      TOOL_NAMESPACE,
      { spec: { schedule } },
      undefined,
      undefined,
      undefined,
      undefined,
      PATCH_OPTIONS
    );
    return {
      name,
      schedule
    };
  } catch (error) {
    throw new Error(`K8s API error patching cronjob schedule: ${getK8sErrorMessage(error)}`);
  }
}

module.exports = {
  listCronJobs,
  setCronJobSuspend,
  updateCronJobSchedule
};
