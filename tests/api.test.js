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
    assert.equal(res.body.data.some((entry) => entry.name === "disabled-ns"), false);
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

  it("allows admin workload-level scale-down and scale-up", async () => {
    const down = await request(app)
      .post("/api/scale/down/workload")
      .set("Cookie", adminCookie)
      .send({
        namespace: "payments",
        workload: { kind: "Deployment", name: "payment-api" }
      });

    assert.equal(down.status, 200);
    assert.equal(down.body.success, true);
    assert.equal(down.body.data.workloads[0].name, "payment-api");

    const up = await request(app)
      .post("/api/scale/up/workload")
      .set("Cookie", adminCookie)
      .send({
        namespace: "payments",
        workload: { kind: "Deployment", name: "payment-api" }
      });

    assert.equal(up.status, 200);
    assert.equal(up.body.success, true);
    assert.equal(up.body.data.workloads[0].restoredReplicas, 2);
  });

  it("previews scale down and lists snapshots", async () => {
    const preview = await request(app)
      .post("/api/scale/preview")
      .set("Cookie", adminCookie)
      .send({ namespace: "payments", direction: "down" });

    assert.equal(preview.status, 200);
    assert.equal(preview.body.success, true);
    assert.equal(preview.body.data.workloads[0].targetReplicas, 0);

    await request(app)
      .post("/api/scale/down/workload")
      .set("Cookie", adminCookie)
      .send({
        namespace: "payments",
        workload: { kind: "Deployment", name: "payment-api" }
      });

    const snapshots = await request(app)
      .get("/api/snapshots")
      .set("Cookie", adminCookie);

    assert.equal(snapshots.status, 200);
    assert.equal(snapshots.body.success, true);
    assert.equal(snapshots.body.data[0].namespace, "payments");
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

  it("runs a cron job now for admin", async () => {
    const res = await request(app)
      .post("/api/cron/kuberest-scale-down/run")
      .set("Cookie", adminCookie);

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.sourceCronJob, "kuberest-scale-down");
  });

  it("creates a cron job for admin", async () => {
    const res = await request(app)
      .post("/api/cron/jobs")
      .set("Cookie", adminCookie)
      .send({
        name: "kuberest-scale-down-nightly",
        schedule: "0 2 * * 1-5",
        mode: "scale-down",
        all: true
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, "kuberest-scale-down-nightly");
  });

  it("lists cluster namespaces for admin tracking", async () => {
    const res = await request(app)
      .get("/api/admin/namespaces")
      .set("Cookie", adminCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.some((entry) => entry.name === "sandbox" && entry.tracked === false));
    assert.ok(res.body.data.some((entry) => entry.name === "payments" && entry.enabled === true));
  });

  it("allows admin to enable namespace tracking", async () => {
    const res = await request(app)
      .patch("/api/admin/namespaces/sandbox")
      .set("Cookie", adminCookie)
      .send({ enabled: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, "sandbox");
    assert.equal(res.body.data.enabled, true);

    const status = await request(app)
      .get("/api/status/namespaces")
      .set("Cookie", adminCookie);

    assert.ok(status.body.data.some((entry) => entry.name === "sandbox"));
  });
});
