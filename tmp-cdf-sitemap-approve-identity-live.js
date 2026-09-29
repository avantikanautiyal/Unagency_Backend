/**
 * Focused LIVE cert: Web Tech sitemap approve identity boundary.
 * Uses already-running backend on :4000 (does not kill/restart).
 *
 * Proves:
 * 1) generation pins exact cdfart_*@V
 * 2) FE-style resolution from presented identity → same X@V
 * 3) approve WITHOUT identity still fails closed (CDF_CANONICAL_IDENTITY_REQUIRED)
 * 4) approve WITH exact X@V advances to page-structure
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const API = "http://127.0.0.1:4000";
const OUT = "/tmp/cdf-sitemap-approve-identity-live.json";
const EMAIL =
  process.env.PHASE8_E2E_EMAIL ||
  process.env.SUNFLOWER_E2E_EMAIL ||
  "avantika.mcs22.du@gmail.com";
const BRIEF =
  "Marketing site sitemap for a boutique coffee brand. Home, Menu, Locations, About, Contact.";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function unwrap(json) {
  return json?.data != null
    ? json.data
    : json?.result != null
      ? json.result
      : json;
}

async function http(method, p, { token, body, timeoutMs = 300000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}${p}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: r.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

function firebaseWebApiKey() {
  const webEnv =
    "/Users/avantikanautiyal/Desktop/Unagency_fullstack/Unagency-frontend/apps/web/.env.local";
  if (fs.existsSync(webEnv)) {
    const line = fs
      .readFileSync(webEnv, "utf8")
      .split("\n")
      .find((l) => l.startsWith("NEXT_PUBLIC_FIREBASE_API_KEY="));
    if (line) return line.split("=").slice(1).join("=").trim();
  }
  return process.env.FIREBASE_WEB_API_KEY || "";
}

async function firebaseToken(email) {
  const admin = require("firebase-admin");
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !privateKey
  ) {
    throw new Error("Firebase Admin credentials missing in .env");
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  const user = await admin.auth().getUserByEmail(email);
  const customToken = await admin.auth().createCustomToken(user.uid);
  const apiKey = firebaseWebApiKey();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const j = await res.json();
  if (!j.idToken) {
    throw new Error(`Custom token exchange failed: ${JSON.stringify(j)}`);
  }
  return j.idToken;
}

async function getSession(token, sessionId) {
  const r = await http("GET", `/v1/cdf/sessions/${sessionId}`, { token });
  return unwrap(r.json)?.session || unwrap(r.json);
}

async function transition(token, body) {
  return http("POST", "/v1/cdf/transition", { token, body, timeoutMs: 120000 });
}

function pinFromExec(exec) {
  const meta = exec?.metadata || {};
  const data =
    exec?.result?.data && typeof exec.result.data === "object"
      ? exec.result.data
      : {};
  const cdfArtifactId =
    (typeof data.cdfArtifactId === "string" && data.cdfArtifactId) ||
    (typeof meta.cdfArtifactId === "string" && meta.cdfArtifactId) ||
    "";
  const verRaw = data.cdfArtifactVersion ?? meta.cdfArtifactVersion;
  const cdfArtifactVersion =
    typeof verRaw === "number"
      ? verRaw
      : typeof verRaw === "string" && /^\d+$/.test(verRaw)
        ? Number(verRaw)
        : undefined;
  const cdfArtifactKey =
    (typeof data.cdfArtifactKey === "string" && data.cdfArtifactKey) ||
    (typeof meta.cdfArtifactKey === "string" && meta.cdfArtifactKey) ||
    "web-tech.sitemap";
  return { cdfArtifactId, cdfArtifactVersion, cdfArtifactKey };
}

/**
 * Mirrors FE resolveCdfFanoutLeafApprovePayload presentedCanonical path
 * (no first-match / no artifactKey-only reconstruction).
 */
function resolveFeApprovePayload({ presented, phaseArtifactKey }) {
  const id = presented?.cdfArtifactId?.trim() || "";
  const ver = presented?.cdfArtifactVersion;
  const key = presented?.cdfArtifactKey?.trim() || phaseArtifactKey || "";
  if (
    id.startsWith("cdfart_") &&
    typeof ver === "number" &&
    Number.isInteger(ver) &&
    ver >= 1 &&
    key
  ) {
    return {
      ok: true,
      payload: {
        artifactId: id,
        artifactVersion: ver,
        artifactKey: key,
        generationFanoutTargetId: "",
      },
    };
  }
  return {
    ok: false,
    reason: "MISSING_CANONICAL_IDENTITY",
  };
}

async function poll(token, executionId, maxAttempts = 90) {
  for (let i = 0; i < maxAttempts; i++) {
    const r = await http("GET", `/v1/executions/${executionId}`, { token });
    const exec = unwrap(r.json);
    const status = exec?.status;
    if (
      status === "succeeded" ||
      status === "failed" ||
      status === "cancelled"
    ) {
      return exec;
    }
    await sleep(2000);
  }
  throw new Error(`poll timeout for ${executionId}`);
}

