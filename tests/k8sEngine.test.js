const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { useTestConfig, installK8sMocks } = require("./helpers/testEnv");

describe("scaleDown", () => {
  it("writes snapshot before patching replicas", async () => {
    useTestConfig();
    const { callLog } = installK8sMocks();
    const { scaleDown } = require("../src/k8s/scaleDown");

    const result = await scaleDown("payments", "cron");

    assert.equal(result.success, true);
    const snapshotIndex = callLog.findIndex((entry) => entry.method === "createNamespacedConfigMap");
    const patchIndex = callLog.findIndex((entry) => entry.method === "patchNamespacedDeployment");

    assert.ok(snapshotIndex >= 0, "expected snapshot write");
    assert.ok(patchIndex >= 0, "expected deployment patch");
    assert.ok(snapshotIndex < patchIndex, "snapshot must happen before scale patch");
  });
});

describe("scaleUp", () => {
  it("restores replicas from snapshot and clears configmap", async () => {
    useTestConfig();
    const initialSnapshot = {
      namespace: "payments",
      timestamp: new Date().toISOString(),
      workloads: [{ name: "payment-api", kind: "Deployment", replicas: 2 }]
    };
    const { callLog } = installK8sMocks({ initialSnapshot });
    const { scaleUp } = require("../src/k8s/scaleUp");

    const result = await scaleUp("payments", "cron");

    assert.equal(result.success, true);
    assert.equal(result.workloads[0].restoredReplicas, 2);
    assert.ok(callLog.some((entry) => entry.method === "patchNamespacedDeployment"));
    assert.ok(callLog.some((entry) => entry.method === "deleteNamespacedConfigMap"));
  });
});

describe("validateNamespace", () => {
  it("reports passing and failing containers", async () => {
    useTestConfig();
    installK8sMocks({
      deployments: [
        {
          metadata: { name: "good-api" },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [
                  {
                    name: "app",
                    resources: {
                      requests: { cpu: "100m", memory: "128Mi" },
                      limits: { cpu: "200m", memory: "256Mi" }
                    }
                  }
                ]
              }
            }
          }
        },
        {
          metadata: { name: "bad-api" },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [{ name: "app", resources: {} }]
              }
            }
          }
        }
      ]
    });
    const { validateNamespace } = require("../src/k8s/validate");
    const result = await validateNamespace("payments");

    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.passing, 1);
    assert.equal(result.summary.failing, 1);
    assert.equal(result.failed[0].workload, "bad-api");
  });
});

describe("sendCommsEvent", () => {
  it("no-ops when comms is disabled", async () => {
    useTestConfig();
    const { sendCommsEvent } = require("../src/k8s/comms");
    await assert.doesNotReject(sendCommsEvent({ event: "scale_down" }));
  });
});
