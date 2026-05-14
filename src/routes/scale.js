const express = require("express");
const { requireAuth } = require("./auth");
const { loadConfig } = require("../config");
const { scaleDown } = require("../k8s/scaleDown");
const { scaleUp } = require("../k8s/scaleUp");
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

module.exports = router;
