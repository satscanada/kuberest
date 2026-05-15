const express = require("express");
const { requireAuth } = require("./auth");
const { loadConfig } = require("../config");
const { scaleDown, scaleDownWorkload } = require("../k8s/scaleDown");
const { scaleUp, scaleUpWorkload } = require("../k8s/scaleUp");
const { previewScaleDown, previewScaleUp } = require("../k8s/scalePreview");
const logger = require("../logger");

const router = express.Router();
const config = loadConfig();

function resolveNamespace(body) {
  const namespace = body?.namespace;

  if (!namespace || typeof namespace !== "string") {
    return { error: "namespace is required" };
  }

  const entry = config.namespaces.find((item) => item.name === namespace);

  if (!entry) {
    return { error: `Namespace not configured: ${namespace}` };
  }

  if (!entry.enabled) {
    return { error: `Namespace is disabled: ${namespace}` };
  }

  return { namespace };
}

function resolveWorkload(body) {
  const resolved = resolveNamespace(body);
  if (resolved.error) {
    return resolved;
  }

  const { kind, name } = body?.workload || {};

  if (!name || typeof name !== "string") {
    return { error: "workload.name is required" };
  }

  if (!["Deployment", "StatefulSet"].includes(kind)) {
    return { error: "workload.kind must be Deployment or StatefulSet" };
  }

  return {
    namespace: resolved.namespace,
    workload: { kind, name }
  };
}

router.post("/down", requireAuth(["admin"]), async (req, res) => {
  const resolved = resolveNamespace(req.body);

  if (resolved.error) {
    return res.status(400).json({ success: false, error: resolved.error });
  }

  const triggeredBy = `user:${req.user.username}`;
  logger.info({ namespace: resolved.namespace, triggeredBy }, "Manual scale-down requested");

  const result = await scaleDown(resolved.namespace, triggeredBy);

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.errors.join("; ") });
  }

  return res.json({ success: true, data: result });
});

router.post("/preview", requireAuth(["admin"]), async (req, res) => {
  const resolved = resolveNamespace(req.body);
  const { direction, workload } = req.body || {};

  if (resolved.error) {
    return res.status(400).json({ success: false, error: resolved.error });
  }

  if (!["down", "up"].includes(direction)) {
    return res.status(400).json({ success: false, error: "direction must be down or up" });
  }

  if (workload && (!["Deployment", "StatefulSet"].includes(workload.kind) || !workload.name)) {
    return res.status(400).json({ success: false, error: "workload must include kind and name" });
  }

  try {
    const result = direction === "down"
      ? await previewScaleDown(resolved.namespace, workload || null)
      : await previewScaleUp(resolved.namespace, workload || null);

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/down/workload", requireAuth(["admin"]), async (req, res) => {
  const resolved = resolveWorkload(req.body);

  if (resolved.error) {
    return res.status(400).json({ success: false, error: resolved.error });
  }

  const triggeredBy = `user:${req.user.username}`;
  logger.info({ namespace: resolved.namespace, workload: resolved.workload, triggeredBy }, "Manual workload scale-down requested");

  const result = await scaleDownWorkload(resolved.namespace, resolved.workload, triggeredBy);

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.errors.join("; ") });
  }

  return res.json({ success: true, data: result });
});

router.post("/up", requireAuth(["admin"]), async (req, res) => {
  const resolved = resolveNamespace(req.body);

  if (resolved.error) {
    return res.status(400).json({ success: false, error: resolved.error });
  }

  const triggeredBy = `user:${req.user.username}`;
  logger.info({ namespace: resolved.namespace, triggeredBy }, "Manual scale-up requested");

  const result = await scaleUp(resolved.namespace, triggeredBy);

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.errors.join("; ") });
  }

  return res.json({ success: true, data: result });
});

router.post("/up/workload", requireAuth(["admin"]), async (req, res) => {
  const resolved = resolveWorkload(req.body);

  if (resolved.error) {
    return res.status(400).json({ success: false, error: resolved.error });
  }

  const triggeredBy = `user:${req.user.username}`;
  logger.info({ namespace: resolved.namespace, workload: resolved.workload, triggeredBy }, "Manual workload scale-up requested");

  const result = await scaleUpWorkload(resolved.namespace, resolved.workload, triggeredBy);

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.errors.join("; ") });
  }

  return res.json({ success: true, data: result });
});

module.exports = router;
