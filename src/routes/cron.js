const express = require("express");
const { requireAuth } = require("./auth");
const {
  listCronJobs,
  setCronJobSuspend,
  updateCronJobSchedule
} = require("../k8s/cronManager");
const logger = require("../logger");

const router = express.Router();

router.get("/jobs", requireAuth(), async (req, res) => {
  try {
    const jobs = await listCronJobs();
    return res.json({ success: true, data: jobs });
  } catch (error) {
    logger.error({ err: error.message }, "Failed to list cron jobs");
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.patch("/:name/schedule", requireAuth(["admin"]), async (req, res) => {
  const { name } = req.params;
  const { schedule } = req.body || {};

  if (!schedule || typeof schedule !== "string") {
    return res.status(400).json({ success: false, error: "schedule is required" });
  }

  try {
    logger.info({ cronJob: name, schedule, user: req.user.username }, "Cron schedule update requested");
    const result = await updateCronJobSchedule(name, schedule);
    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ cronJob: name, err: error.message }, "Failed to update cron schedule");
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.patch("/:name/suspend", requireAuth(["admin"]), async (req, res) => {
  const { name } = req.params;
  const { suspend } = req.body || {};

  if (typeof suspend !== "boolean") {
    return res.status(400).json({ success: false, error: "suspend must be a boolean" });
  }

  try {
    logger.info({ cronJob: name, suspend, user: req.user.username }, "Cron suspend update requested");
    const result = await setCronJobSuspend(name, suspend);
    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ cronJob: name, err: error.message }, "Failed to update cron suspend state");
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
