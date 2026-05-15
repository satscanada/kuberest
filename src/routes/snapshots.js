const express = require("express");
const { requireAuth } = require("./auth");
const { listSnapshots } = require("../k8s/snapshot");
const logger = require("../logger");

const router = express.Router();

router.get("/", requireAuth(), async (req, res) => {
  try {
    const snapshots = await listSnapshots();
    return res.json({ success: true, data: snapshots });
  } catch (error) {
    logger.error({ err: error.message }, "Failed to list snapshots");
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
