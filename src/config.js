const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const CONFIG_PATH = process.env.KUBEREST_CONFIG_PATH || path.resolve(process.cwd(), "config.yaml");

let cachedConfig;

function validateConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid config: root object is required");
  }

  if (!config.auth?.jwt_secret || !Array.isArray(config.auth?.users)) {
    throw new Error("Invalid config: auth.jwt_secret and auth.users are required");
  }

  if (!Array.isArray(config.namespaces)) {
    throw new Error("Invalid config: namespaces must be an array");
  }
}

function loadConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const yamlText = fs.readFileSync(CONFIG_PATH, "utf8");
  const parsed = yaml.load(yamlText);
  validateConfig(parsed);

  cachedConfig = parsed;
  return cachedConfig;
}

function replaceConfig(nextConfig) {
  validateConfig(nextConfig);

  if (!cachedConfig) {
    cachedConfig = nextConfig;
    return cachedConfig;
  }

  for (const key of Object.keys(cachedConfig)) {
    delete cachedConfig[key];
  }

  Object.assign(cachedConfig, nextConfig);
  return cachedConfig;
}

module.exports = {
  loadConfig,
  replaceConfig
};
