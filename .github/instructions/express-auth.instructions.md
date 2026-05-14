# Express + Auth Instructions

## Server Bootstrap (`src/server.js`)

```js
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { loadConfig } = require('./config');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'ui')));

// Mount routes
app.use('/auth', require('./routes/auth'));
app.use('/api/scale', require('./routes/scale'));
app.use('/api/cron', require('./routes/cron'));
app.use('/api/validate', require('./routes/validate'));
app.use('/api/status', require('./routes/status'));

// UI catch-all — serve HTML pages
app.get(['/dashboard', '/scale', '/cron', '/validate'], (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', `${req.path.slice(1)}.html`));
});

app.get('/', (req, res) => res.redirect('/dashboard'));
```

---

## Auth Pattern (`src/routes/auth.js`)

### Login
- `POST /auth/login` — accepts `{ username, password }`
- Look up user in `config.auth.users` by username
- Compare password with `bcryptjs.compare()`
- On success: sign JWT with `{ username, role }`, set as `httpOnly` cookie named `kuberest_token`
- On failure: return `401`

### Logout
- `POST /auth/logout` — clear the cookie, return `200`

### Middleware — `requireAuth(roles[])`

```js
function requireAuth(roles = []) {
  return (req, res, next) => {
    const token = req.cookies?.kuberest_token;
    if (!token) return res.status(401).json({ error: 'Unauthenticated' });
    try {
      const payload = jwt.verify(token, config.auth.jwt_secret);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}
```

Export `requireAuth` and use it on all `/api/*` routes.

Admin-only routes: `POST /api/scale/*`, `POST /api/cron/*`
Viewer-allowed routes: `GET /api/status/*`, `GET /api/validate/*`, `GET /api/cron/*`

---

## UI Auth Guard (client-side)

Every HTML page includes a `checkAuth()` call on load:

```js
async function checkAuth() {
  const res = await fetch('/auth/me');
  if (res.status === 401) window.location.href = '/login';
}
```

Add `GET /auth/me` endpoint that returns `{ username, role }` from the JWT or `401`.

---

## Config Module (`src/config.js`)

```js
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

let _config = null;

function loadConfig() {
  if (_config) return _config;
  const raw = fs.readFileSync(path.join(__dirname, '..', 'config.yaml'), 'utf8');
  _config = yaml.load(raw);
  return _config;
}

module.exports = { loadConfig };
```

Config is loaded once. Never re-read per request.

---

## Response Conventions

All API responses follow:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Human-readable message" }
```

HTTP status codes:
- `200` — success
- `400` — bad input
- `401` — unauthenticated
- `403` — forbidden (wrong role)
- `500` — K8s or internal error

---

## Logging

Use `pino` with level from env:

```js
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
```

Log every scale action and validation trigger at `info` level. Log K8s errors at `error` level. No `console.log` in route or K8s files.
