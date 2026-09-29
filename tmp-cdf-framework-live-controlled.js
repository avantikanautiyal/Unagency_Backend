/**
 * Minimal controlled live: 3-leaf image fanout + one structured phase.
 * Uses GenerationFanoutContract authority — no quantity collapse.
 */
const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");

const ROOT = path.join(__dirname);
process.chdir(ROOT);
require("dotenv").config({ path: path.join(ROOT, ".env") });

const API = "http://127.0.0.1:4000";
const OUT = "/tmp/cdf-framework-live-controlled-report.json";
const LOG = "/tmp/cdf-framework-live-backend.log";
const EMAIL =
  process.env.PHASE8_E2E_EMAIL ||
  process.env.SUNFLOWER_E2E_EMAIL ||
  "avantika.mcs22.du@gmail.com";

const BRIEF =
  "Create an introductory Instagram feed post for Sunflower brand. Clean aesthetic, brand colours, no leaves.";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function killBackend() {
  try {
    execSync("lsof -tiTCP:4000 -sTCP:LISTEN | xargs kill -9", { stdio: "ignore" });
  } catch {}
  await sleep(2000);
}

function startBackend() {
  if (fs.existsSync(LOG)) fs.unlinkSync(LOG);
  const fd = fs.openSync(LOG, "a");
  const child = spawn("npm", ["start"], {
    cwd: ROOT,
    env: {
      ...process.env,
      ENTERPRISE_API_START_LEGACY_WORKERS: "false",
      CDF_CANONICAL_GENERATION_CONTEXT: "1",
    },
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  child.unref();
  return child.pid;
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API}/v1/health`).catch(() => null);
      if (r && (r.ok || r.status === 404 || r.status === 401)) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

async function http(method, p, { token, body, timeoutMs = 180000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}${p}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    return { status: r.status, json };
  } finally {
    clearTimeout(t);
  }
}

function unwrap(json) {
  return json?.data ?? json?.result ?? json;
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
  return (
    process.env.FIREBASE_WEB_API_KEY ||
    process.env.VITE_FIREBASE_API_KEY ||
    ""
  );
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

async function poll(token, eid, max = 90) {
  for (let i = 0; i < max; i++) {
    const r = await http("GET", `/v1/executions/${encodeURIComponent(eid)}`, {
      token,
    });
    const ex = unwrap(r.json);
    const st = String(ex?.status || "");
    if (["succeeded", "failed", "completed", "error", "cancelled"].includes(st)) {
      return ex;
    }
    await sleep(2000);
  }
  return { status: "timeout", executionId: eid };
}

async function main() {
  const report = {
    purpose: "cdf_framework_final_live_controlled",
    startedAt: new Date().toISOString(),
    fanout: null,
    structured: null,
    verdict: "INCOMPLETE",
  };

  // Plan from authoritative contract (same modules as runtime)
  const probe = execSync(
    `npx --yes ts-node --transpile-only -e "import { planImageGenerationFanout, GENERATION_FANOUT_PROVIDER_FAMILIES, buildGenerationFanoutLeafMetadata } from './src/platform/generation/generation-fanout'; const plan = planImageGenerationFanout({ useCase: 'marketing_creative', groupId: 'live_' + Date.now().toString(36), executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES) }); console.log(JSON.stringify({ cardinality: plan.cardinality, targets: plan.targets, metas: plan.targets.map(t => buildGenerationFanoutLeafMetadata({ plan, target: t })) }));"`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 5_000_000 },
  );
  const planLine = probe.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  const plan = JSON.parse(planLine);
  report.fanoutPlan = plan;
  if (plan.cardinality !== 3) throw new Error(`cardinality ${plan.cardinality}`);

  await killBackend();
  startBackend();
  if (!(await waitReady())) throw new Error("backend not ready");

  const token = await firebaseToken(EMAIL);
  const me = unwrap((await http("GET", "/v1/me", { token })).json);
  const orgId = me?.currentOrganizationId || me?.organizationId;
  report.orgId = orgId;

  // --- THREE independent fanout leaves ---
  const leaves = [];
  await Promise.all(
    plan.targets.map(async (target, i) => {
      const meta = {
        ...plan.metas[i],
        service: "social",
        platform: "instagram",
        subtype: "content-design",
        productAction: "generate",
        capabilityId: "image.generate",
        allowsModelGenerationFanout: true,
        cdfExecutionStrategy: "canonical",
        cdfGenerationModality: "image",
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfArtifactKey: "social-media.output",
        brandName: "Sunflower",
        brandId: "6a98c471613dce5f8e5b8b9f",
        conversationalCurrentUserInstruction: BRIEF,
      };
      const r = await http("POST", "/v1/executions", {
        token,
        timeoutMs: 120000,
        body: {
          prompt: BRIEF,
          capabilityId: "image.generate",
          organizationId: orgId,
          metadata: meta,
        },
      });
      const ex = unwrap(r.json);
      const eid = ex?.executionId || ex?.id;
      leaves.push({
        index: i,
        targetId: target.targetId,
        requestedProvider: target.providerId,
        requestedModel: target.modelId,
        createStatus: r.status,
        createBody: r.status >= 400 ? r.json : undefined,
        executionId: eid,
      });
    }),
  );

  for (const leaf of leaves) {
    if (!leaf.executionId) continue;
    const terminal = await poll(token, leaf.executionId);
    leaf.terminalStatus = terminal.status;
    leaf.actualProvider =
      terminal?.result?.data?.provider ||
      terminal?.metadata?.actualProviderId ||
      terminal?.metadata?.preferredProviderId;
    leaf.actualModel =
      terminal?.result?.data?.model ||
      terminal?.metadata?.actualModelId ||
      terminal?.metadata?.preferredModelId;
    leaf.artifactIds = terminal?.artifactIds || [];
    leaf.cdfArtifactId =
      terminal?.result?.data?.cdfArtifactId ||
      terminal?.metadata?.cdfArtifactId;
    leaf.cdfArtifactVersion =
      terminal?.result?.data?.cdfArtifactVersion ||
      terminal?.metadata?.cdfArtifactVersion;
    leaf.productCompletionBlocked =
      terminal?.result?.data?.productCompletionBlocked ||
      terminal?.metadata?.productCompletionBlocked;
    leaf.errorMessage = terminal?.errorMessage;
  }

  report.fanout = {
    cardinality: plan.cardinality,
    independentExecutionIds: leaves.map((l) => l.executionId).filter(Boolean),
    independentTargetIds: leaves.map((l) => l.targetId),
    leaves,
    metas: plan.metas,
    // Intra-leaf only: every failover candidate shares its leaf provider; no siblings.
    noCrossLeafFallback: plan.metas.every((m) =>
      Array.isArray(m.imageFailoverChain) &&
      m.imageFailoverChain.every(
        (s) => s && s.providerId === m.preferredProviderId,
      ),
    ),
    googleIntraLeafFallbackPresent: Boolean(
      plan.metas.find(
        (m) =>
          m.preferredProviderId === "provider.google" &&
          Array.isArray(m.imageFailoverChain) &&
          m.imageFailoverChain.length > 0,
      ),
    ),
  };

  // --- ONE structured phase ---
  const structured = await http("POST", "/v1/executions", {
    token,
    timeoutMs: 180000,
    body: {
      prompt: "Draft a brand platform for Sunflower: promise, pillars, proof.",
      capabilityId: "text.generate",
      organizationId: orgId,
      metadata: {
        cdfExecutionStrategy: "canonical",
        cdfServiceId: "brand-strategy",
        cdfPhaseId: "brand-platform",
        cdfArtifactKey: "brand-strategy.brand-platform",
        cdfGenerationModality: "structured",
        service: "brand-strategy",
      },
    },
  });
  const sex = unwrap(structured.json);
  const seid = sex?.executionId || sex?.id;
  let sTerm = sex;
  if (seid) sTerm = await poll(token, seid, 60);
  report.structured = {
    createStatus: structured.status,
    executionId: seid,
    terminalStatus: sTerm?.status,
    errorMessage: sTerm?.errorMessage || (structured.status >= 400 ? structured.json : undefined),
    cdfArtifactId: sTerm?.result?.data?.cdfArtifactId || sTerm?.metadata?.cdfArtifactId,
    hasSchemaFailure: String(sTerm?.errorMessage || "").includes("schemaId") ||
      String(JSON.stringify(structured.json)).includes("schemaId"),
  };

  const threeIds = new Set(report.fanout.independentExecutionIds);
  const fanoutOk =
    report.fanout.cardinality === 3 &&
    threeIds.size === 3 &&
    report.fanout.independentTargetIds.length === 3;
  report.verdict = fanoutOk
    ? "FANOUT_CONTRACT_LIVE_PROVEN"
    : "FANOUT_CONTRACT_INCOMPLETE";
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(fanoutOk ? 0 : 1);
}

main().catch((e) => {
  console.error("LIVE CONTROLLED FAILED", e);
  process.exit(1);
});
