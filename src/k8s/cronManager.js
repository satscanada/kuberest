const { batchV1 } = require("./client");
const { getK8sErrorMessage, listItems } = require("./helpers");

const TOOL_NAMESPACE = process.env.TOOL_NAMESPACE || "kuberest";
async function listCronJobs() {
  try {
    const response = await batchV1.listNamespacedCronJob({ namespace: TOOL_NAMESPACE });
    return listItems(response).map((item) => ({
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
    await batchV1.patchNamespacedCronJob({
      name,
      namespace: TOOL_NAMESPACE,
      body: [{ op: "replace", path: "/spec/suspend", value: suspend }]
    });
    return { name, suspend };
  } catch (error) {
    throw new Error(`K8s API error patching cronjob suspend: ${getK8sErrorMessage(error)}`);
  }
}

async function updateCronJobSchedule(name, schedule) {
  try {
    await batchV1.patchNamespacedCronJob({
      name,
      namespace: TOOL_NAMESPACE,
      body: [{ op: "replace", path: "/spec/schedule", value: schedule }]
    });
    return { name, schedule };
  } catch (error) {
    throw new Error(`K8s API error patching cronjob schedule: ${getK8sErrorMessage(error)}`);
  }
}

async function runCronJobNow(name) {
  try {
    const cronJob = await batchV1.readNamespacedCronJob({
      name,
      namespace: TOOL_NAMESPACE
    });
    const jobName = `${name}-manual-${Date.now()}`.slice(0, 63).replace(/-$/, "");
    const body = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        namespace: TOOL_NAMESPACE,
        labels: {
          "app.kubernetes.io/managed-by": "kuberest",
          "kuberest.io/source-cronjob": name
        }
      },
      spec: cronJob.spec.jobTemplate.spec
    };

    await batchV1.createNamespacedJob({
      namespace: TOOL_NAMESPACE,
      body
    });

    return { name: jobName, sourceCronJob: name };
  } catch (error) {
    throw new Error(`K8s API error running cronjob now: ${getK8sErrorMessage(error)}`);
  }
}

async function createCronJob({
  name,
  schedule,
  mode,
  namespace,
  all = false,
  timeZone = "America/Denver",
  suspend = false,
  image = "kuberest:latest"
}) {
  const command = ["node", "scripts/cronEntry.js", "--mode", mode];

  if (all) {
    command.push("--all");
  } else {
    command.push("--namespace", namespace);
  }

  const body = {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: {
      name,
      namespace: TOOL_NAMESPACE
    },
    spec: {
      schedule,
      timeZone,
      suspend,
      concurrencyPolicy: "Forbid",
      jobTemplate: {
        spec: {
          template: {
            spec: {
              restartPolicy: "OnFailure",
              containers: [
                {
                  name: "kuberest-cron",
                  image,
                  command
                }
              ]
            }
          }
        }
      }
    }
  };

  try {
    await batchV1.createNamespacedCronJob({
      namespace: TOOL_NAMESPACE,
      body
    });
    return {
      name,
      schedule,
      mode,
      namespace: all ? null : namespace,
      all,
      timeZone,
      suspend
    };
  } catch (error) {
    throw new Error(`K8s API error creating cronjob: ${getK8sErrorMessage(error)}`);
  }
}

module.exports = {
  listCronJobs,
  setCronJobSuspend,
  updateCronJobSchedule,
  runCronJobNow,
  createCronJob
};
