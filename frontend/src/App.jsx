import { useEffect, useMemo, useState } from "react";
import "./styles.css";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "scale", label: "Scale", icon: "scale" },
  { id: "cron", label: "CronJobs", icon: "clock" },
  { id: "snapshots", label: "Snapshots", icon: "archive" },
  { id: "validate", label: "Validate", icon: "check" },
  { id: "admin", label: "Namespaces", icon: "target", adminOnly: true }
];

const CRON_PRESETS = [
  { label: "Friday evening", schedule: "0 20 * * 5" },
  { label: "Monday morning", schedule: "0 6 * * 1" },
  { label: "Every weekday 7 PM", schedule: "0 19 * * 1-5" },
  { label: "Every weekday 7 AM", schedule: "0 7 * * 1-5" }
];

const TIMEZONE_OPTIONS = ["America/Denver", "America/Edmonton", "America/Toronto", "UTC"];
const CRON_BUILDER_DEFAULT = { minute: "0", hour: "20", dayOfMonth: "*", month: "*", dayOfWeek: "5" };

function Icon({ name }) {
  const paths = {
    dashboard: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4Zm9 0A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4Zm-9 9A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4Zm9 0a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4Z" />,
    scale: <path d="M7 4h10m-5 0v16m-5-4h10M7 8l-3 4 3 4m10-8 3 4-3 4" />,
    clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2" />,
    check: <path d="m5 13 4 4L19 7" />,
    logout: <path d="M10 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4m5-4 4-4-4-4m4 4H9" />,
    play: <path d="M8 5v14l11-7L8 5Z" />,
    pause: <path d="M8 5h3v14H8V5Zm5 0h3v14h-3V5Z" />,
    scaleDown: <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" />,
    suspend: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM7.8 7.8l8.4 8.4" />,
    plus: <path d="M12 5v14m-7-7h14" />,
    warning: <path d="M12 3 2.5 20h19L12 3Zm0 6v5m0 3h.01" />,
    refresh: <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />,
    target: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
    archive: <path d="M4 7h16M6 7v12h12V7M8 4h8l2 3H6l2-3Zm2 7h4" />,
    calendar: <path d="M7 3v3m10-3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
  };

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name] || paths.dashboard}
    </svg>
  );
}

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });

  const payload = await res.json();
  if (!res.ok || payload.success === false) {
    throw new Error(payload.error || "Request failed");
  }
  return payload.data;
}

function badgeFor(entry) {
  if (entry.workloadCount > 0 && entry.desiredReplicas === 0) return ["DOWN", "badge-down"];
  if (entry.hasSnapshot) return ["PARTIAL", "badge-partial"];
  return ["UP", "badge-up"];
}

function formatNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function buildCronExpression(parts) {
  return `${parts.minute} ${parts.hour} ${parts.dayOfMonth} ${parts.month} ${parts.dayOfWeek}`;
}

function parseCronExpression(expression) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function validateCronField(field, min, max) {
  if (!field) return false;
  return field.split(",").every((segment) => {
    const [base, step] = segment.split("/");
    if (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1)) return false;
    if (base === "*") return true;
    if (/^\d+$/.test(base)) {
      const value = Number(base);
      return value >= min && value <= max;
    }
    const range = base.split("-");
    if (range.length === 2 && range.every((value) => /^\d+$/.test(value))) {
      const start = Number(range[0]);
      const end = Number(range[1]);
      return start >= min && end <= max && start <= end;
    }
    return false;
  });
}

function validateCronExpression(expression) {
  const fields = parseCronExpression(expression);
  if (!fields) return { ok: false, message: "Use exactly five fields: minute hour day month weekday." };
  const checks = [
    [fields.minute, 0, 59, "minute"],
    [fields.hour, 0, 23, "hour"],
    [fields.dayOfMonth, 1, 31, "day of month"],
    [fields.month, 1, 12, "month"],
    [fields.dayOfWeek, 0, 7, "day of week"]
  ];
  const invalid = checks.find(([field, min, max]) => !validateCronField(field, min, max));
  if (invalid) return { ok: false, message: `Invalid ${invalid[3]} field.` };
  return { ok: true, message: "Valid Kubernetes cron expression." };
}

function isValidTimeZone(timeZone) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function Login({ onLoggedIn, error, setError }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      const me = await apiFetch("/auth/me");
      onLoggedIn(me);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-panel" onSubmit={onSubmit}>
        <div className="brand-mark">KR</div>
        <h1>KubeRest</h1>
        <p className="muted">Kubernetes workload scheduler</p>
        <label htmlFor="username">Username</label>
        <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn btn-primary btn-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </form>
    </div>
  );
}