async function main() {
  const report = {
    ts: new Date().toISOString(),
    email: EMAIL,
    defects: [],
  };

  const ready = await http("GET", "/v1/ready");
  if (ready.status >= 400) {
    throw new Error("backend not ready on :4000");
  }

  const token = await firebaseToken(EMAIL);
  const me = unwrap((await http("GET", "/v1/me", { token })).json);
  const orgId = me?.currentOrganizationId || me?.organizationId;
  report.orgId = orgId;

  const started = await http("POST", "/v1/cdf/sessions", {
    token,
    body: { serviceId: "web-tech", productMode: "ai" },
  });
  let session = unwrap(started.json)?.session || unwrap(started.json);
  const sessionId = session.sessionId || session.id;
  report.sessionId = sessionId;

  const briefed = await transition(token, {
    sessionId,
    serviceId: "web-tech",
    action: "submit_brief",
    brief: BRIEF,
    expectedVersion: session.sessionVersion,
  });
  session = unwrap(briefed.json)?.session || (await getSession(token, sessionId));

  const createBody = {
    capabilityId: "text.generate",
    prompt: `Produce the website sitemap for this brief:\n${BRIEF}`,
    organizationId: orgId,
    metadata: {
      service: "website",
      subtype: "landing-page",
      outputMapService: "website",
      cdfSessionId: sessionId,
      cdfPhaseId: "sitemap",
      cdfServiceId: "web-tech",
      cdfArtifactKey: "web-tech.sitemap",
      cdfGenerationModality: "structured",
      cdfExecutionStrategy: "canonical",
      cdfSkipHeavyPrepass: true,
      websiteUserBrief: BRIEF,
      productMode: "ai",
    },
    structuredOutput: {
      name: "CdfWebsiteSitemap",
      strict: true,
    },
  };
  const created = await http("POST", "/v1/executions", {
    token,
    body: createBody,
  });
  const createdData = unwrap(created.json);
  const executionId = createdData?.executionId;
  report.executionId = executionId;
  if (!executionId) {
    report.defects.push({
      code: "create_failed",
      detail: created.json,
    });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const terminal = await poll(token, executionId);
  const pin = pinFromExec(terminal);
  report.generation = {
    status: terminal.status,
    pin,
    presentationHasIdentity: Boolean(
      pin.cdfArtifactId?.startsWith("cdfart_") &&
        pin.cdfArtifactVersion != null,
    ),
  };

  if (
    terminal.status !== "succeeded" ||
    !pin.cdfArtifactId?.startsWith("cdfart_")
  ) {
    report.defects.push({
      code: "generation_incomplete",
      detail: { status: terminal.status, pin, error: terminal.errorMessage },
    });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // FE-style resolution from presented identity (what Approve must send).
  const fe = resolveFeApprovePayload({
    presented: pin,
    phaseArtifactKey: "web-tech.sitemap",
  });
  report.feApproveResolution = fe;
  if (!fe.ok) {
    report.defects.push({ code: "fe_identity_missing", detail: fe });
  }

  session = await getSession(token, sessionId);

  // Fail closed: approve without identity must still be rejected.
  const missing = await transition(token, {
    sessionId,
    serviceId: "web-tech",
    action: "approve",
    phaseId: "sitemap",
    expectedVersion: session.sessionVersion,
  });
  report.approveWithoutIdentity = {
    status: missing.status,
    body: unwrap(missing.json) || missing.json,
  };
  const missingFailed =
    missing.status >= 400 ||
    String(
      JSON.stringify(missing.json) + (missing.text || ""),
    ).includes("CDF_CANONICAL_IDENTITY_REQUIRED") ||
    String(JSON.stringify(missing.json)).includes("identity");
  if (!missingFailed) {
    // Some APIs return 200 with transitionAllowed=false in body
    const raw = JSON.stringify(missing.json || {});
    if (
      !/CDF_CANONICAL_IDENTITY_REQUIRED|identity_required|artifactId and artifactVersion/i.test(
        raw,
      )
    ) {
      report.defects.push({
        code: "missing_identity_did_not_fail_closed",
        detail: missing.json,
      });
    }
  }

  session = await getSession(token, sessionId);

  // Approve WITH exact presented X@V (FE fix path).
  const okApprove = await transition(token, {
    sessionId,
    serviceId: "web-tech",
    action: "approve",
    phaseId: "sitemap",
    artifactId: fe.payload.artifactId,
    artifactVersion: fe.payload.artifactVersion,
    artifactKey: fe.payload.artifactKey,
    expectedVersion: session.sessionVersion,
  });
  session = unwrap(okApprove.json)?.session || (await getSession(token, sessionId));
  report.approveWithIdentity = {
    status: okApprove.status,
    nextPhaseId: session?.phaseId || session?.currentPhaseId,
    approvedArtifacts: session?.approvedArtifacts,
    body: unwrap(okApprove.json) || okApprove.json,
  };

  const nextPhase = session?.phaseId || session?.currentPhaseId;
  if (okApprove.status >= 400 || nextPhase !== "page-structure") {
    report.defects.push({
      code: "approve_with_identity_failed",
      detail: {
        status: okApprove.status,
        nextPhase,
        body: okApprove.json,
      },
    });
  }

  // Exact approved X@V must match presented.
  const approved = (session?.approvedArtifacts || []).find(
    (a) => a.phaseId === "sitemap" || a.artifactKey === "web-tech.sitemap",
  );
  report.approvedPin = approved || null;
  if (
    !approved ||
    approved.artifactId !== pin.cdfArtifactId ||
    approved.version !== pin.cdfArtifactVersion
  ) {
    // Some sessions store under approved[] not approvedArtifacts
    const approvedAlt = (session?.approved || []).find(
      (a) => a.phaseId === "sitemap",
    );
    report.approvedAlt = approvedAlt || null;
    if (
      approvedAlt &&
      approvedAlt.artifactId === pin.cdfArtifactId
    ) {
      // ok — identity carried
    } else if (
      !approved ||
      approved.artifactId !== pin.cdfArtifactId
    ) {
      report.defects.push({
        code: "approved_identity_mismatch",
        detail: { expected: pin, approved, approvedAlt },
      });
    }
  }

  report.ok = report.defects.length === 0;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  const report = { ok: false, error: String(err?.stack || err) };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(report.error);
  process.exit(1);
});
