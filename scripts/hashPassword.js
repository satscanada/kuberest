#!/usr/bin/env node

const bcrypt = require("bcryptjs");

const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
const password = process.argv[2];

if (!password) {
  console.error("Usage: node scripts/hashPassword.js <password>");
  console.error("       npm run hash-password -- <password>");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, rounds);
console.log(hash);
