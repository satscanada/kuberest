const { loadConfig } = require("./config");
const logger = require("./logger");
const { createApp } = require("./app");

loadConfig();

const port = Number(process.env.PORT) || 3000;
const app = createApp();

app.listen(port, () => {
  logger.info({ port }, "KubeRest server listening");
});
