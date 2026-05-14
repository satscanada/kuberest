const { loadConfig } = require("../src/config");
const logger = require("../src/logger");

function parseArgs(argv) {
  const args = argv.slice(2);
  const modeIndex = args.indexOf("--mode");
  const namespaceIndex = args.indexOf("--namespace");

  return {
    mode: modeIndex >= 0 ? args[modeIndex + 1] : null,
    all: args.includes("--all"),
    namespace: namespaceIndex >= 0 ? args[namespaceIndex + 1] : null
  };
}

function resolveNamespaces(config, options) {
  if (options.all) {
    return config.namespaces.filter((entry) => entry.enabled).map((entry) => entry.name);
  }

  if (options.namespace) {
    const entry = config.namespaces.find((item) => item.name === options.namespace);

    if (!entry) {
      throw new Error(`Namespace not configured: ${options.namespace}`);
    }

    if (!entry.enabled) {
      throw new Error(`Namespace is disabled: ${options.namespace}`);
    }

    return [options.namespace];
  }

  return [];
}

async function main() {
  const options = parseArgs(process.argv);
  const config = loadConfig();
  const namespaces = resolveNamespaces(config, options);

  if (!namespaces.length) {
    logger.error("No namespaces resolved — use --all or --namespace");
    process.exit(1);
  }

  const { scaleDown } = require("../src/k8s/scaleDown");
  const { scaleUp } = require("../src/k8s/scaleUp");

  const action = options.mode === "scale-down"
    ? scaleDown
    : options.mode === "scale-up"
      ? scaleUp
      : null;

  if (!action) {
    logger.error({ mode: options.mode }, "Unknown mode — use scale-down or scale-up");
    process.exit(1);
  }

  for (const namespace of namespaces) {
    try {
      const result = await action(namespace, "cron");

      if (!result.success) {
        logger.error({ namespace, errors: result.errors }, `${options.mode} failed`);
        process.exit(1);
      }

      logger.info({ namespace, result }, `${options.mode} complete`);
    } catch (error) {
      logger.error({ namespace, err: error.message }, `${options.mode} failed`);
      process.exit(1);
    }
  }

  process.exit(0);
}

module.exports = {
  parseArgs,
  resolveNamespaces
};

if (require.main === module) {
  main();
}
