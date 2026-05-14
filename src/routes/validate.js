const express = require("express");
const { requireAuth } = require("./auth");
const { loadConfig } = require("../config");
const { validateNamespace } = require("../k8s/validate");
const logger = require("../logger");

const router = express.Router();
const config = loadConfig();

router.post("/", requireAuth(), async (req, res) => {
  const namespace = req.body?.namespace;

  if (!namespace || typeof namespace !== "string") {
    return res.status(400).json({ success: false, error: "namespace is required" });
  }

  const entry = config.namespaces.find((item) => item.name === namespace);

  if (!entry) {
    return res.status(400).json({ success: false, error: `Namespace not configured: ${namespace}` });
  }

  try {
    logger.info({ namespace, user: req.user.username }, "Validation requested");
    const result = await validateNamespace(namespace);
    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ namespace, err: error.message }, "Validation failed");
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
