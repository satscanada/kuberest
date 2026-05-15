const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const path = require("node:path");
const fs = require("node:fs");
const { useTestConfig, installK8sMocks } = require("./helpers/testEnv");

describe("UI static assets (phase 5)", () => {
  let app;

  before(() => {
    useTestConfig();
    installK8sMocks();
    const { createApp } = require("../src/app");
    app = createApp();
  });

  const pages = ["login", "dashboard", "scale", "cron", "snapshots", "validate"];

  for (const page of pages) {
    it(`serves /${page} HTML`, async () => {
      const response = await request(app).get(`/${page}`);
      assert.equal(response.status, 200);
      assert.match(response.text, /id="root"/);
    });
  }

  it("serves bundled frontend assets", async () => {
    const indexPath = path.join(__dirname, "../src/ui/index.html");
    const html = fs.readFileSync(indexPath, "utf8");
    const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
    assert.ok(jsMatch, "Expected hashed JS asset in index.html");

    const response = await request(app).get(jsMatch[1]);
    assert.equal(response.status, 200);
  });

  it("build output exists on disk", () => {
    assert.equal(fs.existsSync(path.join(__dirname, "../src/ui/index.html")), true);
    assert.equal(fs.existsSync(path.join(__dirname, "../src/ui/assets")), true);
  });
});
