const { loadConfig } = require("../config");
const logger = require("../logger");

async function sendCommsEvent(payload) {
  const config = loadConfig();
  const commsConfig = config.comms;

  if (!commsConfig?.enabled) {
    return;
  }

  const {
    endpoint,
    secret_header: secretHeader,
    secret_value: secretValue,
    timeout_ms: timeoutMs = 3000
  } = commsConfig;

  if (!endpoint) {
    logger.warn("Comms enabled but endpoint missing; skipping event");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    "Content-Type": "application/json"
  };

  if (secretHeader && secretValue) {
    headers[secretHeader] = secretValue;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    logger.debug({ status: response.status }, "Comms event sent");
  } catch (error) {
    logger.warn({ err: error.message }, "Comms hook failed (non-critical)");
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  sendCommsEvent
};
