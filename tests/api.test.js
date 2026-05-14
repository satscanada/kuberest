const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { useTestConfig, installK8sMocks } = require("./helpers/testEnv");

describe("API routes (phase 3)", () => {
  let app;
  let adminCookie;

  before(async () => {
    useTestConfig();
    installK8sMocks();
    const { createApp } = require("../src/app");
    app = createApp();

    const login = await request(app)
      .post("/auth/login")
      .send({ username: "admin", password: "password" });

    assert.equal(login.status, 200);
    adminCookie = login.headers["set-cookie"];
  });

  it("rejects unauthenticated status requests", async () => {
    const res = await request(app).get("/api/status/namespaces");
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  it("returns namespace status for authenticated users", async () => {
    const res = await request(app)
      .get("/api/status/namespaces")
      .set("Cookie", adminCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data[0].name, "payments");
  });

  it("runs validation for authenticated users", async () => {
    const res = await request(app)
      .post("/api/validate")
      .set("Cookie", adminCookie)
      .send({ namespace: "payments" });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.namespace, "payments");
  });

  it("lists cron jobs for authenticated users", async () => {
    const res = await request(app)
      .get("/api/cron/jobs")
      .set("Cookie", adminCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data[0].name, "kuberest-scale-down");
  });

  it("allows admin scale-down", async () => {
    const res = await request(app)
      .post("/api/scale/down")
      .set("Cookie", adminCookie)
      .send({ namespace: "payments" });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  it("forbids viewer scale-down", async () => {
    const viewerLogin = await request(app)
      .post("/auth/login")
      .send({ username: "viewer", password: "password" });

    const res = await request(app)
      .post("/api/scale/down")
      .set("Cookie", viewerLogin.headers["set-cookie"])
      .send({ namespace: "payments" });

    assert.equal(res.status, 403);
  });

  it("patches cron suspend for admin", async () => {
    const res = await request(app)
      .patch("/api/cron/kuberest-scale-down/suspend")
      .set("Cookie", adminCookie)
      .send({ suspend: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.suspend, true);
  });
});
