/**
 * Fresh Firebase E2E — instruction authority + brand context + CDF continuity.
 * Mode → Brand → Service → Subtype → Platform/Format → Brief → Routes → Select → Output.
 * Evidence-only; does not patch product code.
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
const LOG = "/tmp/unagency-authority-e2e-backend.log";
const OUT = "/tmp/unagency-authority-e2e-report.json";

const BRAND_ID = "6aa6e05525cbda7ee6aed864"; // BloomSip under demo org (rich profile)
const BRAND_NAME = "BloomSip";
const RAW_INSTRUCTION =
  "Make the campaign playful and energetic while keeping our core BloomSip colors. Create a BloomSip Instagram feed post comparing our mango botanical drink against Pepsi.";
const CTI_EFFECTIVE =
  "Create a professional restrained premium campaign for Pepsi competitive benchmarking.";
const BRIEF = RAW_INSTRUCTION;

const report = {
  startedAt: new Date().toISOString(),
  boundaries: {},
  steps: [],
  defects: [],
  artifactChain: {},
  firstLossPoint: null,
};

function step(name, data) {
  report.steps.push({ name, at: new Date().toISOString(), ...data });
  console.log("\n===", name, "===");
  console.log(JSON.stringify(data, null, 2));
}
function boundary(name, pass, evidence) {
  report.boundaries[name] = { pass: !!pass, evidence };
  console.log(`\n### BOUNDARY ${name}: ${pass ? "PASS" : "FAIL"}`);
  console.log(JSON.stringify(evidence, null, 2));
  if (!pass && !report.firstLossPoint) {
    report.firstLossPoint = { boundary: name, evidence };
  }
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
async function http(method, p, { token, body, timeoutMs = 180000 } = {}) {
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
      json = { raw: text.slice(0, 1500) };
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}
async function waitReady(maxMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${API}/v1/ready`, {
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) return true;
    } catch {}
    await sleep(1500);
  }
  return false;
}
async function killBackend() {
  const { execSync } = require("child_process");
  try {
    execSync("lsof -tiTCP:4000 -sTCP:LISTEN | xargs kill -9", {
      stdio: "ignore",
    });
  } catch {}
  await sleep(2500);
}
function startBackend() {
  if (fs.existsSync(LOG)) fs.unlinkSync(LOG);
  const fd = fs.openSync(LOG, "a");
  fs.writeSync(fd, `\n--- spawn ${new Date().toISOString()}\n`);
  const child = spawn("npm", ["start"], {
    cwd: ROOT,
    env: {
      ...process.env,
      ENTERPRISE_API_START_LEGACY_WORKERS: "false",
      CDF_CANONICAL_GENERATION_CONTEXT: "1",
      CONTINUITY_CONTEXT_BIND: "on",
    },
    detached: true,
    stdio: ["ignore", fd, fd],
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
function diagFromMeta(meta = {}) {
  return {
    cdfCanonicalContextApplied: meta.cdfCanonicalContextApplied === true,
    currentUserInstructionSource: meta.cdfCurrentUserInstructionSource,
    currentUserInstructionFingerprint: meta.cdfCurrentUserInstructionFingerprint,
    ctiEffectiveInstructionPresent: meta.cdfCtiEffectiveInstructionPresent,
    userInstructionPresent: meta.cdfUserInstructionPresent,
    selectedBrandId: meta.cdfSelectedBrandId ?? meta.brandId,
    selectedCanonicalBrandName:
      meta.cdfSelectedCanonicalBrandName ??
      meta.canonicalBrandName ??
      meta.brandName,
    brandFactKeys: meta.cdfBrandFactKeys,
    brandFactProvenance: meta.cdfBrandFactProvenance,
    extractedBrandEntities: meta.cdfExtractedBrandEntities,
    extractionAttemptedIdentityMutation:
      meta.cdfExtractionAttemptedIdentityMutation,
    productGroundingPresent: meta.cdfProductGroundingPresent,
    selectedDirectionPresent: meta.cdfSelectedDirectionPresent,
    selectedDirectionIdentity: meta.cdfSelectedDirectionIdentity,
    selectedDirectionSemanticFields: meta.cdfSelectedDirectionSemanticFields,
    unresolvedReferenceCount: meta.cdfUnresolvedReferenceCount,
    resolvedReferenceCount: meta.cdfResolvedReferenceCount,
    sectionsPresent: meta.cdfCanonicalSectionsPresent,
    generationModality: meta.cdfAuthorityGenerationModality ?? meta.cdfGenerationModality,
    executionStrategy: meta.cdfExecutionStrategy,
    artifactKey: meta.cdfArtifactKey,
    phaseId: meta.cdfPhaseId,
    brandNameMeta: meta.brandName,
    canonicalBrandNameMeta: meta.canonicalBrandName,
    extractedBrandName: meta.extractedBrandName,
    brandExtractAttemptedIdentityMutation:
      meta.brandExtractAttemptedIdentityMutation,
  };
}
function scanLogs(patterns, limit = 40) {
  if (!fs.existsSync(LOG)) return [];
  const lines = fs.readFileSync(LOG, "utf8").split("\n");
  const out = [];
  for (const line of lines) {
    if (patterns.some((p) => p.test(line))) out.push(line.slice(0, 2000));
  }
  return out.slice(-limit);
}
async function pollExecution(token, eid, maxPolls = 120) {
  for (let i = 0; i < maxPolls; i++) {
    await sleep(3000);
    const r = await http("GET", `/v1/executions/${eid}`, {
      token,
      timeoutMs: 30000,
    });
    const ex = unwrap(r.json);
    const status = ex?.status || ex?.state;
    if (
      ["succeeded", "failed", "completed", "error", "cancelled"].includes(
        status,
      )
    ) {
      return { status, ex };
    }
  }
  return { status: "timeout", ex: null };
}
async function mongoArtifactEvidence(sessionId) {
  const client = new MongoClient(process.env.DB_URI);
  await client.connect();
  try {
    const bag = await client
      .db()
      .collection("cdf_canonical_artifact_bags")
      .findOne({ bagKey: "global" });
    const arts = (bag?.snapshot?.artifacts || []).filter(
      (a) => a.sessionId === sessionId,
    );
    const vers = (bag?.snapshot?.versions || []).filter((v) =>
      arts.some((a) => a.artifactId === v.artifactId),
    );
    const sess = await client
      .db()
      .collection("cdf_sessions")
      .findOne({ sessionId });
    return {
      artifacts: arts.map((a) => ({
        artifactId: a.artifactId,
        artifactKey: a.artifactKey,
        latestVersion: a.latestVersion,
        phaseId: a.phaseId,
      })),
      versions: vers.map((v) => ({
        artifactId: v.artifactId,
        version: v.version,
        status: v.status,
        keys: v.data && typeof v.data === "object" ? Object.keys(v.data).slice(0, 12) : [],
      })),
      durableSession: sess
        ? {
            sessionId: sess.sessionId,
            phaseId: sess.phaseId,
            sessionVersion: sess.sessionVersion,
            generatedArtifacts: (sess.generatedArtifacts || []).map(pin),
            selectedArtifacts: (sess.selectedArtifacts || []).map(pin),
          }
        : null,
    };
  } finally {
    await client.close();
  }
}

function baseCdfMeta(extra = {}) {
  return {
    service: "social",
    subtype: "content-design",
    platform: "Instagram",
    format: "Feed Post",
    productAction: "generate",
    brandId: BRAND_ID,
    brandName: BRAND_NAME,
    canonicalBrandName: BRAND_NAME,
    brandConfirmed: true,
    conversationalCurrentUserInstruction: RAW_INSTRUCTION,
    conversationalEffectiveInstruction: CTI_EFFECTIVE,
    forceWriteCopy: true,
    preferredProviderId: "provider.openai",
    preferredModelId: "gpt-4o",
    ...extra,
  };
}

async function main() {
  step("restart_backend", { reason: "load latest authority fixes" });
  await killBackend();
  const pid = startBackend();
  step("backend_spawned", { pid });
  if (!(await waitReady())) throw new Error("backend not ready");

  let token = await firebaseToken();
  const me = unwrap(
    (await http("GET", "/v1/me", { token })).json,
  );
  const orgId = me?.currentOrganizationId;
  step("auth", {
    email: me?.user?.email,
    orgId,
    brandId: BRAND_ID,
    brandName: BRAND_NAME,
  });

  // Mode → Brand → Service session
  let r = await http("POST", "/v1/cdf/sessions", {
    token,
    body: {
      serviceId: "social-media",
      productMode: "ai",
      brandId: BRAND_ID,
    },
  });
  let session = unwrap(r.json)?.session;
  if (!session?.sessionId) {
    defect({ case: "session_create_failed", status: r.status, body: r.json });
    throw new Error("session create failed");
  }
  const sid = session.sessionId;
  report.artifactChain.sessionId = sid;
  step("session_start", {
    sid,
    phaseId: session.phaseId,
    serviceId: session.serviceId,
  });

  r = await http("POST", "/v1/cdf/transition", {
    token,
    body: {
      sessionId: sid,
      action: "submit_brief",
      brief: BRIEF,
      expectedVersion: session.sessionVersion,
    },
  });
  session = unwrap(r.json)?.session ?? session;
  step("submit_brief", {
    phaseId: session.phaseId,
    sessionVersion: session.sessionVersion,
    mastersBrandName: session.masters?.brandName,
  });

  // Platform / Format selection
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
  step("platform_format", {
    phaseId: session.phaseId,
    masters: {
      platform: session.masters?.platform,
      format: session.masters?.format,
    },
  });

  // ROUTES generation
  r = await http("POST", "/v1/executions", {
    token,
    timeoutMs: 90000,
    body: {
      prompt: `${RAW_INSTRUCTION}\n\nGenerate exactly 3 creative directions.`,
      capabilityId: "text.generate",
      organizationId: orgId,
      providerId: "provider.openai",
      modelId: "gpt-4o",
      metadata: baseCdfMeta({
        cdfSessionId: sid,
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
        cdfArtifactKey: "social-media.routes",
        cdfExecutionStrategy: "canonical",
        cdfGenerator: "text",
        cdfSemanticRole: "text_choice",
        cdfOmitStructuredOutput: true,
      }),
    },
  });
  let ex = unwrap(r.json);
  let eid = ex?.executionId || ex?.id;
  step("routes_create", {
    httpStatus: r.status,
    eid,
    status: ex?.status,
    error: r.status >= 400 ? r.json : undefined,
  });
  if (r.status >= 400 || !eid) {
    defect({ case: "routes_create_failed", body: r.json });
    throw new Error("routes create failed");
  }

  let polled = { status: ex?.status, ex };
  if (!["succeeded", "failed", "completed", "error"].includes(polled.status)) {
    polled = await pollExecution(token, eid);
  }
  const routesMeta = polled.ex?.metadata || {};
  const routesDiag = diagFromMeta(routesMeta);
  const routesLog = scanLogs([
    /cdf\.generation_context\.(compiled|provider_boundary)/,
    /canonicalModelRequest/,
    /brand_context|current_user_instruction|conversational_interpretation/,
    new RegExp(eid),
  ]);

  step("routes_result", {
    status: polled.status,
    err: polled.ex?.errorMessage,
    diag: routesDiag,
    structuredKeys:
      polled.ex?.result?.data && typeof polled.ex.result.data === "object"
        ? Object.keys(polled.ex.result.data)
        : polled.ex?.result?.kind,
  });

  // 1. PROVIDER INPUT
  const sections = routesDiag.sectionsPresent || {};
  const providerInputPass =
    polled.status === "succeeded" &&
    routesDiag.cdfCanonicalContextApplied === true &&
    routesDiag.userInstructionPresent === true &&
    (routesDiag.currentUserInstructionSource ===
      "conversationalCurrentUserInstruction" ||
      routesDiag.currentUserInstructionSource === "explicit_input" ||
      routesDiag.currentUserInstructionSource === "refinePrompt") &&
    routesDiag.ctiEffectiveInstructionPresent === true &&
    routesDiag.selectedBrandId === BRAND_ID &&
    (routesDiag.selectedCanonicalBrandName === BRAND_NAME ||
      routesDiag.brandNameMeta === BRAND_NAME) &&
    Array.isArray(routesDiag.brandFactKeys) &&
    routesDiag.brandFactKeys.length > 0 &&
    routesDiag.productGroundingPresent === true &&
    sections.currentUserInstruction === true &&
    sections.brandContext === true &&
    sections.productGrounding === true &&
    sections.currentTask === true &&
    sections.outputContract === true &&
    // CTI must not silently become the authoritative instruction fingerprint alone —
    // source must not be phase-only when we stamped current instruction.
    routesDiag.currentUserInstructionSource !== "phase_prompt";

  boundary("1_PROVIDER_INPUT", providerInputPass, {
    executionId: eid,
    diag: routesDiag,
    note:
      "CTI effective present as advisory flag; source is explicit current instruction, not CTI promotion",
    logHits: routesLog.slice(-8),
  });

  // 2. BRAND AUTHORITY
  const brandAuthorityPass =
    routesDiag.selectedBrandId === BRAND_ID &&
    (routesDiag.selectedCanonicalBrandName === BRAND_NAME ||
      routesDiag.canonicalBrandNameMeta === BRAND_NAME ||
      routesDiag.brandNameMeta === BRAND_NAME) &&
    routesDiag.brandNameMeta !== "Pepsi" &&
    routesDiag.canonicalBrandNameMeta !== "Pepsi" &&
    Array.isArray(routesDiag.brandFactKeys) &&
    routesDiag.brandFactKeys.some((k) =>
      ["positioning", "voice", "colors", "brandColors", "photographyStyle", "voiceGuidelines", "brandName"].includes(
        k,
      ),
    );

  boundary("2_BRAND_AUTHORITY", brandAuthorityPass, {
    selectedBrandId: routesDiag.selectedBrandId,
    selectedCanonicalBrandName: routesDiag.selectedCanonicalBrandName,
    brandNameMeta: routesDiag.brandNameMeta,
    extractedBrandEntities: routesDiag.extractedBrandEntities,
    extractionAttemptedIdentityMutation:
      routesDiag.extractionAttemptedIdentityMutation,
    brandFactKeys: routesDiag.brandFactKeys,
    brandFactProvenance: routesDiag.brandFactProvenance,
  });

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, {
    token,
  });
  session = unwrap(r.json)?.session ?? session;
  const routesGen = pin(
    (session.generatedArtifacts || []).find(
      (x) => x.artifactKey === "social-media.routes",
    ),
  );
  report.artifactChain.routes = routesGen;

  // 3. CDF ROUTES chain
  const mongo1 = await mongoArtifactEvidence(sid);
  const routesChainPass =
    !!routesGen &&
    routesGen.artifactKey === "social-media.routes" &&
    Number(routesGen.version) >= 1 &&
    String(routesGen.artifactId || "").startsWith("cdfart_") &&
    mongo1.artifacts.some(
      (v) =>
        v.artifactId === routesGen.artifactId &&
        v.version === routesGen.version,
    ) &&
    !!mongo1.durableSession;

  boundary("3_CDF_ROUTES_CHAIN", routesChainPass, {
    routesGen,
    mongoArtifacts: mongo1.artifacts,
    durableGenerated: mongo1.durableSession?.generatedArtifacts,
  });

  if (!routesGen) throw new Error("routes artifact missing — cannot select");

  // 4. SELECT_ROUTE
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
  const selected = pin(
    (session.selectedArtifacts || []).find(
      (x) => x.artifactKey === "social-media.routes",
    ),
  );
  report.artifactChain.selectedRoutes = selected;
  step("select_route_transition", {
    httpStatus: r.status,
    phaseId: session.phaseId,
    selected,
    error: r.status >= 400 ? r.json : undefined,
  });

  // Output create to observe selection diagnostics on provider intent
  r = await http("POST", "/v1/executions", {
    token,
    timeoutMs: 90000,
    body: {
      prompt: `${RAW_INSTRUCTION}\n\nGenerate the final social creative for the selected direction.`,
      capabilityId: "image.generate",
      organizationId: orgId,
      metadata: baseCdfMeta({
        cdfSessionId: sid,
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfArtifactKey: "social-media.output",
        cdfExecutionStrategy: "canonical",
        cdfGenerator: "image",
        cdfSemanticRole: "final_visual",
      }),
    },
  });
  ex = unwrap(r.json);
  const outEid = ex?.executionId || ex?.id;
  step("output_create", {
    httpStatus: r.status,
    eid: outEid,
    status: ex?.status,
    error: r.status >= 400 ? r.json : undefined,
  });

  // Even if image fails later, capture prepass diagnostics if create returned metadata
  let outPolled = { status: ex?.status, ex };
  if (outEid && !["succeeded", "failed", "completed", "error"].includes(outPolled.status)) {
    outPolled = await pollExecution(token, outEid, 100);
  }
  const outMeta = outPolled.ex?.metadata || ex?.metadata || {};
  const outDiag = diagFromMeta(outMeta);

  const selectPass =
    !!selected &&
    selected.artifactId === routesGen.artifactId &&
    selected.version === routesGen.version &&
    outDiag.selectedDirectionPresent === true &&
    typeof outDiag.selectedDirectionIdentity === "string" &&
    outDiag.selectedDirectionIdentity.includes(routesGen.artifactId) &&
    Number(outDiag.unresolvedReferenceCount || 0) === 0 &&
    !/Route\s*[123]\b/i.test(String(outDiag.selectedDirectionIdentity || ""));

  // selectedReferenceCount — derive from sections / resolved refs if present
  const selectedReferenceCount =
    Number(outMeta.cdfResolvedReferenceCount || 0) > 0
      ? Number(outMeta.cdfResolvedReferenceCount)
      : selected
        ? 1
        : 0;

  boundary("4_SELECT_ROUTE", selectPass, {
    sourceRoutes: routesGen,
    selectedArtifacts: selected,
    selectedReferenceCount,
    unresolvedReferenceCount: outDiag.unresolvedReferenceCount,
    selectedDirectionPresent: outDiag.selectedDirectionPresent,
    selectedDirectionIdentity: outDiag.selectedDirectionIdentity,
    selectedDirectionSemanticFields: outDiag.selectedDirectionSemanticFields,
  });

  // 5. OUTPUT — selected route as semantic context
  const sectionsOut = outDiag.sectionsPresent || {};
  const outputContextPass =
    outDiag.cdfCanonicalContextApplied === true &&
    sectionsOut.selectedSemanticDirections === true &&
    sectionsOut.brandContext === true &&
    sectionsOut.currentUserInstruction === true &&
    outDiag.selectedDirectionPresent === true;

  boundary("5_OUTPUT_SEMANTIC_CONTEXT", outputContextPass, {
    executionId: outEid,
    status: outPolled.status,
    sectionsPresent: sectionsOut,
    selectedDirectionIdentity: outDiag.selectedDirectionIdentity,
    brandFactKeys: outDiag.brandFactKeys,
    currentUserInstructionSource: outDiag.currentUserInstructionSource,
    err: outPolled.ex?.errorMessage,
  });

  // 6. IMAGE EXECUTION (only after above — still run; classify if fail)
  const imageSucceeded =
    outPolled.status === "succeeded" || outPolled.status === "completed";
  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, {
    token,
  });
  session = unwrap(r.json)?.session ?? session;
  const outputGen = pin(
    (session.generatedArtifacts || []).find(
      (x) => x.artifactKey === "social-media.output",
    ),
  );
  report.artifactChain.output = outputGen;
  const mongo2 = await mongoArtifactEvidence(sid);
  const imageLogs = scanLogs([
    /canonical_image|image\.generate|cdfCanonicalRejected|provider_boundary|Integrity|governance|PROMPT|projection/i,
    outEid ? new RegExp(outEid) : /$a/,
  ]);

  let imageFailureClass = null;
  if (!imageSucceeded) {
    const err = String(outPolled.ex?.errorMessage || outMeta.message || "");
    const metaStr = JSON.stringify(outMeta);
    if (/prompt|projection|import|Cannot find module|runtime/i.test(err + metaStr)) {
      imageFailureClass = "prompt_projection_import_runtime";
    } else if (/rout(e|ing)|model|provider|capability/i.test(err + metaStr)) {
      imageFailureClass = "provider_model_routing";
    } else if (/canonical|ingest|reject/i.test(err + metaStr)) {
      imageFailureClass = "canonicalization_ingest";
    } else if (/artifact|continuity|dependency|unresolved/i.test(err + metaStr)) {
      imageFailureClass = "artifact_continuity";
    } else if (/govern|integrity|observ/i.test(err + metaStr)) {
      imageFailureClass = "governance_integrity_observation";
    } else if (imageSucceeded === false && outPolled.status === "succeeded") {
      imageFailureClass = "generation_quality";
    } else {
      imageFailureClass = "unclassified_execution_failure";
    }
  }

  const imagePass =
    imageSucceeded &&
    !!outputGen &&
    outputGen.artifactKey === "social-media.output" &&
    String(outputGen.artifactId || "").startsWith("cdfart_");

  boundary("6_IMAGE_EXECUTION", imagePass, {
    status: outPolled.status,
    errorMessage: outPolled.ex?.errorMessage,
    failureClass: imageFailureClass,
    outputGen,
    mongoOutputVersions: mongo2.versions.filter((v) =>
      mongo2.artifacts.some(
        (a) =>
          a.artifactId === v.artifactId &&
          a.artifactKey === "social-media.output",
      ),
    ),
    logHits: imageLogs.slice(-12),
    metaSnippet: {
      cdfArtifactId: outMeta.cdfArtifactId,
      cdfArtifactVersion: outMeta.cdfArtifactVersion,
      cdfCanonicalRejected: outMeta.cdfCanonicalRejected,
      cdfFallbackReason: outMeta.cdfFallbackReason,
      cdfRuntimePath: outMeta.cdfRuntimePath,
    },
  });

  report.finishedAt = new Date().toISOString();
  report.summary = {
    sessionId: sid,
    brandId: BRAND_ID,
    brandName: BRAND_NAME,
    routesExecutionId: eid,
    outputExecutionId: outEid,
    boundaries: Object.fromEntries(
      Object.entries(report.boundaries).map(([k, v]) => [k, v.pass ? "PASS" : "FAIL"]),
    ),
    artifactChain: report.artifactChain,
    firstLossPoint: report.firstLossPoint,
    imageFailureClass,
    genericVsServiceSpecific: report.firstLossPoint
      ? "Pending classification from first loss point evidence"
      : "All exercised boundaries passed (framework path)",
  };

  console.log("\n========== FINAL REPORT ==========");
  console.log(JSON.stringify(report.summary, null, 2));
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("Wrote", OUT);

  const critical = ["1_PROVIDER_INPUT", "2_BRAND_AUTHORITY", "3_CDF_ROUTES_CHAIN", "4_SELECT_ROUTE", "5_OUTPUT_SEMANTIC_CONTEXT"];
  if (critical.some((k) => !report.boundaries[k]?.pass)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  report.fatal = String(e && e.stack ? e.stack : e);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.exit(1);
});
