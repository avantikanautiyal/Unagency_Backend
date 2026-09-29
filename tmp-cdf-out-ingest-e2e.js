/**
 * REAL HTTP: canonical output image → ArtifactVersion → generatedArtifacts.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { MongoClient } = require("mongodb");

const ROOT = "/Users/avantikanautiyal/Desktop/Unagency_fullstack/unagency-backend";
process.chdir(ROOT);
require("dotenv").config({ path: path.join(ROOT, ".env") });

const API = "http://127.0.0.1:4000";
const WEB_ENV =
  "/Users/avantikanautiyal/Desktop/Unagency_fullstack/Unagency-frontend/apps/web/.env.local";
const report = { defects: [], steps: [] };

function step(name, data) {
  report.steps.push({ name, ...data });
  console.log("\n===", name, "===");
  console.log(JSON.stringify(data, null, 2));
}
function defect(d) {
  report.defects.push(d);
  console.error("\n*** DEFECT ***", JSON.stringify(d, null, 2));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function unwrap(json) {
  return json?.data != null ? json.data : json;
}
async function http(method, p, { token, body, timeoutMs = 120000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${p}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 800) };
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}
async function waitReady(maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${API}/v1/ready`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {}
    await sleep(1500);
  }
  return false;
}
async function killBackend() {
  const { execSync } = require("child_process");
  try {
    execSync("lsof -tiTCP:4000 -sTCP:LISTEN | xargs kill -9", { stdio: "ignore" });
  } catch {}
  await sleep(2000);
}
function startBackend() {
  const log = fs.openSync("/tmp/unagency-backend-out-ingest-e2e.log", "a");
  fs.writeSync(log, `\n--- spawn ${new Date().toISOString()}\n`);
  const child = spawn("npm", ["start"], {
    cwd: ROOT,
    env: { ...process.env, ENTERPRISE_API_START_LEGACY_WORKERS: "false" },
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  return child.pid;
}
async function firebaseToken() {
  const apiKey = fs
    .readFileSync(WEB_ENV, "utf8")
    .split("\n")
    .find((l) => l.startsWith("NEXT_PUBLIC_FIREBASE_API_KEY="))
    .split("=")[1]
    .trim();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "demo@unagency.test",
        password: "DemoPass123!",
        returnSecureToken: true,
      }),
    },
  );
  const j = await res.json();
  if (!j.idToken) throw new Error(`Firebase login failed: ${JSON.stringify(j)}`);
  return j.idToken;
}
function pin(ref) {
  if (!ref) return null;
  return {
    artifactKey: ref.artifactKey,
    artifactId: ref.artifactId,
    version: ref.version,
    role: ref.role,
    phaseId: ref.phaseId,
  };
}
async function pollExecution(token, eid, maxPolls = 150) {
  for (let i = 0; i < maxPolls; i++) {
    await sleep(3000);
    const r = await http("GET", `/v1/executions/${eid}`, { token, timeoutMs: 30000 });
    const ex = unwrap(r.json);
    const status = ex?.status || ex?.state;
    if (["succeeded", "failed", "completed", "error", "cancelled"].includes(status)) {
      return { status, ex };
    }
  }
  return { status: "timeout", ex: null };
}
async function mongoOutput(sessionId) {
  const client = new MongoClient(process.env.DB_URI);
  await client.connect();
  try {
    const bag = await client
      .db()
      .collection("cdf_canonical_artifact_bags")
      .findOne({ bagKey: "global" });
    const arts = bag?.snapshot?.artifacts || [];
    const vers = bag?.snapshot?.versions || [];
    const outArts = arts.filter(
      (a) => a.sessionId === sessionId && a.artifactKey === "social-media.output",
    );
    const outVers = vers.filter((v) =>
      outArts.some((a) => a.artifactId === v.artifactId),
    );
    return {
      outputArtifacts: outArts.map((a) => ({
        id: a.artifactId,
        key: a.artifactKey,
        latest: a.latestVersion,
      })),
      outputVersions: outVers.map((v) => ({
        id: v.artifactId,
        version: v.version,
        hasPreview: !!(v.data && v.data.previewAssetRef),
        previewVault: v.data?.previewAssetRef?.vaultAssetId,
        status: v.status,
      })),
    };
  } finally {
    await client.close();
  }
}

async function main() {
  console.log("Restarting backend with canonical image ingest bridge…");
  await killBackend();
  startBackend();
  if (!(await waitReady())) throw new Error("backend not ready");

  let token = await firebaseToken();
  const brief =
    "Create an Instagram Feed Post for Mango Pulse, an everyday energy drink. Warm, joyful, youthful. Objective: introduce the brand with everyday energy for Tuesday afternoons.";

  let r = await http("POST", "/v1/cdf/sessions", {
    token,
    body: { serviceId: "social-media", productMode: "ai" },
  });
  let session = unwrap(r.json)?.session;
  const sid = session.sessionId;
  const orgId = session.organizationId;
  step("start", { sid });

  r = await http("POST", "/v1/cdf/transition", {
    token,
    body: { sessionId: sid, action: "submit_brief", brief, expectedVersion: session.sessionVersion },
  });
  session = unwrap(r.json)?.session ?? session;

  for (const label of ["Instagram", "Feed Post"]) {
    r = await http("POST", "/v1/cdf/transition", {
      token,
      body: {
        sessionId: sid,
        action: "select_route",
        routeIndex: 0,
        routeLabel: label,
        expectedVersion: session.sessionVersion,
      },
    });
    session = unwrap(r.json)?.session ?? session;
  }

  r = await http("POST", "/v1/executions", {
    token,
    timeoutMs: 60000,
    body: {
      prompt: `${brief}\n\nGenerate exactly 3 creative directions.`,
      capabilityId: "text.generate",
      organizationId: orgId,
      providerId: "provider.openai",
      modelId: "gpt-4o",
      metadata: {
        service: "social",
        subtype: "content-design",
        platform: "Instagram",
        format: "Feed Post",
        productAction: "generate",
        cdfSessionId: sid,
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
        cdfArtifactKey: "social-media.routes",
        cdfExecutionStrategy: "canonical",
        cdfGenerator: "text",
        cdfSemanticRole: "text_choice",
        cdfOmitStructuredOutput: true,
        forceWriteCopy: true,
        preferredProviderId: "provider.openai",
        preferredModelId: "gpt-4o",
      },
    },
  });
  let ex = unwrap(r.json);
  let eid = ex?.executionId || ex?.id;
  let polled = { status: ex?.status, ex };
  if (ex?.status !== "succeeded" && ex?.status !== "failed") {
    polled = await pollExecution(token, eid);
  }
  step("routes_gen", { eid, status: polled.status, err: polled.ex?.errorMessage });
  if (polled.status !== "succeeded") throw new Error("routes gen failed");

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session ?? session;
  const routesGen = pin(
    (session.generatedArtifacts || []).find((x) => x.artifactKey === "social-media.routes"),
  );
  step("routes_pin", { routesGen });

  r = await http("POST", "/v1/cdf/transition", {
    token,
    body: {
      sessionId: sid,
      action: "select_route",
      routeIndex: 0,
      expectedVersion: session.sessionVersion,
      artifactId: routesGen.artifactId,
      artifactVersion: routesGen.version,
      artifactKey: routesGen.artifactKey,
    },
  });
  session = unwrap(r.json)?.session ?? session;

  // restart gate (continuity already proven; keep in path)
  await killBackend();
  startBackend();
  if (!(await waitReady())) throw new Error("backend not ready after restart");
  token = await firebaseToken();

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session;
  step("after_restart", {
    selected: pin(
      (session?.selectedArtifacts || []).find((x) => x.artifactKey === "social-media.routes"),
    ),
    abr: session ? `${session.activeBriefId}@v${session.activeBriefVersion}` : null,
  });

  r = await http("POST", "/v1/executions", {
    token,
    timeoutMs: 60000,
    body: {
      prompt: `${brief}\n\nGenerate the social creative for the selected direction.`,
      capabilityId: "image.generate",
      organizationId: orgId,
      metadata: {
        service: "social",
        subtype: "content-design",
        platform: "Instagram",
        format: "Feed Post",
        productAction: "generate",
        cdfSessionId: sid,
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfArtifactKey: "social-media.output",
        cdfExecutionStrategy: "canonical",
        cdfGenerator: "image",
        cdfSemanticRole: "final_visual",
        forceWriteCopy: true,
      },
    },
  });
  ex = unwrap(r.json);
  eid = ex?.executionId || ex?.id;
  step("output_create", {
    httpStatus: r.status,
    eid,
    status: ex?.status,
    error: r.status >= 400 ? r.json : null,
  });
  if (r.status >= 400) {
    defect({ case: "output_create_failed", error: r.json });
    throw new Error("output create failed");
  }

  polled = { status: ex?.status, ex };
  if (ex?.status !== "succeeded" && ex?.status !== "failed") {
    polled = await pollExecution(token, eid, 150);
  }
  const meta = polled.ex?.metadata || {};
  step("output_result", {
    status: polled.status,
    err: polled.ex?.errorMessage,
    artifactIds: polled.ex?.artifactIds,
    resultKind: polled.ex?.result?.kind,
    metaSnippet: {
      cdfArtifactId: meta.cdfArtifactId,
      cdfArtifactVersion: meta.cdfArtifactVersion,
      cdfArtifactKey: meta.cdfArtifactKey,
      cdfExecutionStrategy: meta.cdfExecutionStrategy,
      cdfRuntimePath: meta.cdfRuntimePath,
      cdfCanonicalRejected: meta.cdfCanonicalRejected,
      cdfFallbackReason: meta.cdfFallbackReason,
      message: meta.message,
    },
  });

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session ?? session;
  const outputGen = pin(
    (session.generatedArtifacts || []).find((x) => x.artifactKey === "social-media.output"),
  );
  step("output_generatedArtifacts", { outputGen, allGenerated: session.generatedArtifacts });

  const mongo = await mongoOutput(sid);
  step("mongo_output", mongo);

  // Log evidence from backend
  const logTail = fs.existsSync("/tmp/unagency-backend-out-ingest-e2e.log")
    ? fs
        .readFileSync("/tmp/unagency-backend-out-ingest-e2e.log", "utf8")
        .split("\n")
        .filter((l) =>
          /canonical_image_bridge|ingest_accepted|m9c_generated|social_media_ingest|cdfArtifactId/.test(
            l,
          ),
        )
        .slice(-30)
    : [];
  step("log_evidence", { lines: logTail });

  const pass =
    !!outputGen &&
    outputGen.artifactKey === "social-media.output" &&
    Number(outputGen.version) >= 1 &&
    mongo.outputVersions.some(
      (v) => v.id === outputGen.artifactId && v.version === outputGen.version,
    );

  report.summary = {
    passOutputArtifactGate: pass,
    sessionId: sid,
    routesX_V: routesGen ? `${routesGen.artifactId}@${routesGen.version}` : null,
    outputExecutionId: eid,
    outputStatus: polled.status,
    outputExecutionStrategy: "canonical",
    outputArtifactKey: "social-media.output",
    outputX_V: outputGen ? `${outputGen.artifactId}@${outputGen.version}` : null,
    previewAssetRef: mongo.outputVersions[0]?.previewVault || null,
    firstRemainingDefect: pass
      ? null
      : {
          case: "output_artifact_or_bind_missing",
          outputGen,
          mongo,
          meta: polled.ex?.metadata,
        },
  };
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(report.summary, null, 2));
  fs.writeFileSync("/tmp/cdf-out-ingest-e2e.json", JSON.stringify(report, null, 2));
  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    "/tmp/cdf-out-ingest-e2e.json",
    JSON.stringify({ ...report, fatal: String(e) }, null, 2),
  );
  process.exit(1);
});
