/**
 * REAL HTTP: ArtifactVersion rehydration after restart → output dependency resolve.
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
  const log = fs.openSync("/tmp/unagency-backend-art-e2e.log", "a");
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
async function mongoArtifact(aid) {
  const client = new MongoClient(process.env.DB_URI);
  await client.connect();
  try {
    const bag = await client
      .db()
      .collection("cdf_canonical_artifact_bags")
      .findOne({ bagKey: "global" });
    const arts = bag?.snapshot?.artifacts || [];
    const vers = bag?.snapshot?.versions || [];
    const art = arts.find((a) => a.artifactId === aid);
    const ver = vers.find((v) => v.artifactId === aid && Number(v.version) === 1);
    return {
      inBag: !!bag,
      hasArtifact: !!art,
      hasVersion1: !!ver,
      artifactKey: art?.artifactKey,
      status: ver?.status,
      hasData: !!(ver?.data),
    };
  } finally {
    await client.close();
  }
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
async function pollExecution(token, eid, maxPolls = 120) {
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

async function main() {
  console.log("Restarting backend with ArtifactVersion rehydration fix…");
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
  if (polled.status !== "succeeded") {
    defect({ case: "routes_gen", status: polled.status, err: polled.ex?.errorMessage });
    throw new Error("routes gen failed");
  }

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session ?? session;
  const routesGen = pin(
    (session.generatedArtifacts || []).find((x) => x.artifactKey === "social-media.routes"),
  );
  step("routes_pin", { routesGen });

  // Before restart: prove durable artifact + in-process resolve would work
  const mongoBefore = await mongoArtifact(routesGen.artifactId);
  step("mongo_artifact_before_restart", mongoBefore);
  if (!mongoBefore.hasArtifact || !mongoBefore.hasVersion1) {
    defect({ case: "artifact_not_durable", mongoBefore });
    throw new Error("ArtifactVersion missing from Mongo before restart");
  }

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
  const routesSelected = pin(
    (session.selectedArtifacts || []).find((x) => x.artifactKey === "social-media.routes"),
  );
  step("select_route", {
    phaseId: session.phaseId,
    selected: routesSelected,
    abr: `${session.activeBriefId}@v${session.activeBriefVersion}`,
  });

  // RESTART
  await killBackend();
  startBackend();
  if (!(await waitReady())) throw new Error("backend not ready after restart");
  token = await firebaseToken();

  const mongoAfter = await mongoArtifact(routesGen.artifactId);
  step("mongo_artifact_after_restart", mongoAfter);

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session;
  const afterSelected = pin(
    (session?.selectedArtifacts || []).find((x) => x.artifactKey === "social-media.routes"),
  );
  step("after_restart_session", {
    phaseId: session?.phaseId,
    selected: afterSelected,
    selectedOk:
      afterSelected?.artifactId === routesGen.artifactId &&
      afterSelected?.version === routesGen.version,
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
  const createErr = r.status >= 400 ? r.json : null;
  const errText = JSON.stringify(createErr || ex || {});
  const artMissing = /ARTIFACT_NOT_FOUND/.test(errText);
  step("output_create", {
    httpStatus: r.status,
    eid,
    status: ex?.status,
    error: createErr,
    artMissing,
  });

  if (artMissing) {
    defect({ case: "artifact_still_missing_after_restart", error: createErr });
    report.summary = {
      passArtifactGate: false,
      sessionId: sid,
      routesX_V: `${routesGen.artifactId}@${routesGen.version}`,
    };
    fs.writeFileSync("/tmp/cdf-art-rehydrate-e2e.json", JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (r.status >= 400) {
    // Artifact resolved; stop at next independent defect
    report.summary = {
      passArtifactGate: true,
      sessionId: sid,
      routesX_V: `${routesGen.artifactId}@${routesGen.version}`,
      activeBrief: `${session.activeBriefId}@v${session.activeBriefVersion}`,
      outputExecutionId: eid,
      firstRemainingDefect: createErr,
    };
    fs.writeFileSync("/tmp/cdf-art-rehydrate-e2e.json", JSON.stringify(report, null, 2));
    console.log("\n=== SUMMARY ===", JSON.stringify(report.summary, null, 2));
    process.exitCode = 0;
    return;
  }

  polled = { status: ex?.status, ex };
  if (ex?.status !== "succeeded" && ex?.status !== "failed") {
    polled = await pollExecution(token, eid, 150);
  }
  const meta = polled.ex?.metadata || {};
  step("output_result", {
    status: polled.status,
    err: polled.ex?.errorMessage,
    cdfPhaseId: meta.cdfPhaseId,
    cdfArtifactKey: meta.cdfArtifactKey,
    cdfExecutionStrategy: meta.cdfExecutionStrategy,
    cdfArtifactId: meta.cdfArtifactId,
    cdfArtifactVersion: meta.cdfArtifactVersion,
  });

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session ?? session;
  const outputGen = pin(
    (session.generatedArtifacts || []).find((x) => x.artifactKey === "social-media.output"),
  );
  step("output_pin", { outputGen });

  report.summary = {
    passArtifactGate: !/ARTIFACT_NOT_FOUND/.test(String(polled.ex?.errorMessage || "")),
    sessionId: sid,
    routesX_V: `${routesGen.artifactId}@${routesGen.version}`,
    activeBrief: `${session.activeBriefId}@v${session.activeBriefVersion}`,
    outputExecutionId: eid,
    outputStatus: polled.status,
    outputX_V: outputGen ? `${outputGen.artifactId}@${outputGen.version}` : null,
    executionStrategy: meta.cdfExecutionStrategy,
    resolvedUpstreamHint: meta.cdfUpstreamArtifactId
      ? `${meta.cdfUpstreamArtifactId}@${meta.cdfUpstreamArtifactVersion}`
      : routesGen
        ? `${routesGen.artifactId}@${routesGen.version}`
        : null,
    firstRemainingDefect:
      polled.status === "succeeded" && outputGen
        ? null
        : {
            case: "output_after_artifact_ok",
            status: polled.status,
            err: polled.ex?.errorMessage,
            outputGen,
          },
  };
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(report.summary, null, 2));
  fs.writeFileSync("/tmp/cdf-art-rehydrate-e2e.json", JSON.stringify(report, null, 2));
  if (!report.summary.passArtifactGate) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    "/tmp/cdf-art-rehydrate-e2e.json",
    JSON.stringify({ ...report, fatal: String(e) }, null, 2),
  );
  process.exit(1);
});
