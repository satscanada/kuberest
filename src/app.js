const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("node:path");

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, "ui")));

  app.use("/auth", require("./routes/auth"));
  app.use("/api/scale", require("./routes/scale"));
  app.use("/api/cron", require("./routes/cron"));
  app.use("/api/validate", require("./routes/validate"));
  app.use("/api/status", require("./routes/status"));
  app.use("/api/admin", require("./routes/admin"));
  app.use("/api/snapshots", require("./routes/snapshots"));

  app.get(["/", "/login", "/dashboard", "/scale", "/cron", "/snapshots", "/validate", "/admin"], (req, res) => {
    res.sendFile(path.join(__dirname, "ui", "index.html"));
  });

  app.use((req, res) => {
    res.status(404).json({ success: false, error: "Not found" });
  });

  app.use((error, req, res, next) => {
    const logger = require("./logger");
    logger.error({ err: error.message }, "Unhandled server error");
    res.status(500).json({ success: false, error: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };
