const express = require("express");
const yaml = require("js-yaml");
const { requireAuth } = require("./auth");
const { coreV1 } = require("../k8s/client");
const { getK8sErrorMessage, isNotFound, listItems } = require("../k8s/helpers");
const { loadConfig, replaceConfig } = require("../config");
const logger = require("../logger");

const router = express.Router();
const TOOL_NAMESPACE = process.env.TOOL_NAMESPACE || "kuberest";
const CONFIGMAP_NAME = "kuberest-config";
const CONFIGMAP_KEY = "config.yaml";

function configuredNamespaceMap(config) {
  return new Map((config.namespaces || []).map((entry) => [entry.name, entry]));
}

async function persistNamespaces(namespaces) {
  const currentConfig = loadConfig();
  const nextConfig = {
    ...currentConfig,
    namespaces
  };
  const configYaml = yaml.dump(nextConfig, { lineWidth: -1 });

  try {
    const configMap = await coreV1.readNamespacedConfigMap({
      name: CONFIGMAP_NAME,
      namespace: TOOL_NAMESPACE
    });

    await coreV1.replaceNamespacedConfigMap({
      name: CONFIGMAP_NAME,
      namespace: TOOL_NAMESPACE,
      body: {
        ...configMap,
        data: {
          ...(configMap.data || {}),
          [CONFIGMAP_KEY]: configYaml
        }
      }
    });
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }

    await coreV1.createNamespacedConfigMap({
      namespace: TOOL_NAMESPACE,
      body: {
        metadata: {
          name: CONFIGMAP_NAME,
          namespace: TOOL_NAMESPACE
        },
        data: {
          [CONFIGMAP_KEY]: configYaml
        }
      }
    });
  }

  replaceConfig(nextConfig);
  return nextConfig.namespaces;
}

router.get("/namespaces", requireAuth(["admin"]), async (req, res) => {
  try {
    const config = loadConfig();
    const configured = configuredNamespaceMap(config);
    const response = await coreV1.listNamespace();
    const clusterNamespaces = listItems(response).map((item) => {
      const name = item.metadata?.name;
      const tracked = configured.get(name);
      return {
        name,
        status: item.status?.phase || "Unknown",
        tracked: Boolean(tracked),
        enabled: Boolean(tracked?.enabled)
      };
    });

    const clusterNames = new Set(clusterNamespaces.map((entry) => entry.name));
    const configuredOnly = (config.namespaces || [])
      .filter((entry) => !clusterNames.has(entry.name))
      .map((entry) => ({
        name: entry.name,
        status: "Missing",
        tracked: true,
        enabled: Boolean(entry.enabled)
      }));

    return res.json({
      success: true,
      data: [...clusterNamespaces, ...configuredOnly].sort((a, b) => a.name.localeCompare(b.name))
    });
  } catch (error) {
    logger.error({ err: error.message }, "Failed to list admin namespaces");
    return res.status(500).json({ success: false, error: getK8sErrorMessage(error) });
  }
});

router.patch("/namespaces/:name", requireAuth(["admin"]), async (req, res) => {
  const { name } = req.params;
  const { enabled } = req.body || {};

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ success: false, error: "enabled must be a boolean" });
  }

  try {
    const config = loadConfig();
    const namespaces = [...(config.namespaces || [])];
    const index = namespaces.findIndex((entry) => entry.name === name);

    if (index >= 0) {
      namespaces[index] = { ...namespaces[index], enabled };
    } else {
      namespaces.push({ name, enabled });
    }

    await persistNamespaces(namespaces);
    logger.info({ namespace: name, enabled }, "Namespace tracking updated");

    return res.json({
      success: true,
      data: { name, tracked: true, enabled }
    });
  } catch (error) {
    logger.error({ namespace: name, err: error.message }, "Failed to update namespace tracking");
    return res.status(500).json({ success: false, error: getK8sErrorMessage(error) });
  }
});

module.exports = router;