function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="section-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Dashboard({ namespaces }) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [sortBy, setSortBy] = useState("attention");
  const totals = namespaces.reduce(
    (acc, entry) => {
      acc.workloads += formatNumber(entry.workloadCount);
      acc.desired += formatNumber(entry.desiredReplicas);
      acc.ready += formatNumber(entry.totalReplicas);
      acc.snapshots += entry.hasSnapshot ? 1 : 0;
      if (!entry.enabled) acc.disabled += 1;
      const [state] = badgeFor(entry);
      acc.states[state] = (acc.states[state] || 0) + 1;
      return acc;
    },
    { workloads: 0, desired: 0, ready: 0, snapshots: 0, disabled: 0, states: {} }
  );
  const readiness = totals.desired > 0 ? Math.round((totals.ready / totals.desired) * 100) : 100;
  const attention = namespaces.filter((entry) => {
    const [state] = badgeFor(entry);
    return state !== "UP" || !entry.enabled;
  });
  const latestSnapshot = namespaces
    .filter((entry) => entry.snapshotTimestamp)
    .sort((a, b) => new Date(b.snapshotTimestamp) - new Date(a.snapshotTimestamp))[0];
  const visibleNamespaces = namespaces
    .filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()))
    .filter((entry) => {
      const [state] = badgeFor(entry);
      if (stateFilter === "all") return true;
      if (stateFilter === "disabled") return !entry.enabled;
      return state.toLowerCase() === stateFilter;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "workloads") return b.workloadCount - a.workloadCount;
      const attentionScore = (entry) => {
        const [state] = badgeFor(entry);
        return (entry.enabled ? 0 : 10) + (state === "DOWN" ? 4 : state === "PARTIAL" ? 3 : 0);
      };
      return attentionScore(b) - attentionScore(a) || a.name.localeCompare(b.name);
    });

  return (
    <div className="dashboard-war-room">
      <section className="war-hero">
        <div className="war-hero-copy">
          <p className="eyebrow">Dashboard</p>
          <h2>{totals.states.DOWN ? "Weekend posture active" : "Workloads on watch"}</h2>
          <p>
            {totals.ready} of {totals.desired} desired replicas are ready across {namespaces.length} configured namespaces.
          </p>
        </div>
        <div className="readiness-orb" style={{ "--readiness": `${readiness}%` }}>
          <div>
            <strong>{readiness}%</strong>
            <span>Ready</span>
          </div>
        </div>
      </section>

      <section className="signal-grid">
        <article className="signal-card hot">
          <span className="signal-label">Operational state</span>
          <strong>{totals.states.DOWN || 0}</strong>
          <p>Namespaces scaled down</p>
        </article>
        <article className="signal-card">
          <span className="signal-label">Coverage</span>
          <strong>{totals.workloads}</strong>
          <p>Deployments and StatefulSets watched</p>
        </article>
        <article className="signal-card">
          <span className="signal-label">Snapshots</span>
          <strong>{totals.snapshots}</strong>
          <p>{latestSnapshot ? `Latest: ${latestSnapshot.name}` : "No active snapshots"}</p>
        </article>
        <article className="signal-card calm">
          <span className="signal-label">Attention</span>
          <strong>{attention.length}</strong>
          <p>Namespaces outside normal up state</p>
        </article>
      </section>

      <section className="dashboard-main-grid">
        <div className="mission-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Namespace telemetry</p>
              <h3>Replica readiness</h3>
            </div>
            <span className="live-pill">Live · 30s</span>
          </div>
          <div className="dashboard-controls">
            <div className="field">
              <label htmlFor="dashboard-search">Search</label>
              <input id="dashboard-search" value={query} placeholder="Namespace name" onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="field select-field">
              <label htmlFor="dashboard-filter">Filter</label>
              <select id="dashboard-filter" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                <option value="all">All states</option>
                <option value="up">Up</option>
                <option value="down">Down</option>
                <option value="partial">Partial</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <div className="field select-field">
              <label htmlFor="dashboard-sort">Sort</label>
              <select id="dashboard-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="attention">Attention first</option>
                <option value="name">Name</option>
                <option value="workloads">Workload count</option>
              </select>
            </div>
          </div>
          <div className="namespace-list">
            {visibleNamespaces.map((entry) => {
              const [label, className] = badgeFor(entry);
              const desired = formatNumber(entry.desiredReplicas);
              const ready = formatNumber(entry.totalReplicas);
              const pct = desired > 0 ? Math.min(100, Math.round((ready / desired) * 100)) : 100;
              return (
                <article key={entry.name} className="namespace-row-card">
                  <div className="namespace-row-top">
                    <div>
                      <h4>{entry.name}</h4>
                      <p>{entry.workloadCount} workloads · {entry.enabled ? "enabled" : "disabled"}</p>
                    </div>
                    <span className={`badge ${className}`}>{label}</span>
                  </div>
                  <div className="replica-track" aria-label={`${entry.name} readiness ${pct}%`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className="namespace-row-bottom">
                    <span>{ready}/{desired} replicas ready</span>
                    <span>{entry.hasSnapshot ? "Snapshot armed" : "No snapshot"}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="intel-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Command feed</p>
              <h3>Signals</h3>
            </div>
          </div>
          <div className="intel-list">
            <div className="intel-item">
              <span className="intel-dot blue" />
              <div><strong>Ready capacity</strong><p>{totals.ready} ready replicas from {totals.desired} desired.</p></div>
            </div>
            <div className="intel-item">
              <span className="intel-dot amber" />
              <div><strong>Snapshot inventory</strong><p>{totals.snapshots} namespace snapshots available for restore.</p></div>
            </div>
            <div className="intel-item">
              <span className="intel-dot red" />
              <div><strong>Exceptions</strong><p>{attention.length ? `${attention.map((entry) => entry.name).join(", ")}` : "No exceptions detected."}</p></div>
            </div>
            <div className="intel-item">
              <span className="intel-dot green" />
              <div><strong>Configured scope</strong><p>{namespaces.length - totals.disabled} enabled, {totals.disabled} disabled.</p></div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function NamespaceSelect({ value, namespaces, onChange, id = "namespace" }) {
  return (
    <div className="field select-field">
      <label htmlFor={id}>Namespace</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {namespaces.map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}
      </select>
    </div>
  );
}

function ScalePanel({ user, namespaces, detail, onNamespaceChange, onScale, onScaleWorkload, busyAction }) {
  const [ns, setNs] = useState(namespaces[0]?.name || "");
  const selectedNs = namespaces.find((n) => n.name === ns)?.name || namespaces[0]?.name || "";

  useEffect(() => {
    if (selectedNs && detail?.namespace !== selectedNs) {
      onNamespaceChange(selectedNs);
    }
  }, [detail?.namespace, onNamespaceChange, selectedNs]);

  const snapshotMap = useMemo(() => {
    const map = new Map();
    (detail?.snapshot?.workloads || []).forEach((w) => map.set(`${w.kind}/${w.name}`, w.replicas));
    return map;
  }, [detail]);

  return (
    <div className="stack">
      <SectionHeader eyebrow="Manual control" title="Scale workloads" />
      <section className="panel">
        <div className="toolbar">
          <NamespaceSelect
            id="scale-namespace"
            value={selectedNs}
            namespaces={namespaces}
            onChange={(value) => {
              setNs(value);
              onNamespaceChange(value);
            }}
          />
          {user.role === "admin" ? (
            <div className="button-group">
              <button className="btn btn-danger" disabled={!selectedNs || busyAction === "down"} onClick={() => onScale("down", selectedNs)}>
                <Icon name="scaleDown" /> {busyAction === "down" ? "Scaling..." : "Scale down"}
              </button>
              <button className="btn btn-primary" disabled={!selectedNs || busyAction === "up"} onClick={() => onScale("up", selectedNs)}>
                <Icon name="play" /> {busyAction === "up" ? "Restoring..." : "Scale up"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Kind</th><th>Ready</th><th>Desired</th><th>Snapshotted</th>{user.role === "admin" ? <th>Actions</th> : null}</tr>
            </thead>
            <tbody>
              {(detail?.workloads || []).map((w) => {
                const key = `${w.kind}/${w.name}`;
                const snapshottedReplicas = snapshotMap.get(key);
                const rowBusy = busyAction === `down:${key}` || busyAction === `up:${key}`;
                return (
                  <tr key={key}>
                    <td>{w.name}</td>
                    <td>{w.kind}</td>
                    <td>{w.replicas}</td>
                    <td>{w.desired}</td>
                    <td>{snapshottedReplicas ?? "-"}</td>
                    {user.role === "admin" ? (
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn btn-danger btn-small"
                            disabled={rowBusy || w.desired === 0}
                            onClick={() => onScaleWorkload("down", selectedNs, w)}
                          >
                            <Icon name="scaleDown" /> {busyAction === `down:${key}` ? "Scaling..." : "Down"}
                          </button>
                          <button
                            className="btn btn-primary btn-small"
                            disabled={rowBusy || snapshottedReplicas === undefined}
                            onClick={() => onScaleWorkload("up", selectedNs, w)}
                          >
                            <Icon name="play" /> {busyAction === `up:${key}` ? "Restoring..." : "Up"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CronWizard({ namespaces, onCreateJob, creating }) {
  const [step, setStep] = useState(0);
  const [cronParts, setCronParts] = useState(CRON_BUILDER_DEFAULT);
  const [timeZoneMode, setTimeZoneMode] = useState("preset");
  const [form, setForm] = useState({
    name: "",
    schedule: "0 20 * * 5",
    mode: "scale-down",
    all: true,
    namespace: namespaces[0]?.name || "",
    timeZone: "America/Denver",
    suspend: false
  });
  const selectedNamespace = namespaces.find((n) => n.name === form.namespace)?.name || namespaces[0]?.name || "";
  const cronStatus = validateCronExpression(form.schedule);
  const timeZoneStatus = isValidTimeZone(form.timeZone);

  const generatedName = useMemo(() => {
    const target = form.all ? "all" : selectedNamespace || "namespace";
    return `kuberest-${form.mode}-${target}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  }, [form.all, form.mode, selectedNamespace]);

  const payload = { ...form, name: form.name.trim() || generatedName, namespace: selectedNamespace };
  const canContinue = step === 1 ? cronStatus.ok && timeZoneStatus : payload.name;

  const applyCronParts = (nextParts) => {
    setCronParts(nextParts);
    setForm((current) => ({ ...current, schedule: buildCronExpression(nextParts) }));
  };

  const applySchedule = (schedule) => {
    setForm((current) => ({ ...current, schedule }));
    const parsed = parseCronExpression(schedule);
    if (parsed) setCronParts(parsed);
  };

  const submit = async () => {
    if (!cronStatus.ok || !timeZoneStatus) return;
    await onCreateJob(payload);
    setStep(0);
    setCronParts(CRON_BUILDER_DEFAULT);
    setTimeZoneMode("preset");
    setForm({
      name: "",
      schedule: form.mode === "scale-down" ? "0 20 * * 5" : "0 6 * * 1",
      mode: "scale-down",
      all: true,
      namespace: namespaces[0]?.name || "",
      timeZone: "America/Denver",
      suspend: false
    });
  };

  return (
    <section className="panel wizard">
      <div className="wizard-rail" aria-label="CronJob creation steps">
        {["Intent", "Schedule", "Review"].map((label, index) => (
          <button
            key={label}
            className={`wizard-step ${step === index ? "active" : ""} ${step > index ? "complete" : ""}`}
            onClick={() => setStep(index)}
            type="button"
          >
            <span>{index + 1}</span>{label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <div className="wizard-body">
          <div className="choice-grid">
            <button
              className={`choice ${form.mode === "scale-down" ? "selected" : ""}`}
              onClick={() => {
                setCronParts(CRON_BUILDER_DEFAULT);
                setForm({ ...form, mode: "scale-down", schedule: "0 20 * * 5" });
              }}
              type="button"
            >
              <Icon name="scaleDown" />
              <span>Scale down</span>
              <small>Set configured workloads to zero replicas.</small>
            </button>
            <button
              className={`choice ${form.mode === "scale-up" ? "selected" : ""}`}
              onClick={() => {
                const nextParts = { ...CRON_BUILDER_DEFAULT, hour: "6", dayOfWeek: "1" };
                setCronParts(nextParts);
                setForm({ ...form, mode: "scale-up", schedule: buildCronExpression(nextParts) });
              }}
              type="button"
            >
              <Icon name="play" />
              <span>Scale up</span>
              <small>Restore replicas from the ConfigMap snapshot.</small>
            </button>
          </div>
          <div className="form-grid">
            <div className="field select-field">
              <label htmlFor="cron-target">Target</label>
              <select id="cron-target" value={form.all ? "all" : "single"} onChange={(e) => setForm({ ...form, all: e.target.value === "all" })}>
                <option value="all">All enabled namespaces</option>
                <option value="single">Single namespace</option>
              </select>
            </div>
            {!form.all ? (
              <NamespaceSelect
                id="cron-namespace"
                value={selectedNamespace}
                namespaces={namespaces}
                onChange={(namespace) => setForm({ ...form, namespace })}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="wizard-body">
          <div className="preset-row">
            {CRON_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className={`preset ${form.schedule === preset.schedule ? "selected" : ""}`}
                onClick={() => applySchedule(preset.schedule)}
                type="button"
              >
                <Icon name="calendar" /> {preset.label}
              </button>
            ))}
          </div>
          <div className="cron-builder">
            <div className="field select-field">
              <label htmlFor="cron-minute">Minute</label>
              <select id="cron-minute" value={cronParts.minute} onChange={(e) => applyCronParts({ ...cronParts, minute: e.target.value })}>
                <option value="0">:00</option>
                <option value="15">:15</option>
                <option value="30">:30</option>
                <option value="45">:45</option>
                <option value="*/15">Every 15 min</option>
                <option value="*/30">Every 30 min</option>
              </select>
            </div>
            <div className="field select-field">
              <label htmlFor="cron-hour">Hour</label>
              <select id="cron-hour" value={cronParts.hour} onChange={(e) => applyCronParts({ ...cronParts, hour: e.target.value })}>
                <option value="*">Every hour</option>
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={String(hour)}>{String(hour).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
            <div className="field select-field">
              <label htmlFor="cron-dom">Day</label>
              <select id="cron-dom" value={cronParts.dayOfMonth} onChange={(e) => applyCronParts({ ...cronParts, dayOfMonth: e.target.value })}>
                <option value="*">Every day</option>
                <option value="1">1st day</option>
                <option value="15">15th day</option>
                <option value="1,15">1st and 15th</option>
              </select>
            </div>
            <div className="field select-field">
              <label htmlFor="cron-month">Month</label>
              <select id="cron-month" value={cronParts.month} onChange={(e) => applyCronParts({ ...cronParts, month: e.target.value })}>
                <option value="*">Every month</option>
                <option value="1-3">Q1</option>
                <option value="4-6">Q2</option>
                <option value="7-9">Q3</option>
                <option value="10-12">Q4</option>
              </select>
            </div>
            <div className="field select-field">
              <label htmlFor="cron-dow">Weekday</label>
              <select id="cron-dow" value={cronParts.dayOfWeek} onChange={(e) => applyCronParts({ ...cronParts, dayOfWeek: e.target.value })}>
                <option value="*">Any weekday</option>
                <option value="1-5">Weekdays</option>
                <option value="0,6">Weekends</option>
                <option value="1">Monday</option>
                <option value="5">Friday</option>
              </select>
            </div>
          </div>
          <div className="cron-expression-panel">
            <div className="field cron-expression-field">
              <label htmlFor="cron-schedule">Cron expression</label>
              <input id="cron-schedule" value={form.schedule} onChange={(e) => applySchedule(e.target.value)} />
              <p className={`field-hint ${cronStatus.ok ? "ok" : "bad"}`}>{cronStatus.message}</p>
            </div>
          </div>
          <div className="cron-options-row">
            <div className="field select-field">
              <label htmlFor="cron-timezone-mode">Timezone source</label>
              <select id="cron-timezone-mode" value={timeZoneMode} onChange={(e) => setTimeZoneMode(e.target.value)}>
                <option value="preset">Preset timezone</option>
                <option value="custom">Custom IANA timezone</option>
              </select>
            </div>
            {timeZoneMode === "preset" ? (
              <div className="field select-field">
                <label htmlFor="cron-timezone">Timezone</label>
                <select id="cron-timezone" value={form.timeZone} onChange={(e) => setForm({ ...form, timeZone: e.target.value })}>
                  {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="cron-timezone-custom">Custom timezone</label>
                <input id="cron-timezone-custom" value={form.timeZone} placeholder="America/Vancouver" onChange={(e) => setForm({ ...form, timeZone: e.target.value })} />
                <p className={`field-hint ${timeZoneStatus ? "ok" : "bad"}`}>{timeZoneStatus ? "Valid IANA timezone." : "Enter a valid IANA timezone."}</p>
              </div>
            )}
            <label className="toggle">
              <input type="checkbox" checked={form.suspend} onChange={(e) => setForm({ ...form, suspend: e.target.checked })} />
              <span>Create suspended</span>
            </label>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="wizard-body">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="cron-name">CronJob name</label>
              <input id="cron-name" value={form.name} placeholder={generatedName} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <div className="review-grid">
            <div><span>Mode</span><strong>{payload.mode}</strong></div>
            <div><span>Target</span><strong>{payload.all ? "All enabled namespaces" : payload.namespace}</strong></div>
            <div><span>Schedule</span><strong>{payload.schedule}</strong></div>
            <div><span>Timezone</span><strong>{payload.timeZone}</strong></div>
            <div><span>Status</span><strong>{payload.suspend ? "Suspended" : "Active"}</strong></div>
          </div>
        </div>
      ) : null}

      <div className="wizard-actions">
        <button className="btn btn-ghost" disabled={step === 0 || creating} onClick={() => setStep(step - 1)} type="button">Back</button>
        {step < 2 ? (
          <button className="btn btn-primary" disabled={!canContinue || creating} onClick={() => setStep(step + 1)} type="button">Continue</button>
        ) : (
          <button className="btn btn-primary" disabled={creating} onClick={submit} type="button">
            <Icon name="plus" /> {creating ? "Creating..." : "Create CronJob"}
          </button>
        )}
      </div>
    </section>
  );
}

function CronPanel({ user, jobs, namespaces, onUpdateSchedule, onUpdateSuspend, onRunNow, onCreateJob, creating, runningJob }) {
  return (
    <div className="stack">
      <SectionHeader eyebrow="Automation" title="CronJob schedules" />
      {user.role === "admin" ? <CronWizard namespaces={namespaces} onCreateJob={onCreateJob} creating={creating} /> : null}

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Schedule</th><th>Timezone</th><th>Status</th>{user.role === "admin" ? <th>Actions</th> : null}</tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.name}>
                  <td>{job.name}</td>
                  <td>
                    {user.role === "admin" ? (
                      <input className="table-input" defaultValue={job.schedule} onBlur={(e) => onUpdateSchedule(job.name, e.target.value)} />
                    ) : job.schedule}
                  </td>
                  <td>{job.timeZone || "-"}</td>
                  <td><span className={`badge ${job.suspend ? "badge-partial" : "badge-up"}`}>{job.suspend ? "Suspended" : "Active"}</span></td>
                  {user.role === "admin" ? (
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-primary btn-small" disabled={runningJob === job.name} onClick={() => onRunNow(job.name)}>
                          <Icon name="play" /> {runningJob === job.name ? "Starting..." : "Run now"}
                        </button>
                        <button className="btn btn-ghost btn-small" onClick={() => onUpdateSuspend(job.name, !job.suspend)}>
                          <Icon name={job.suspend ? "play" : "suspend"} /> {job.suspend ? "Resume" : "Suspend"}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ValidatePanel({ namespaces, result, onRun, validating }) {
  const [ns, setNs] = useState(namespaces[0]?.name || "");
  const selectedNs = namespaces.find((n) => n.name === ns)?.name || namespaces[0]?.name || "";

  return (
    <div className="stack">
      <SectionHeader eyebrow="Resources" title="Validation scan" />
      <section className="panel">
        <div className="toolbar">
          <NamespaceSelect id="validate-namespace" value={selectedNs} namespaces={namespaces} onChange={setNs} />
          <button className="btn btn-primary" disabled={!selectedNs || validating} onClick={() => onRun(selectedNs)}>
            <Icon name="check" /> {validating ? "Scanning..." : "Run validation"}
          </button>
        </div>
        {result ? (
          <>
            <div className="summary">{result.summary.passing} passing, {result.summary.failing} failing / {result.summary.total}</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Workload</th><th>Kind</th><th>Container</th><th>Status</th><th>Missing</th></tr></thead>
                <tbody>
                  {result.passed.map((p) => (
                    <tr key={`p-${p.workload}-${p.container}`}><td>{p.workload}</td><td>{p.kind}</td><td>{p.container}</td><td><span className="badge badge-up">PASS</span></td><td>-</td></tr>
                  ))}
                  {result.failed.map((f) => (
                    <tr key={`f-${f.workload}-${f.container}`}><td>{f.workload}</td><td>{f.kind}</td><td>{f.container}</td><td><span className="badge badge-down">FAIL</span></td><td>{(f.missing || []).join(", ")}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function SnapshotsPanel({ snapshots }) {
  const totalWorkloads = snapshots.reduce((sum, snapshot) => sum + (snapshot.workloads?.length || 0), 0);

  return (
    <div className="stack">
      <SectionHeader eyebrow="State" title="Replica snapshots" />
      <section className="panel">
        <div className="admin-summary">
          <div><span>{snapshots.length}</span><p>Snapshot ConfigMaps</p></div>
          <div><span>{totalWorkloads}</span><p>Stored workload replicas</p></div>
          <div><span>{snapshots.filter((item) => item.error).length}</span><p>Unreadable snapshots</p></div>
        </div>
        <div className="snapshot-grid">
          {snapshots.map((snapshot) => (
            <article className="snapshot-card" key={snapshot.name}>
              <div className="row-between">
                <div>
                  <p className="eyebrow">{snapshot.name}</p>
                  <h3>{snapshot.namespace}</h3>
                </div>
                <span className={`badge ${snapshot.error ? "badge-down" : "badge-partial"}`}>{snapshot.workloads.length} workloads</span>
              </div>
              <p className="meta">{snapshot.timestamp ? new Date(snapshot.timestamp).toLocaleString() : snapshot.error || "No timestamp"}</p>
              <div className="snapshot-workloads">
                {snapshot.workloads.map((workload) => (
                  <div key={`${workload.kind}/${workload.name}`}>
                    <span>{workload.kind}/{workload.name}</span>
                    <strong>{workload.replicas} replicas</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {snapshots.length === 0 ? <p className="muted">No active snapshots.</p> : null}
        </div>
      </section>
    </div>
  );
}

function AdminNamespacesPanel({ namespaces, onToggle, updating }) {
  const [query, setQuery] = useState("");
  const filtered = namespaces.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));
  const enabledCount = namespaces.filter((entry) => entry.enabled).length;

  return (
    <div className="stack">
      <SectionHeader eyebrow="Admin" title="Namespace tracking" />
      <section className="panel">
        <div className="admin-summary">
          <div>
            <span>{enabledCount}</span>
            <p>Enabled for KubeRest</p>
          </div>
          <div>
            <span>{namespaces.length}</span>
            <p>Cluster namespaces found</p>
          </div>
          <div className="field admin-search">
            <label htmlFor="namespace-search">Search</label>
            <input
              id="namespace-search"
              value={query}
              placeholder="Filter namespaces"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Namespace</th><th>Cluster status</th><th>Tracking</th><th>Action</th></tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.name}>
                  <td>{entry.name}</td>
                  <td>{entry.status}</td>
                  <td>
                    <span className={`badge ${entry.enabled ? "badge-up" : entry.tracked ? "badge-partial" : "badge-down"}`}>
                      {entry.enabled ? "Enabled" : entry.tracked ? "Disabled" : "Untracked"}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-small ${entry.enabled ? "btn-ghost" : "btn-primary"}`}
                      disabled={updating === entry.name}
                      onClick={() => onToggle(entry.name, !entry.enabled)}
                    >
                      {updating === entry.name ? "Saving..." : entry.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ScalePreviewModal({ preview, executing, onCancel, onConfirm }) {
  if (!preview) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label="Scale preview">
        <div className="row-between">
          <div>
            <p className="eyebrow">Preview</p>
            <h3>{preview.action} · {preview.namespace}</h3>
          </div>
          <button className="icon-button subtle" onClick={onCancel} aria-label="Close">×</button>
        </div>
        <p className="meta">
          {preview.action === "scale-down"
            ? "These replicas will be snapshotted before any scaling happens."
            : `These replicas will be restored${preview.snapshotTimestamp ? ` from ${new Date(preview.snapshotTimestamp).toLocaleString()}` : ""}.`}
        </p>
        <div className="table-wrap modal-table">
          <table>
            <thead><tr><th>Workload</th><th>Kind</th><th>Current</th><th>Target</th></tr></thead>
            <tbody>
              {preview.workloads.map((workload) => (
                <tr key={`${workload.kind}/${workload.name}`}>
                  <td>{workload.name}</td>
                  <td>{workload.kind}</td>
                  <td>{workload.currentReplicas ?? workload.snapshotReplicas ?? "-"}</td>
                  <td>{workload.targetReplicas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wizard-actions">
          <button className="btn btn-ghost" disabled={executing} onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={executing} onClick={onConfirm}>{executing ? "Working..." : "Confirm"}</button>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [namespaces, setNamespaces] = useState([]);
  const [namespaceDetail, setNamespaceDetail] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [validation, setValidation] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [creatingCron, setCreatingCron] = useState(false);
  const [validating, setValidating] = useState(false);
  const [adminNamespaces, setAdminNamespaces] = useState([]);
  const [updatingNamespace, setUpdatingNamespace] = useState("");
  const [snapshots, setSnapshots] = useState([]);
  const [scalePreview, setScalePreview] = useState(null);
  const [pendingScale, setPendingScale] = useState(null);
  const [runningJob, setRunningJob] = useState("");

  const loadNamespaces = async () => {
    const data = await apiFetch("/api/status/namespaces");
    setNamespaces(data);
    return data;
  };

  const loadCron = async () => {
    const data = await apiFetch("/api/cron/jobs");
    setJobs(data);
  };

  const loadNamespaceDetail = async (namespace) => {
    const data = await apiFetch(`/api/status/namespace/${encodeURIComponent(namespace)}`);
    setNamespaceDetail(data);
  };

  const loadAdminNamespaces = async () => {
    const data = await apiFetch("/api/admin/namespaces");
    setAdminNamespaces(data);
    return data;
  };

  const loadSnapshots = async () => {
    const data = await apiFetch("/api/snapshots");
    setSnapshots(data);
    return data;
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch("/auth/me");
        setUser(me);
        const ns = await loadNamespaces();
        await loadCron();
        await loadSnapshots();
        if (me.role === "admin") {
          await loadAdminNamespaces();
        }
        if (ns[0]) {
          await loadNamespaceDetail(ns[0].name);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(loadNamespaces, 30000);
    return () => clearInterval(timer);
  }, [user]);

  const enabledNamespaces = namespaces.filter((n) => n.enabled);

  const toast = (msg) => setError(msg);

  if (loading) return <div className="splash">Loading...</div>;

  if (!user) {
    return <Login onLoggedIn={setUser} error={error} setError={setError} />;
  }

  return (
    <div className="app-shell">
      <header className="global-nav">
        <div className="brand">
          <span className="brand-mark small">KR</span>
          <div>
            <h1>KubeRest</h1>
            <p>Scheduler control center</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="user-pill">{user.username} · {user.role}</span>
          <button
            className="btn btn-utility"
            onClick={async () => {
              await apiFetch("/auth/logout", { method: "POST" });
              window.location.reload();
            }}
          >
            <Icon name="logout" /> Logout
          </button>
        </div>
      </header>

      <div className="subnav">
        <nav className="tabs" aria-label="Primary">
          {TABS.filter((tab) => !tab.adminOnly || user.role === "admin").map((tab) => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => {
                setActiveTab(tab.id);
                setError("");
              }}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <button className="icon-button" onClick={async () => {
          try {
            await loadNamespaces();
            if (activeTab === "cron") await loadCron();
            if (activeTab === "admin") await loadAdminNamespaces();
            if (activeTab === "snapshots") await loadSnapshots();
          } catch (err) {
            toast(err.message);
          }
        }} aria-label="Refresh">
          <Icon name="refresh" />
        </button>
      </div>

      <main className="content">
        {error ? (
          <div className="banner-error">
            <Icon name="warning" />
            <span>{error}</span>
            <button className="icon-button subtle" onClick={() => setError("")} aria-label="Dismiss">×</button>
          </div>
        ) : null}

        {activeTab === "dashboard" ? <Dashboard namespaces={namespaces} /> : null}

        {activeTab === "scale" ? (
          <ScalePanel
            user={user}
            namespaces={enabledNamespaces}
            detail={namespaceDetail}
            busyAction={busyAction}
            onNamespaceChange={loadNamespaceDetail}
            onScale={async (dir, ns) => {
              try {
                const preview = await apiFetch("/api/scale/preview", {
                  method: "POST",
                  body: JSON.stringify({ namespace: ns, direction: dir })
                });
                setPendingScale({ dir, ns });
                setScalePreview(preview);
              } catch (err) {
                toast(err.message);
              }
            }}
            onScaleWorkload={async (dir, ns, workload) => {
              const key = `${workload.kind}/${workload.name}`;
              try {
                const preview = await apiFetch("/api/scale/preview", {
                  method: "POST",
                  body: JSON.stringify({
                    namespace: ns,
                    direction: dir,
                    workload: {
                      kind: workload.kind,
                      name: workload.name
                    }
                  })
                });
                setPendingScale({ dir, ns, workload, key });
                setScalePreview(preview);
              } catch (err) {
                toast(err.message);
              }
            }}
          />
        ) : null}

        {activeTab === "cron" ? (
          <CronPanel
            user={user}
            jobs={jobs}
            namespaces={enabledNamespaces}
            creating={creatingCron}
            onUpdateSchedule={async (name, schedule) => {
              try {
                await apiFetch(`/api/cron/${encodeURIComponent(name)}/schedule`, {
                  method: "PATCH",
                  body: JSON.stringify({ schedule })
                });
                await loadCron();
              } catch (err) {
                toast(err.message);
              }
            }}
            onUpdateSuspend={async (name, suspend) => {
              try {
                await apiFetch(`/api/cron/${encodeURIComponent(name)}/suspend`, {
                  method: "PATCH",
                  body: JSON.stringify({ suspend })
                });
                await loadCron();
              } catch (err) {
                toast(err.message);
              }
            }}
            runningJob={runningJob}
            onRunNow={async (name) => {
              try {
                setRunningJob(name);
                await apiFetch(`/api/cron/${encodeURIComponent(name)}/run`, { method: "POST" });
                await loadCron();
              } catch (err) {
                toast(err.message);
              } finally {
                setRunningJob("");
              }
            }}
            onCreateJob={async (payload) => {
              try {
                setCreatingCron(true);
                await apiFetch("/api/cron/jobs", {
                  method: "POST",
                  body: JSON.stringify(payload)
                });
                await loadCron();
              } catch (err) {
                toast(err.message);
              } finally {
                setCreatingCron(false);
              }
            }}
          />
        ) : null}

        {activeTab === "snapshots" ? <SnapshotsPanel snapshots={snapshots} /> : null}

        {activeTab === "validate" ? (
          <ValidatePanel
            namespaces={enabledNamespaces}
            result={validation}
            validating={validating}
            onRun={async (ns) => {
              try {
                setValidating(true);
                const data = await apiFetch("/api/validate", {
                  method: "POST",
                  body: JSON.stringify({ namespace: ns })
                });
                setValidation(data);
              } catch (err) {
                toast(err.message);
              } finally {
                setValidating(false);
              }
            }}
          />
        ) : null}

        {activeTab === "admin" && user.role === "admin" ? (
          <AdminNamespacesPanel
            namespaces={adminNamespaces}
            updating={updatingNamespace}
            onToggle={async (name, enabled) => {
              try {
                setUpdatingNamespace(name);
                await apiFetch(`/api/admin/namespaces/${encodeURIComponent(name)}`, {
                  method: "PATCH",
                  body: JSON.stringify({ enabled })
                });
                await loadAdminNamespaces();
                const ns = await loadNamespaces();
                if (ns[0]) await loadNamespaceDetail(ns[0].name);
              } catch (err) {
                toast(err.message);
              } finally {
                setUpdatingNamespace("");
              }
            }}
          />
        ) : null}
        <ScalePreviewModal
          preview={scalePreview}
          executing={Boolean(busyAction)}
          onCancel={() => {
            setScalePreview(null);
            setPendingScale(null);
          }}
          onConfirm={async () => {
            if (!pendingScale) return;
            try {
              const { dir, ns, workload, key } = pendingScale;
              setBusyAction(workload ? `${dir}:${key}` : dir);
              await apiFetch(`/api/scale/${dir}${workload ? "/workload" : ""}`, {
                method: "POST",
                body: JSON.stringify({
                  namespace: ns,
                  ...(workload ? { workload: { kind: workload.kind, name: workload.name } } : {})
                })
              });
              await loadNamespaceDetail(ns);
              await loadNamespaces();
              await loadSnapshots();
              setScalePreview(null);
              setPendingScale(null);
            } catch (err) {
              toast(err.message);
            } finally {
              setBusyAction("");
            }
          }}
        />
      </main>
    </div>
  );
}
