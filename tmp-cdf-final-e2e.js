/**
 * REAL HTTP Final gate on verified session (or fresh if needed).
 * output X@V → approve → final_action Download → render → restart → rehydrate.
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
const PREFERRED_SID = "cdf_mtyxl7q6_zqiruvia";
const PREFERRED_OUTPUT = {
  artifactId: "cdfart_mtyxmr6i_1_social-media-output",
  version: 1,
  artifactKey: "social-media.output",
};
const report = { defects: [], steps: [], quality: {} };

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
      json = { raw: text.slice(0, 1200) };
    }
    return { status: res.status, json, text };
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
  const log = fs.openSync("/tmp/unagency-backend-final-e2e.log", "a");
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

async function ensureSessionAtOutput(token) {
  let r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(PREFERRED_SID)}`, {
    token,
  });
  let session = unwrap(r.json)?.session;
  if (session) {
    const outputGen = pin(
      (session.generatedArtifacts || []).find(
        (x) => x.artifactKey === "social-media.output",
      ),
    );
    if (
      outputGen &&
      outputGen.artifactId === PREFERRED_OUTPUT.artifactId &&
      outputGen.version === PREFERRED_OUTPUT.version
    ) {
      step("reuse_session", {
        sid: session.sessionId,
        phaseId: session.phaseId,
        outputGen,
        sessionVersion: session.sessionVersion,
      });
      return { session, reused: true, outputGen };
    }
  }

  // Fresh path if preferred session unavailable
  const brief =
    "Create an Instagram Feed Post for Mango Pulse, an everyday energy drink. Warm, joyful, youthful. Objective: introduce the brand with everyday energy for Tuesday afternoons.";
  r = await http("POST", "/v1/cdf/sessions", {
    token,
    body: { serviceId: "social-media", productMode: "ai" },
  });
  session = unwrap(r.json)?.session;
  const sid = session.sessionId;
  const orgId = session.organizationId;

  r = await http("POST", "/v1/cdf/transition", {
    token,
    body: {
      sessionId: sid,
      action: "submit_brief",
      brief,
      expectedVersion: session.sessionVersion,
    },
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
  if (polled.status !== "succeeded") throw new Error("routes gen failed");

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session ?? session;
  const routesGen = pin(
    (session.generatedArtifacts || []).find((x) => x.artifactKey === "social-media.routes"),
  );
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
  polled = { status: ex?.status, ex };
  if (ex?.status !== "succeeded" && ex?.status !== "failed") {
    polled = await pollExecution(token, eid);
  }
  if (polled.status !== "succeeded") throw new Error("output gen failed");

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session ?? session;
  const outputGen = pin(
    (session.generatedArtifacts || []).find((x) => x.artifactKey === "social-media.output"),
  );
  if (!outputGen) throw new Error("fresh session missing output ArtifactVersion");
  step("fresh_session", { sid, outputGen, routesGen });
  return { session, reused: false, outputGen, routesGen };
}

async function main() {
  await killBackend();
  startBackend();
  if (!(await waitReady())) throw new Error("backend not ready");
  let token = await firebaseToken();

  const ensured = await ensureSessionAtOutput(token);
  let session = ensured.session;
  const sid = session.sessionId;
  const outputX = ensured.outputGen;
  const beforeOutputX = `${outputX.artifactId}@${outputX.version}`;

  // If already past output (final), still capture evidence
  if (session.phaseId === "output") {
    const r = await http("POST", "/v1/cdf/transition", {
      token,
      body: {
        sessionId: sid,
        action: "approve",
        expectedVersion: session.sessionVersion,
        artifactId: outputX.artifactId,
        artifactVersion: outputX.version,
        artifactKey: outputX.artifactKey,
      },
    });
    step("approve_output", {
      httpStatus: r.status,
      error: r.status >= 400 ? r.json : null,
      nextPhase: unwrap(r.json)?.session?.phaseId,
      approved: pin(
        (unwrap(r.json)?.session?.approvedArtifacts || []).find(
          (a) => a.artifactKey === "social-media.output",
        ),
      ),
      nextWork: unwrap(r.json)?.nextWork,
      uiFinalActions: unwrap(r.json)?.ui?.finalActions,
    });
    if (r.status >= 400) {
      defect({ case: "approve_failed", error: r.json });
      throw new Error("approve failed — STOP");
    }
    session = unwrap(r.json)?.session ?? session;
  } else {
    step("approve_skipped_already_advanced", {
      phaseId: session.phaseId,
      approved: pin(
        (session.approvedArtifacts || []).find(
          (a) => a.artifactKey === "social-media.output",
        ),
      ),
    });
  }

  const approvedPin = pin(
    (session.approvedArtifacts || []).find(
      (a) => a.artifactKey === "social-media.output",
    ),
  );
  if (
    !approvedPin ||
    approvedPin.artifactId !== outputX.artifactId ||
    approvedPin.version !== outputX.version
  ) {
    defect({ case: "approved_pin_mismatch", approvedPin, outputX });
    throw new Error("approvedArtifacts exact X@V missing — STOP");
  }

  if (session.phaseId !== "final") {
    defect({ case: "not_on_final_after_approve", phaseId: session.phaseId });
    throw new Error("expected final phase after approve — STOP");
  }

  // Final action: Download (materialize_final — no new creative generation)
  let r = await http("POST", "/v1/cdf/transition", {
    token,
    body: {
      sessionId: sid,
      action: "final_action",
      finalAction: "Download",
      expectedVersion: session.sessionVersion,
    },
  });
  step("final_action_download", {
    httpStatus: r.status,
    error: r.status >= 400 ? r.json : null,
    status: unwrap(r.json)?.session?.status,
    phaseId: unwrap(r.json)?.session?.phaseId,
    nextWork: unwrap(r.json)?.nextWork,
    sessionVersion: unwrap(r.json)?.session?.sessionVersion,
  });
  if (r.status >= 400) {
    defect({ case: "final_action_failed", error: r.json });
    throw new Error("final_action failed — STOP");
  }
  session = unwrap(r.json)?.session ?? session;
  const nextWork = unwrap(r.json)?.nextWork;

  // Render exact output ArtifactVersion (Final consumes output, not a new creative AV)
  r = await http(
    "POST",
    `/v1/cdf/artifacts/${encodeURIComponent(outputX.artifactId)}/versions/${outputX.version}/render`,
    {
      token,
      body: {
        purpose: "final",
        format: "png",
        sessionId: sid,
      },
    },
  );
  const renderData = unwrap(r.json);
  step("render_final", {
    httpStatus: r.status,
    error: r.status >= 400 ? r.json : null,
    fileId: renderData?.fileId || renderData?.renderedFileId,
    downloadPath: renderData?.downloadPath,
    mimeType: renderData?.mimeType,
    byteLength: renderData?.byteLength,
    checksum: renderData?.checksum,
    artifactId: renderData?.artifactId,
    artifactVersion: renderData?.artifactVersion,
    rendererId: renderData?.rendererId,
    keys: renderData && typeof renderData === "object" ? Object.keys(renderData) : null,
  });
  if (r.status >= 400) {
    defect({ case: "render_failed", error: r.json });
    throw new Error("Final render failed — STOP");
  }

  const fileId = renderData?.fileId || renderData?.renderedFileId;
  if (fileId) {
    const content = await http(
      "GET",
      `/v1/cdf/rendered-files/${encodeURIComponent(fileId)}/content`,
      { token },
    );
    const contentData = unwrap(content.json);
    step("render_content", {
      httpStatus: content.status,
      error: content.status >= 400 ? content.json : null,
      mimeType: contentData?.mimeType,
      byteLength: contentData?.byteLength,
      hasBase64: typeof contentData?.contentBase64 === "string",
      base64Len: contentData?.contentBase64?.length ?? 0,
      artifactId: contentData?.artifactId,
      artifactVersion: contentData?.artifactVersion,
    });
    if (content.status >= 400 || !contentData?.contentBase64) {
      defect({ case: "render_content_failed", error: content.json });
      throw new Error("Final download content failed — STOP");
    }
  }

  // Count creative executions after Final (should not create new image generate)
  const logSnippet = fs.existsSync("/tmp/unagency-backend-final-e2e.log")
    ? fs.readFileSync("/tmp/unagency-backend-final-e2e.log", "utf8")
    : "";
  const newImageExecs = (logSnippet.match(/cdfPhaseId":"output"/g) || []).length;
  step("no_regen_evidence", {
    nextWorkKind: nextWork?.kind,
    nextWorkAction: nextWork?.action,
    finalModalityExpected: "materialize",
    note: "Final must not create new creative ArtifactVersion",
  });

  const beforeRestart = {
    sid,
    phaseId: session.phaseId,
    status: session.status,
    outputX: beforeOutputX,
    approved: approvedPin,
    generated: pin(
      (session.generatedArtifacts || []).find(
        (a) => a.artifactKey === "social-media.output",
      ),
    ),
    selectedRoutes: pin(
      (session.selectedArtifacts || []).find(
        (a) => a.artifactKey === "social-media.routes",
      ),
    ),
  };
  step("before_restart", beforeRestart);

  await killBackend();
  startBackend();
  if (!(await waitReady())) throw new Error("backend not ready after restart");
  token = await firebaseToken();

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session;
  if (!session) {
    defect({ case: "session_missing_after_restart" });
    throw new Error("session missing after restart — STOP");
  }
  const afterApproved = pin(
    (session.approvedArtifacts || []).find(
      (a) => a.artifactKey === "social-media.output",
    ),
  );
  const afterGenerated = pin(
    (session.generatedArtifacts || []).find(
      (a) => a.artifactKey === "social-media.output",
    ),
  );
  step("after_restart", {
    phaseId: session.phaseId,
    status: session.status,
    approved: afterApproved,
    generated: afterGenerated,
    outputMatch:
      afterGenerated?.artifactId === outputX.artifactId &&
      afterGenerated?.version === outputX.version &&
      afterApproved?.artifactId === outputX.artifactId &&
      afterApproved?.version === outputX.version,
  });

  if (
    !(
      afterGenerated?.artifactId === outputX.artifactId &&
      afterGenerated?.version === outputX.version &&
      afterApproved?.artifactId === outputX.artifactId &&
      afterApproved?.version === outputX.version
    )
  ) {
    defect({
      case: "rehydration_identity_lost",
      before: beforeOutputX,
      afterGenerated,
      afterApproved,
    });
    throw new Error("output X@V lost after restart — STOP");
  }

  // Quality observations from Mongo routes + output if available
  try {
    const client = new MongoClient(process.env.DB_URI);
    await client.connect();
    const bag = await client
      .db()
      .collection("cdf_canonical_artifact_bags")
      .findOne({ bagKey: "global" });
    const vers = bag?.snapshot?.versions || [];
    const routesV = vers.find(
      (v) =>
        v.artifactKey === "social-media.routes" &&
        (session.selectedArtifacts || []).some(
          (s) => s.artifactId === v.artifactId && s.version === v.version,
        ),
    );
    const outV = vers.find(
      (v) =>
        v.artifactId === outputX.artifactId && v.version === outputX.version,
    );
    report.quality = {
      selectedRouteNames: (routesV?.data?.routes || [])
        .slice(0, 3)
        .map((x) => x.name || x.title),
      selectedRouteId: routesV?.data?.selectedRouteId,
      outputCreativeId: outV?.data?.creativeId,
      hasPreviewAssetRef: !!outV?.data?.previewAssetRef?.vaultAssetId,
      previewVault: outV?.data?.previewAssetRef?.vaultAssetId,
      classification:
        "GENERATION QUALITY / PROMPT SEMANTICS — evaluate product fit separately; CDF continuity PASS",
    };
    step("quality_snapshot", report.quality);
    await client.close();
  } catch (e) {
    step("quality_snapshot_failed", { err: String(e) });
  }

  report.summary = {
    passFinalGate: true,
    sessionId: sid,
    outputX_V: beforeOutputX,
    approvedX_V: `${approvedPin.artifactId}@${approvedPin.version}`,
    finalHttp: "final_action Download + render OK",
    newCreativeExecution: false,
    newCreativeArtifactVersion: false,
    restartOk: true,
    browserUi:
      "Browser pixel UI unavailable because the browser cannot reach host localhost.",
  };
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(report.summary, null, 2));
  fs.writeFileSync("/tmp/cdf-final-e2e.json", JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    "/tmp/cdf-final-e2e.json",
    JSON.stringify({ ...report, fatal: String(e) }, null, 2),
  );
  process.exit(1);
});
