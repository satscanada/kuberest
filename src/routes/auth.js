const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { loadConfig } = require("../config");
const logger = require("../logger");

const router = express.Router();
const config = loadConfig();
const COOKIE_NAME = "kuberest_token";

function requireAuth(roles = []) {
  return (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];

    if (!token) {
      return res.status(401).json({ success: false, error: "Unauthenticated" });
    }

    try {
      const payload = jwt.verify(token, config.auth.jwt_secret);

      if (roles.length > 0 && !roles.includes(payload.role)) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }

      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }
  };
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, error: "Username and password are required" });
  }

  const user = config.auth.users.find((entry) => entry.username === username);

  if (!user) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { username: user.username, role: user.role },
    config.auth.jwt_secret,
    { expiresIn: config.auth.token_expiry || "8h" }
  );

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  logger.info({ username: user.username, role: user.role }, "User logged in");

  return res.json({
    success: true,
    data: { username: user.username, role: user.role }
  });
});

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  return res.json({ success: true, data: {} });
});

router.get("/me", requireAuth(), (req, res) => {
  return res.json({
    success: true,
    data: { username: req.user.username, role: req.user.role }
  });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
