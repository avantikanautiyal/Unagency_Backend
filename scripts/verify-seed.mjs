#!/usr/bin/env node
/**
 * Verify demo seed by hitting key API endpoints with a Firebase ID token.
 *
 * Usage:
 *   DEMO_FIREBASE_TOKEN=<id_token> node scripts/verify-seed.mjs
 *   node scripts/verify-seed.mjs --email demo@unagency.test --password DemoPass123!
 *
 * Get a token via Firebase REST API (requires FIREBASE_API_KEY in .env or env):
 *   curl -s "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_API_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"demo@unagency.test","password":"DemoPass123!","returnSecureToken":true}' | jq -r .idToken
 */
import { config } from "dotenv";
config();

const BASE_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || "demo@unagency.test";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "DemoPass123!";

async function getTokenFromPassword(email, password) {
  const rawKey = process.env.FIREBASE_API_KEY || process.env.apiKey || "";
  const apiKey = rawKey.replace(/["',\s]/g, "");
  if (!apiKey) {
    throw new Error("Set FIREBASE_API_KEY or apiKey in .env to sign in with password");
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Firebase sign-in failed");
  }
  return data.idToken;
}

async function resolveToken() {
  if (process.env.DEMO_FIREBASE_TOKEN) return process.env.DEMO_FIREBASE_TOKEN;

  const emailArg = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
  const passwordArg = process.argv.find((a) => a.startsWith("--password="))?.split("=")[1];

  return getTokenFromPassword(emailArg || DEMO_EMAIL, passwordArg || DEMO_PASSWORD);
}

async function check(name, method, path, token, { expectMin = 1, key } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await res.json().catch(() => ({}));
  const data = body?.data ?? body;
  const list = key ? data?.[key] : Array.isArray(data) ? data : data ? [data] : [];
  const count = Array.isArray(list) ? list.length : data ? 1 : 0;
  const ok = res.ok && count >= expectMin;

  console.log(`${ok ? "✓" : "✗"} ${name} — ${res.status} (${count} items)`);
  if (!ok) console.log("  ", JSON.stringify(body).slice(0, 200));
  return ok;
}

async function main() {
  console.log(`\n🔍 Verifying demo seed at ${BASE_URL}\n`);

  const token = await resolveToken();

  const results = await Promise.all([
    check("Categories", "GET", "/categories", token, { expectMin: 8 }),
    check("Razorpay plans", "GET", "/razorpay/plans", token, { expectMin: 5 }),
    check("Current subscription", "GET", "/razorpay/subscriptions/current", token, { expectMin: 1 }),
    check("Requirements", "GET", "/requirement", token, { expectMin: 3 }),
    check("Projects", "GET", "/projects", token, { expectMin: 4 }),
    check("Organization", "GET", "/organizations/user-organization", token, { expectMin: 1 }),
    check("Notifications", "GET", "/notification", token, { expectMin: 5 }),
    check("Payment history", "GET", "/razorpay/payment/history", token, { expectMin: 2 }),
    check("Chat token", "GET", "/chat/token", token, { expectMin: 1 }),
    check("RM chat", "GET", "/chat/myRMChat", token, { expectMin: 0 }),
    check("Auth verify", "GET", "/auth/verify", token, { expectMin: 1 }),
  ]);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Verify failed:", err.message);
  process.exit(1);
});
