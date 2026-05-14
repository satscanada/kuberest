const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { useTestConfig } = require("./helpers/testEnv");

describe("config", () => {
  before(() => {
    useTestConfig();
  });

  it("loads test fixture and validates required sections", () => {
    const { loadConfig } = require("../src/config");
    const config = loadConfig();

    assert.equal(config.auth.jwt_secret, "test-jwt-secret");
    assert.equal(config.auth.users.length, 2);
    assert.equal(config.namespaces.length, 3);
    assert.equal(config.comms.enabled, false);
  });
});
