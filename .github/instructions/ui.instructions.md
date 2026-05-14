# UI Instructions (Vanilla JS + HTML)

## General Rules

- All pages are static `.html` files in `src/ui/`
- Shared styles in `src/ui/css/style.css`
- Shared JS in `src/ui/js/common.js` (auth check, fetch wrapper, toast notifications)
- No frameworks, no build step, no bundler
- All API calls use `fetch()` with credentials: 'include' (for cookie)
- UI must reflect admin vs viewer role — hide action buttons for viewers

---

## Pages

### `login.html`
- Centered card: username + password fields, Login button
- On submit: `POST /auth/login`, on success redirect to `/dashboard`
- Show inline error on 401

### `dashboard.html`
- Header: app name, logged-in user + role, Logout button
- Nav: Dashboard | Scale | CronJobs | Validate
- Main: namespace cards
  - Each card shows: namespace name, # Deployments, # StatefulSets, current scale status (UP / DOWN / PARTIAL)
  - Status badge color: green = UP, red = DOWN, yellow = PARTIAL
  - Data from `GET /api/status/namespaces`
  - Auto-refreshes every 30 seconds

### `scale.html`
- Namespace selector (dropdown populated from config)
- Current workload table: name, kind, current replicas, snapshotted replicas (if exists)
- Action buttons (admin only): **Scale Down** | **Scale Up**
- Result panel: shows affected workloads + comms status after action
- Data from `GET /api/status/namespace/:ns`
- Actions: `POST /api/scale/down` `{ namespace }` and `POST /api/scale/up` `{ namespace }`

### `cron.html`
- Table of CronJobs: name, schedule (human-readable), status (Active/Suspended), last run, next run
- Admin actions per row: Suspend | Resume | Edit Schedule
- Edit Schedule: inline input field + Save button — calls `PATCH /api/cron/:name/schedule`
- Data from `GET /api/cron/jobs`

### `validate.html`
- Namespace selector
- **Run Validation** button (admin + viewer can trigger — read-only action)
- Results table: workload name, kind, namespace, status (PASS/FAIL), missing fields list
- Summary bar: X passing, Y failing out of Z total
- Data from `POST /api/validate` `{ namespace }`

---

## Shared JS (`src/ui/js/common.js`)

```js
// Auth check — call on every page load
async function checkAuth() {
  const res = await fetch('/auth/me', { credentials: 'include' });
  if (res.status === 401) { window.location.href = '/login.html'; return null; }
  return res.json();
}

// Fetch wrapper with error handling
async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Toast notification
function showToast(message, type = 'info') {
  // type: 'success' | 'error' | 'info'
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Role-based UI: hide elements with data-role="admin" for viewers
function applyRoleUI(role) {
  if (role !== 'admin') {
    document.querySelectorAll('[data-role="admin"]').forEach(el => el.style.display = 'none');
  }
}
```

---

## CSS Design Tokens (`src/ui/css/style.css`)

Minimalist dark-ish theme appropriate for an internal tool:

```css
:root {
  --bg: #f4f6f9;
  --card-bg: #ffffff;
  --primary: #2563eb;
  --danger: #dc2626;
  --success: #16a34a;
  --warning: #d97706;
  --text: #111827;
  --text-muted: #6b7280;
  --border: #e5e7eb;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0,0,0,0.1);
}
```

Status badges: `.badge-up` (green), `.badge-down` (red), `.badge-partial` (yellow)
Action buttons: `.btn-primary`, `.btn-danger`, `.btn-ghost`

---

## UX Rules

- All destructive actions (scale down) show a confirmation dialog before firing
- Loading state: disable button + show spinner text while fetch is in-flight
- Never show raw K8s errors to the user — show the `error` field from API response
- Viewer role: action buttons are hidden via `data-role="admin"`, not just disabled
