const express = require("express");
const { requireAuth } = require("./auth");
const {
  listCronJobs,
  setCronJobSuspend,
  updateCronJobSchedule,
  runCronJobNow,
  createCronJob
} = require("../k8s/cronManager");
const { loadConfig } = require("../config");
const logger = require("../logger");

const router = express.Router();
const config = loadConfig();

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

router.post("/:name/run", requireAuth(["admin"]), async (req, res) => {
  const { name } = req.params;

  try {
    logger.info({ cronJob: name, user: req.user.username }, "Cron run-now requested");
    const result = await runCronJobNow(name);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    logger.error({ cronJob: name, err: error.message }, "Failed to run cron job now");
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/jobs", requireAuth(["admin"]), async (req, res) => {
  const {
    name,
    schedule,
    mode,
    namespace,
    all = false,
    timeZone = "America/Denver",
    suspend = false
  } = req.body || {};

  if (!name || !schedule || !mode) {
    return res.status(400).json({ success: false, error: "name, schedule, and mode are required" });
  }

  if (!["scale-down", "scale-up"].includes(mode)) {
    return res.status(400).json({ success: false, error: "mode must be scale-down or scale-up" });
  }

  if (!all) {
    if (!namespace) {
      return res.status(400).json({ success: false, error: "namespace is required when all=false" });
    }

    const configured = config.namespaces.find((entry) => entry.name === namespace && entry.enabled);
    if (!configured) {
      return res.status(400).json({ success: false, error: `Namespace not enabled in config: ${namespace}` });
    }
  }

  try {
    logger.info({ cronJob: name, schedule, mode, namespace, all, user: req.user.username }, "CronJob create requested");

    const result = await createCronJob({
      name,
      schedule,
      mode,
      namespace: all ? null : namespace,
      all: Boolean(all),
      timeZone,
      suspend: Boolean(suspend),
      image: process.env.CRON_IMAGE || process.env.KUBEREST_IMAGE || "kuberest:latest"
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    logger.error({ cronJob: name, err: error.message }, "Failed to create cron job");
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
