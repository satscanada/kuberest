const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs, resolveNamespaces } = require("../scripts/cronEntry");
const { useTestConfig } = require("./helpers/testEnv");

describe("cronEntry", () => {
  it("parseArgs reads mode, all, and namespace flags", () => {
    const parsed = parseArgs(["node", "cronEntry.js", "--mode", "scale-down", "--namespace", "payments"]);

    assert.equal(parsed.mode, "scale-down");
    assert.equal(parsed.all, false);
    assert.equal(parsed.namespace, "payments");
  });

  it("resolveNamespaces returns enabled namespaces for --all", () => {
    useTestConfig();
    const { loadConfig } = require("../src/config");
    const config = loadConfig();
    const namespaces = resolveNamespaces(config, { all: true, namespace: null, mode: "scale-down" });

    assert.deepEqual(namespaces, ["payments", "reporting"]);
  });

  it("resolveNamespaces rejects disabled namespace", () => {
    useTestConfig();
    const { loadConfig } = require("../src/config");
    const config = loadConfig();

    assert.throws(
      () => resolveNamespaces(config, { all: false, namespace: "disabled-ns", mode: "scale-down" }),
      /disabled/
    );
  });

  it("resolveNamespaces rejects unknown namespace", () => {
    useTestConfig();
    const { loadConfig } = require("../src/config");
    const config = loadConfig();

    assert.throws(
      () => resolveNamespaces(config, { all: false, namespace: "missing", mode: "scale-down" }),
      /not configured/
    );
  });
});
