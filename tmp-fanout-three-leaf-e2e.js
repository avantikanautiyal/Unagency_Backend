/**
 * Controlled production E2E — intentional three-model generation fanout.
 * ONE selected creative direction → THREE independent leaf executions.
 * Fanout ≠ failover. No product-code changes.
 *
 * Starts the backend in-process (phase8 pattern) so the server survives
 * for the full multi-provider image run.
 */
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const { MongoClient } = require("mongodb");
const crypto = require("crypto");

const ROOT = "/Users/avantikanautiyal/Desktop/Unagency_fullstack/unagency-backend";
process.chdir(ROOT);
require("dotenv").config({ path: path.join(ROOT, ".env") });

const API = "http://127.0.0.1:4000";
const WEB_ENV =
  "/Users/avantikanautiyal/Desktop/Unagency_fullstack/Unagency-frontend/apps/web/.env.local";
const OUT = "/tmp/fanout-three-leaf-report.json";
const EV = "/tmp/fanout_three_leaf_evidence";
const LOG = "/tmp/fanout-three-leaf-backend.log";

const RAW_INSTRUCTION =
  "I want to create an instagram post about my brand. It is an introductory post hence it should be able to describe the brand properly and should be aesthetically good looking and must follow the colour scheme it has been following until now";

// Original SUNFLOWER fixture (brand + logo asset) no longer exists in this
// DB — replaced with a brand that is currently live under this org.
const SUNFLOWER = {
  brandId: "6aad28a15542d17741da89d3",
  brandName: "Voyla",
  logoAssetId: null,
};

const EMAIL =
  process.env.PHASE8_E2E_EMAIL ||
  process.env.SUNFLOWER_E2E_EMAIL ||
  "avantika.mcs22.du@gmail.com";
const PASSWORD =
  process.env.PHASE8_E2E_PASSWORD || process.env.SUNFLOWER_E2E_PASSWORD;

/**
 * Mirror of buildGenerationFanoutLeafMetadata — avoids loading TS into this
 * process. Client leaves imageFailoverChain empty; the backend prepass
 * (execution-create-prepass.ts) recomputes the real intra-leaf chain
 * server-side via resolveIntraLeafFailoverChain, using
 * generationFanoutSiblingModelKeys to exclude sibling leaves' models — this
 * mirror must stamp that field or the exclusion has nothing to read.
 */
function buildGenerationFanoutLeafMetadata({ plan, target }) {
  const siblingModelKeys = plan.targets
    .filter((t) => t.targetId !== target.targetId)
    .map((t) => `${t.providerId}::${t.modelId}`);
  return {
    generationFanoutGroupId: plan.groupId,
    generationFanoutTargetId: target.targetId,
    generationFanoutTargetIndex: target.index,
    generationFanoutLeaf: true,
    disableCrossProviderFailover: true,
    preferredProviderId: target.providerId,
    preferredModelId: target.modelId,
    imageFailoverChain: [],
    generationFanoutSiblingModelKeys: siblingModelKeys,
    imageProviderLabel: target.label,
  };
}

function planLiveInventoryFromRuntime() {
  const probePath = path.join(ROOT, "tmp-fanout-inventory-probe.js");
  fs.writeFileSync(
    probePath,
    `
const { planImageGenerationFanout } = require('./src/platform/generation/generation-fanout');
const { resolveImageCreativeUseCase } = require('./src/platform/providers/image/routing/image-use-case-routing');
const useCase = resolveImageCreativeUseCase(${JSON.stringify(RAW_INSTRUCTION)}, {
  service: 'social',
  platform: 'instagram',
  subtype: 'content-design',
});
const groupId = 'fanout_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
const plan = planImageGenerationFanout({
  useCase,
  groupId,
  executableProviderIds: new Set(['provider.openai','provider.google','provider.ideogram']),
});
process.stdout.write(JSON.stringify({ useCase, groupId, targets: plan.targets }));
`,
  );
  const out = execSync(
    `npx --yes ts-node --transpile-only ${JSON.stringify(probePath)}`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 5_000_000 },
  );
  try {
    fs.unlinkSync(probePath);
  } catch {}
  const line = out.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  return JSON.parse(line);
}

async function killBackend() {
  try {
    execSync("lsof -tiTCP:4000 -sTCP:LISTEN | xargs kill -9", { stdio: "ignore" });
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

const report = {
  purpose: "fanout_three_leaf_controlled_e2e",
  startedAt: new Date().toISOString(),
  steps: [],
  liveInventory: null,
  selectedRoute: null,
  fanoutGraph: null,
  leaves: {},
  canonicalInputComparison: null,
  evidenceTable: null,
  verdict: null,
};

function ensureDir() {
  fs.mkdirSync(EV, { recursive: true });
}
function write(name, value) {
  ensureDir();
  const p = path.join(EV, name);
  fs.writeFileSync(
    p,
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
  return p;
}
function step(name, data) {
  report.steps.push({ name, at: new Date().toISOString(), ...data });
  console.log("\n===", name, "===");
  console.log(JSON.stringify(data, null, 2));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function unwrap(json) {
  return json?.data != null ? json.data : json;
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
function sha8(s) {
  return crypto.createHash("sha256").update(String(s || "")).digest("hex").slice(0, 8);
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

function firebaseWebApiKey() {
  return fs
    .readFileSync(WEB_ENV, "utf8")
    .split("\n")
    .find((l) => l.startsWith("NEXT_PUBLIC_FIREBASE_API_KEY="))
    .split("=")[1]
    .trim();
}

async function firebaseTokenFromPassword(email, password) {
  const apiKey = firebaseWebApiKey();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const j = await res.json();
  if (!j.idToken) throw new Error(`Firebase login failed: ${JSON.stringify(j)}`);
  return j.idToken;
}

async function firebaseTokenFromAdmin(email) {
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

async function firebaseToken(email, password) {
  if (password) return firebaseTokenFromPassword(email, password);
  return firebaseTokenFromAdmin(email);
}

async function pollExecution(token, eid, maxPolls = 200) {
  for (let i = 0; i < maxPolls; i++) {
    await sleep(3000);
    const r = await http("GET", `/v1/executions/${eid}`, {
      token,
      timeoutMs: 30000,
    });
    const ex = unwrap(r.json);
    const status = ex?.status || ex?.state;
    if (
      ["succeeded", "failed", "completed", "error", "cancelled"].includes(status)
    ) {
      return { status, ex };
    }
    if (i % 10 === 0) {
      console.log(`  poll ${eid} #${i} status=${status}`);
    }
  }
  return { status: "timeout", ex: null };
}

async function withMongo(fn) {
  const client = new MongoClient(process.env.DB_URI, {
    serverSelectionTimeoutMS: 30000,
  });
  await client.connect();
  try {
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

async function mongoRoutes(sessionId) {
  return withMongo(async (db) => {
    const bag = await db
      .collection("cdf_canonical_artifact_bags")
      .findOne({ bagKey: "global" });
    const arts = (bag?.snapshot?.artifacts || []).filter(
      (a) => a.sessionId === sessionId,
    );
    const vers = (bag?.snapshot?.versions || []).filter((v) =>
      arts.some((a) => a.artifactId === v.artifactId),
    );
    return { arts, vers, bag };
  });
}

async function loadJob(executionId) {
  return withMongo(async (db) => {
    const ex = await db
      .collection("enterprise_executions")
      .findOne({ executionId });
    let job = null;
    if (ex?.jobId) {
      job = await db.collection("enterprise_jobs").findOne({ jobId: ex.jobId });
    }
    const ops = await db
      .collection("provider_operations")
      .find({ executionId })
      .sort({ createdAt: 1 })
      .toArray()
      .catch(() => []);
    return { execution: ex, job, ops };
  });
}

function extractCmrParts(cmr) {
  const parts = (cmr?.messages || []).flatMap((m) => m.content || []);
  const byName = (n) => parts.find((p) => p.name === n) || null;
  return {
    deliverable_composition: byName("deliverable_composition"),
    brand_context: byName("brand_context"),
    multimodal_context: byName("multimodal_context"),
    production_specification: byName("production_specification"),
    user_authoritative_instruction: byName("user_authoritative_instruction"),
    composition_authority: byName("composition_authority"),
    selected_semantic_directions: byName("selected_semantic_directions"),
    creative_direction: byName("creative_direction") || byName("selected_creative_direction"),
  };
}

/** ONE authoritative hash — matches provider_boundary / cdfCanonicalContextHash. Never invent. */
function resolveAuthoritativeGenerationContextHash(meta, cmr) {
  const stamped = meta?.cdfCanonicalContextHash;
  if (typeof stamped === "string" && stamped.trim()) return stamped.trim();
  const cmrHash = cmr?.metadata?.generationContextHash;
  if (typeof cmrHash === "string" && cmrHash.trim()) return cmrHash.trim();
  if (typeof meta?.generationContextHash === "string" && meta.generationContextHash.trim()) {
    return meta.generationContextHash.trim();
  }
  return null;
}

function parseSelectedDirectionIdentity(identity) {
  if (typeof identity !== "string" || !identity.trim()) return null;
  const m = identity.trim().match(/^([^@]+)@(\d+)(?:#([^\[]+)\[(\d+)\])?$/);
  if (!m) return null;
  return {
    artifactId: m[1],
    version: Number(m[2]),
    choiceArrayKey: m[3] || null,
    selectedRouteIndex: m[4] != null ? Number(m[4]) : null,
    selectedDirectionIdentity: identity.trim(),
  };
}

function resolveSelectedRoutePin(meta, cmr, parts) {
  if (meta?.cdfSelectedArtifactId != null && meta?.cdfSelectedArtifactVersion != null) {
    return {
      selectedRouteArtifactId: meta.cdfSelectedArtifactId,
      selectedRouteArtifactVersion: Number(meta.cdfSelectedArtifactVersion),
      selectedRouteArtifactKey: meta.cdfSelectedArtifactKey || null,
      source: "metadata_structured",
    };
  }
  const parsed = parseSelectedDirectionIdentity(meta?.cdfSelectedDirectionIdentity);
  if (parsed) {
    return {
      selectedRouteArtifactId: parsed.artifactId,
      selectedRouteArtifactVersion: parsed.version,
      selectedRouteArtifactKey: meta?.cdfSelectedArtifactKey || null,
      source: "metadata_identity",
    };
  }
  const data = parts?.selected_semantic_directions?.data;
  const dirs = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? Object.values(data)
      : [];
  const primary = dirs[0];
  if (primary?.artifactId != null && primary?.version != null) {
    return {
      selectedRouteArtifactId: primary.artifactId,
      selectedRouteArtifactVersion: Number(primary.version),
      selectedRouteArtifactKey: primary.artifactKey || null,
      source: "cmr_selected_semantic_directions",
    };
  }
  return {
    selectedRouteArtifactId: null,
    selectedRouteArtifactVersion: null,
    selectedRouteArtifactKey: null,
    source: "none",
  };
}

function extractRrc(dc) {
  const data = dc?.data || dc || {};
  const rrc =
    data.requiredRenderedCommunication ||
    data.required_rendered_communication ||
    null;
  const surfaces = rrc?.surfaces || data.surfaces || data.messageSurfaces || [];
  const primary =
    surfaces.find(
      (s) =>
        s?.element === "primary_message_surface" ||
        s?.role === "primary_message_surface" ||
        s?.surfaceId === "primary_message_surface" ||
        s?.id === "primary_message_surface",
    ) ||
    surfaces[0] ||
    null;
  const exact =
    primary?.text ||
    primary?.exactText ||
    primary?.value ||
    rrc?.exactText ||
    rrc?.text ||
    rrc?.value ||
    null;
  return {
    deliverable_composition_exists: !!dc,
    requiredRenderedCommunication_exists: !!rrc,
    primary_message_surface_exists: !!primary,
    required: rrc?.required === true || primary?.required === true,
    exactText: exact,
    resolutionStatus:
      primary?.resolutionStatus || rrc?.resolutionStatus || rrc?.status || null,
    provenance: primary?.provenance || rrc?.provenance || null,
  };
}

function fingerprintCanonicalInput(meta, cmr, parts) {
  const routePin = resolveSelectedRoutePin(meta, cmr, parts);
  const rrc = extractRrc(parts.deliverable_composition);
  const brand = parts.brand_context?.data || {};
  const mm = parts.multimodal_context?.data || {};
  const mmItems = mm.items || [];
  const brandRef = mmItems.find(
    (it) =>
      /identity_mark|brand_logo|logo/i.test(String(it.semanticReferenceRole || "")) ||
      it.assetId === SUNFLOWER.logoAssetId,
  );
  return {
    selectedRouteArtifactId: routePin.selectedRouteArtifactId,
    selectedRouteArtifactVersion: routePin.selectedRouteArtifactVersion,
    selectedRouteArtifactKey: routePin.selectedRouteArtifactKey,
    selectedRoutePinSource: routePin.source,
    activeBriefIdentity:
      meta?.cdfActiveBriefId ||
      meta?.activeBriefId ||
      cmr?.activeBrief?.id ||
      null,
    activeBriefVersion:
      meta?.cdfActiveBriefVersion ||
      meta?.activeBriefVersion ||
      cmr?.activeBrief?.version ||
      null,
    currentUserInstruction:
      meta?.conversationalCurrentUserInstruction ||
      meta?.cdfCurrentUserInstruction ||
      null,
    canonicalBrandIdentity:
      meta?.cdfSelectedCanonicalBrandName ||
      meta?.canonicalBrandName ||
      brand?.canonicalBrandName ||
      brand?.name ||
      null,
    brandReferenceAssetId:
      brandRef?.assetId ||
      meta?.logoAssetId ||
      meta?.brandLogoAssetId ||
      null,
    brandReferenceRole: brandRef?.semanticReferenceRole || null,
    semanticCreativeDirectionSha: sha8(
      JSON.stringify(
        meta?.cdfSelectedDirectionSemanticFields ||
          parts.creative_direction?.data ||
          null,
      ),
    ),
    deliverableCompositionSha: sha8(
      JSON.stringify(parts.deliverable_composition?.data || null),
    ),
    rrcExactText: rrc.exactText,
    rrcSha: sha8(rrc.exactText || ""),
    productionSpecSha: sha8(
      JSON.stringify(parts.production_specification?.data || null),
    ),
    userAuthoritativeSha: sha8(
      JSON.stringify(parts.user_authoritative_instruction?.data || null),
    ),
    compositionAuthoritySha: sha8(
      JSON.stringify(parts.composition_authority?.data || null),
    ),
    referenceRoleSemantics: mmItems.map((it) => ({
      assetId: it.assetId,
      role: it.semanticReferenceRole,
      source: it.referenceRoleResolutionSource,
    })),
  };
}

function structuralFromMeta(meta, resultData) {
  const bag = {
    ...(meta || {}),
    ...(resultData && typeof resultData === "object" ? resultData : {}),
  };
  const compliance =
    bag.cdfStructuralCompliance && typeof bag.cdfStructuralCompliance === "object"
      ? bag.cdfStructuralCompliance
      : {};
  const sv = bag.cdfStructuralVerification || bag.structuralVerification || {};
  const ocr = bag.cdfOcrEvidence || bag.ocrEvidence || sv.ocr || {};
  const decision =
    bag.cdfCanonicalIngestDecision || bag.canonicalIngestDecision || {};
  const eligibility =
    bag.presentationEligibility && typeof bag.presentationEligibility === "object"
      ? bag.presentationEligibility
      : null;
  return {
    ocrExecuted: !!(
      compliance.ocrExecuted ||
      ocr.executed ||
      ocr.status ||
      ocr.extractedText ||
      compliance.extractedText ||
      sv.ocrExecuted
    ),
    ocrOutcome: compliance.ocrOutcome || ocr.outcome || ocr.status || null,
    ocrExtractedText:
      compliance.extractedText ||
      ocr.extractedText ||
      ocr.fullText ||
      (Array.isArray(ocr.texts) ? ocr.texts.join(" | ") : null) ||
      sv.ocrExtractedText ||
      null,
    ocrConfidence:
      typeof compliance.ocrConfidence === "number"
        ? compliance.ocrConfidence
        : typeof ocr.confidence === "number"
          ? ocr.confidence
          : null,
    expectedTexts:
      compliance.expectedRenderedTexts ||
      sv.expectedRenderedTexts ||
      bag.cdfExpectedRenderedTexts ||
      null,
    textPresence:
      compliance.renderedTextPresenceVerdict ||
      sv.rendered_text_presence ||
      sv.textPresence ||
      bag.cdfRenderedTextPresence ||
      null,
    textMatch:
      compliance.renderedTextMatchVerdict ||
      sv.rendered_text_match ||
      sv.textMatch ||
      bag.cdfRenderedTextMatch ||
      null,
    structuralVerdict:
      compliance.overallStructuralVerdict ||
      compliance.status ||
      sv.verdict ||
      sv.structuralVerdict ||
      bag.cdfStructuralComplianceStatus ||
      bag.cdfStructuralVerdict ||
      null,
    failedRequirementIds:
      compliance.failedRequirementIds ||
      compliance.failedRequirements ||
      null,
    blockingDecision:
      compliance.blockingDecision === true ||
      compliance.blocksCanonicalCompletion === true,
    canonicalIngestDecision:
      compliance.canonicalIngestDecision ||
      decision.decision ||
      decision.status ||
      bag.cdfCanonicalIngestStatus ||
      null,
    productCompletionBlocked:
      bag.productCompletionBlocked === true ||
      bag.cdfCanonicalRejected === true ||
      decision.productCompletionBlocked === true ||
      compliance.blockingDecision === true ||
      sv.productCompletionBlocked === true,
    presentationEligibility: eligibility
      ? {
          status: eligibility.status,
          reason: eligibility.reason,
          rawMediaPresent: eligibility.rawMediaPresent,
          canonicalArtifact: eligibility.canonicalArtifact || null,
        }
      : null,
  };
}

async function main() {
  ensureDir();
  step("auth_mode", {
    email: EMAIL,
    mode: PASSWORD ? "password" : "firebase_admin_custom_token",
  });

  // PART 1 — live inventory from the same modules the runtime uses
  const plan = planLiveInventoryFromRuntime();
  report.liveInventory = plan;
  write("00_live_inventory.json", report.liveInventory);
  step("live_inventory", report.liveInventory);

  // Current declared registry (image-use-case-routing.ts marketing_creative):
  // OpenAI primary + Gemini + OpenAI secondary. Ideogram is not an active
  // fanout target — this expectation was stale from an earlier registry version.
  const expectedModels = [
    "gpt-image-2.5-sunburst",
    "gemini-3-pro-image",
    "gpt-image-1.5",
  ];
  const actualModels = plan.targets.map((t) => t.modelId);
  if (JSON.stringify(actualModels) !== JSON.stringify(expectedModels)) {
    report.verdict = "FAIL — FRAMEWORK DEFECT";
    write("REPORT.json", report);
    throw new Error(
      `LIVE INVENTORY MISMATCH: got ${actualModels.join(",")} expected ${expectedModels.join(",")}`,
    );
  }

  step("restart_backend", { reason: "durable in-process spawn for fanout E2E" });
  await killBackend();
  const pid = startBackend();
  step("backend_spawned", { pid });
  if (!(await waitReady())) throw new Error("backend not ready");
  step("backend_ready", { ok: true });

  const token = await firebaseToken(EMAIL, PASSWORD);
  const me = unwrap((await http("GET", "/v1/me", { token })).json);
  const orgId = me?.currentOrganizationId || me?.organizationId;
  step("auth", { email: me?.user?.email || me?.email || EMAIL, orgId });

  let r = await http("POST", "/v1/cdf/sessions", {
    token,
    body: {
      serviceId: "social-media",
      productMode: "ai",
      brandId: SUNFLOWER.brandId,
    },
  });
  let session = unwrap(r.json)?.session;
  if (!session?.sessionId) throw new Error(`session failed: ${JSON.stringify(r.json)}`);
  const sid = session.sessionId;
  report.evidence = { sessionId: sid };
  step("session", { sid, phaseId: session.phaseId });

  r = await http("POST", "/v1/cdf/transition", {
    token,
    body: {
      sessionId: sid,
      action: "submit_brief",
      brief: RAW_INSTRUCTION,
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

  const baseMeta = {
    service: "social",
    subtype: "content-design",
    platform: "instagram",
    format: "feed-post",
    category: "instagram:feed-post",
    productAction: "generate",
    brandId: SUNFLOWER.brandId,
    brandName: SUNFLOWER.brandName,
    canonicalBrandName: SUNFLOWER.brandName,
    brandConfirmed: true,
    conversationalCurrentUserInstruction: RAW_INSTRUCTION,
    // Stale fixture: SUNFLOWER.logoAssetId no longer exists in this DB — the
    // fanout-independence invariants under test do not require brand-logo
    // continuity, so it is omitted rather than fabricated.
    allowsModelGenerationFanout: true,
    cdfGenerationModality: "image",
    cdfUxType: "visual",
  };

  // ROUTES (text) — one set of creative directions
  r = await http("POST", "/v1/executions", {
    token,
    timeoutMs: 120000,
    body: {
      prompt: `${RAW_INSTRUCTION}\n\nGenerate exactly 3 creative directions for an introductory Instagram feed post.`,
      capabilityId: "text.generate",
      organizationId: orgId,
      providerId: "provider.openai",
      modelId: "gpt-4o",
      metadata: {
        ...baseMeta,
        cdfSessionId: sid,
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
        cdfArtifactKey: "social-media.routes",
        cdfExecutionStrategy: "canonical",
        cdfGenerator: "text",
        cdfSemanticRole: "text_choice",
        cdfOmitStructuredOutput: true,
        forceWriteCopy: true,
      },
    },
  });
  let ex = unwrap(r.json);
  const routesEid = ex?.executionId || ex?.id;
  step("routes_create", { status: r.status, eid: routesEid, error: r.status >= 400 ? r.json : undefined });
  if (!routesEid) throw new Error("routes create failed: " + JSON.stringify(r.json).slice(0, 500));
  let polled = { status: ex?.status, ex };
  if (!["succeeded", "failed", "completed", "error"].includes(polled.status)) {
    polled = await pollExecution(token, routesEid);
  }
  if (polled.status !== "succeeded" && polled.status !== "completed") {
    throw new Error(`routes failed: ${polled.ex?.errorMessage || polled.status}`);
  }

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session ?? session;
  const routesGen = pin(
    (session.generatedArtifacts || []).find(
      (x) => x.artifactKey === "social-media.routes",
    ),
  );
  const mongo = await mongoRoutes(sid);
  const routesVersion = mongo.vers.find(
    (v) =>
      v.artifactId === routesGen?.artifactId && v.version === routesGen?.version,
  );
  const routesPayload = routesVersion?.data?.routes || [];
  write("01_routes.json", { routesGen, routes: routesPayload });

  // ONE selected creative direction (index 0 — first route)
  const selectIndex = 0;
  const selectedRouteObject = routesPayload[selectIndex] || null;
  r = await http("POST", "/v1/cdf/transition", {
    token,
    body: {
      sessionId: sid,
      action: "select_route",
      routeIndex: selectIndex,
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
  const selectedXv = selected
    ? `${selected.artifactId}@${selected.version}`
    : null;
  report.selectedRoute = {
    pin: selected,
    xAtV: selectedXv,
    routeIndex: selectIndex,
    routeName: selectedRouteObject?.name || selectedRouteObject?.title,
    route: selectedRouteObject,
  };
  write("02_selected_route.json", report.selectedRoute);
  step("select_route", report.selectedRoute);

  report.fanoutGraph = {
    selectedCreativeXv: selectedXv,
    groupId: plan.groupId,
    leaves: plan.targets.map((t) => ({
      targetId: t.targetId,
      provider: t.providerId,
      model: t.modelId,
      label: t.label,
    })),
  };
  write("03_fanout_graph.json", report.fanoutGraph);
  step("fanout_graph", report.fanoutGraph);

  // THREE independent leaf executions — same creative input, different provider pins
  const leafCreates = await Promise.all(
    plan.targets.map(async (target) => {
      const leafMeta = {
        ...baseMeta,
        ...buildGenerationFanoutLeafMetadata({ plan, target }),
        cdfSessionId: sid,
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfArtifactKey: "social-media.output",
        cdfExecutionStrategy: "canonical",
        cdfGenerator: "image",
        cdfSemanticRole: "visual",
        skipOutputRequirements: true,
      };
      const create = await http("POST", "/v1/executions", {
        token,
        timeoutMs: 120000,
        body: {
          prompt: `${RAW_INSTRUCTION}\n\nGenerate the final Instagram feed post creative for the selected direction.`,
          capabilityId: "image.generate",
          organizationId: orgId,
          providerId: target.providerId,
          modelId: target.modelId,
          metadata: leafMeta,
        },
      });
      const created = unwrap(create.json);
      const eid = created?.executionId || created?.id;
      return {
        target,
        createStatus: create.status,
        createBody: create.json,
        executionId: eid,
        leafMeta,
      };
    }),
  );
  write("04_leaf_creates.json", leafCreates.map((l) => ({
    targetId: l.target.targetId,
    provider: l.target.providerId,
    model: l.target.modelId,
    createStatus: l.createStatus,
    executionId: l.executionId,
    error: l.createBody?.error || l.createBody?.message,
  })));
  step(
    "leaf_creates",
    leafCreates.map((l) => ({
      targetId: l.target.targetId,
      eid: l.executionId,
      status: l.createStatus,
    })),
  );

  for (const l of leafCreates) {
    if (!l.executionId) {
      throw new Error(
        `leaf create failed for ${l.target.targetId}: ${JSON.stringify(l.createBody)}`,
      );
    }
  }

  // Poll all three in parallel
  const leafResults = await Promise.all(
    leafCreates.map(async (l) => {
      const polledLeaf = await pollExecution(token, l.executionId, 200);
      return { ...l, polled: polledLeaf };
    }),
  );

  // Deep dump each leaf
  const leafEvidence = {};
  const fingerprints = {};
  for (const l of leafResults) {
    // Key by exact targetId, not provider name — the current declared
    // topology has two OpenAI leaves (fanout_0_openai, fanout_2_openai), so
    // provider-name keying silently collapses/drops a leaf.
    const key = l.target.targetId;
    const pack = await loadJob(l.executionId);
    const job = pack.job;
    const meta = job?.payload?.metadata || pack.execution?.metadata || {};
    const resultData =
      pack.execution?.result?.data &&
      typeof pack.execution.result.data === "object"
        ? pack.execution.result.data
        : l.polled.ex?.result?.data &&
            typeof l.polled.ex.result.data === "object"
          ? l.polled.ex.result.data
          : {};
    const cmr = meta.canonicalModelRequest || null;
    const parts = extractCmrParts(cmr);
    const rrc = extractRrc(parts.deliverable_composition);
    const fp = fingerprintCanonicalInput(meta, cmr, parts);
    const structural = structuralFromMeta(meta, resultData);
    const rawMediaIds = Array.isArray(pack.execution?.artifactIds)
      ? pack.execution.artifactIds
      : Array.isArray(l.polled.ex?.artifactIds)
        ? l.polled.ex.artifactIds
        : [];
    const generationContextHash = resolveAuthoritativeGenerationContextHash(
      meta,
      cmr,
    );
    fingerprints[key] = { ...fp, generationContextHash };
    // Flatten CMR for wire presence check
    let flatPrompt = "";
    let flatHasRrc = false;
    if (cmr) {
      write(`${key}_cmr.json`, cmr);
      try {
        const { execSync } = require("child_process");
        const cmrPath = path.join(EV, `${key}_cmr.json`);
        flatPrompt = execSync(
          `npx --yes tsx -e "import { flattenCanonicalModelRequestToLabeledPrompt } from './src/platform/ai/canonical-model-request/flatten-labeled'; import fs from 'fs'; const cmr=JSON.parse(fs.readFileSync('${cmrPath}','utf8')); process.stdout.write(flattenCanonicalModelRequestToLabeledPrompt(cmr));"`,
          { cwd: ROOT, encoding: "utf8", maxBuffer: 30_000_000 },
        );
        write(`${key}_flat_prompt.txt`, flatPrompt);
        flatHasRrc = !!(
          rrc.exactText &&
          flatPrompt.includes(String(rrc.exactText).slice(0, 40))
        );
      } catch (e) {
        write(`${key}_flat_error.txt`, String(e));
      }
    }

    const providerWireReached = !!(
      pack.ops?.length ||
      meta.cdfProviderIntentDiagnostics ||
      meta.providerResponseStatus ||
      meta.finalProviderId ||
      pack.execution?.providerId
    );
    const rrcOnWire = flatHasRrc || !!(
      meta.cdfProviderIntentDiagnostics?.requiredRenderedCommunicationPresent ||
      (Array.isArray(meta.cdfProviderWireFingerprints) &&
        meta.cdfProviderWireFingerprints.length > 0 &&
        flatHasRrc)
    );

    // Artifact versions for this execution/session
    const bagAfter = await mongoRoutes(sid);
    const outputArts = bagAfter.arts.filter(
      (a) =>
        a.artifactKey === "social-media.output" &&
        (a.executionId === l.executionId ||
          a.provenance?.executionId === l.executionId ||
          a.sourceExecutionId === l.executionId),
    );
    const outputVers = bagAfter.vers.filter((v) =>
      outputArts.some((a) => a.artifactId === v.artifactId),
    );
    // Also match by metadata stamps on versions
    const versByExec = bagAfter.vers.filter(
      (v) =>
        v.data?.executionId === l.executionId ||
        v.provenance?.executionId === l.executionId ||
        v.metadata?.executionId === l.executionId ||
        v.createdByExecutionId === l.executionId,
    );

    const m9c =
      meta.cdfM9cBinding ||
      meta.m9cBinding ||
      session?.masters ||
      null;

    const evidence = {
      fanoutGroup: meta.generationFanoutGroupId || plan.groupId,
      leafExecutionId: l.executionId,
      requestedProvider: l.target.providerId,
      requestedModel: l.target.modelId,
      actualProvider:
        meta.finalProviderId ||
        meta.preferredProviderId ||
        pack.execution?.providerId ||
        null,
      actualModel:
        meta.finalModelId ||
        meta.preferredModelId ||
        pack.execution?.modelId ||
        null,
      fallbackUsed:
        meta.fallbackUsed === true ||
        meta.imageFailoverUsed === true ||
        (Array.isArray(meta.imageFailoverChain) &&
          meta.imageFailoverChain.length > 0 &&
          meta.failoverStepIndex > 0) ||
        false,
      fallbackReason: meta.fallbackReason || meta.imageFailoverReason || null,
      generationFanoutLeaf: meta.generationFanoutLeaf === true,
      imageFailoverChain: meta.imageFailoverChain ?? null,
      disableCrossProviderFailover: meta.disableCrossProviderFailover === true,
      selectedRouteXv: selectedXv,
      activeBrief: `${fp.activeBriefIdentity || "?"}@${fp.activeBriefVersion || "?"}`,
      rrc,
      rrcPresent: rrc.requiredRenderedCommunication_exists && !!rrc.exactText,
      exactRrcText: rrc.exactText,
      rrcReachedProviderWire: rrcOnWire || flatHasRrc,
      brandReferenceReached: !!fp.brandReferenceAssetId,
      providerExecuted:
        ["succeeded", "completed", "failed", "error"].includes(l.polled.status) &&
        providerWireReached,
      providerResponseStatus: l.polled.status,
      providerError: l.polled.ex?.errorMessage || meta.errorMessage || null,
      structural,
      ocrExecuted: structural.ocrExecuted,
      ocrOutcome: structural.ocrOutcome,
      ocrExtractedText: structural.ocrExtractedText,
      ocrConfidence: structural.ocrConfidence,
      expectedTexts: structural.expectedTexts,
      textPresenceVerdict: structural.textPresence,
      textMatchVerdict: structural.textMatch,
      structuralVerdict: structural.structuralVerdict,
      failedRequirementIds: structural.failedRequirementIds,
      blockingDecision: structural.blockingDecision,
      canonicalIngestDecision: structural.canonicalIngestDecision,
      productCompletionBlocked: structural.productCompletionBlocked,
      presentationEligibility: structural.presentationEligibility,
      rawMediaArtifactIds: rawMediaIds,
      generationContextHash,
      canonicalCompletion:
        !structural.productCompletionBlocked &&
        (structural.canonicalIngestDecision === "accepted" ||
          structural.canonicalIngestDecision === "eligible" ||
          structural.canonicalIngestDecision === "ingested" ||
          outputArts.length > 0 ||
          versByExec.length > 0),
      artifactVersions: (outputArts.length ? outputArts : versByExec).map((a) => ({
        artifactId: a.artifactId,
        version: a.version,
        key: a.artifactKey,
        executionId: a.executionId || a.provenance?.executionId,
      })),
      m9cBinding: m9c
        ? {
            platform: m9c.platform || session?.masters?.platform,
            format: m9c.format || session?.masters?.format,
          }
        : null,
      fingerprint: fp,
      metaSlim: {
        preferredProviderId: meta.preferredProviderId,
        preferredModelId: meta.preferredModelId,
        finalProviderId: meta.finalProviderId,
        finalModelId: meta.finalModelId,
        generationFanoutLeaf: meta.generationFanoutLeaf,
        generationFanoutGroupId: meta.generationFanoutGroupId,
        generationFanoutTargetId: meta.generationFanoutTargetId,
        imageFailoverChain: meta.imageFailoverChain,
        disableCrossProviderFailover: meta.disableCrossProviderFailover,
        productCompletionBlocked: structural.productCompletionBlocked,
        cdfStructuralVerdict: structural.structuralVerdict,
        presentationEligibility: structural.presentationEligibility,
        sectionsPresent: meta.cdfCanonicalSectionsPresent,
      },
      opCount: pack.ops?.length || 0,
      ops: (pack.ops || []).map((o) => ({
        providerId: o.providerId,
        modelId: o.modelId,
        status: o.status,
        errorCode: o.errorCode,
        errorMessage: o.errorMessage || o.lastError || null,
        responseBodySnippet:
          typeof o.responseBody === "string"
            ? o.responseBody.slice(0, 500)
            : o.response?.error
              ? JSON.stringify(o.response.error).slice(0, 500)
              : null,
      })),
    };
    leafEvidence[key] = evidence;
    write(`${key}_evidence.json`, evidence);
    write(`${key}_meta_full.json`, {
      keys: Object.keys(meta).sort(),
      structuralRelated: Object.fromEntries(
        Object.entries(meta).filter(([k]) =>
          /struct|ocr|accept|ingest|fanout|failover|rrc|composition|finalProvider|finalModel|preferred/i.test(
            k,
          ),
        ),
      ),
    });
    step(`leaf_${key}`, {
      eid: l.executionId,
      status: l.polled.status,
      requested: `${l.target.providerId}/${l.target.modelId}`,
      actual: `${evidence.actualProvider}/${evidence.actualModel}`,
      fanoutLeaf: evidence.generationFanoutLeaf,
      failoverChain: evidence.imageFailoverChain,
      rrcPresent: evidence.rrcPresent,
      structural: evidence.structuralVerdict,
      artifacts: evidence.artifactVersions.length,
    });
  }

  report.leaves = leafEvidence;

  // Canonical input comparison across leaves — keyed by exact targetId
  // (see leafEvidence keying above; provider name is not unique per leaf).
  const keys = Object.keys(leafEvidence);
  const compareFields = [
    "selectedRouteArtifactId",
    "selectedRouteArtifactVersion",
    "selectedRouteArtifactKey",
    "activeBriefIdentity",
    "activeBriefVersion",
    "currentUserInstruction",
    "canonicalBrandIdentity",
    "brandReferenceAssetId",
    "semanticCreativeDirectionSha",
    "deliverableCompositionSha",
    "rrcSha",
    "productionSpecSha",
    "userAuthoritativeSha",
    "compositionAuthoritySha",
    "generationContextHash",
  ];
  const comparison = {};
  for (const field of compareFields) {
    const vals = keys.map((k) => fingerprints[k]?.[field] ?? null);
    const allSame = vals.every((v) => JSON.stringify(v) === JSON.stringify(vals[0]));
    comparison[field] = { values: Object.fromEntries(keys.map((k, i) => [k, vals[i]])), identical: allSame };
  }
  report.canonicalInputComparison = comparison;
  write("05_canonical_input_comparison.json", comparison);
  step("canonical_input_comparison", {
    identicalFields: compareFields.filter((f) => comparison[f].identical),
    divergentFields: compareFields.filter((f) => !comparison[f].identical),
  });

  // Evidence table
  const table = {
    headers: ["Field", "OpenAI", "Google", "Ideogram"],
    rows: [
      ["Fanout group", ...keys.map((k) => leafEvidence[k]?.fanoutGroup)],
      ["Leaf execution ID", ...keys.map((k) => leafEvidence[k]?.leafExecutionId)],
      ["Requested provider", ...keys.map((k) => leafEvidence[k]?.requestedProvider)],
      ["Requested model", ...keys.map((k) => leafEvidence[k]?.requestedModel)],
      ["Actual provider", ...keys.map((k) => leafEvidence[k]?.actualProvider)],
      ["Actual model", ...keys.map((k) => leafEvidence[k]?.actualModel)],
      ["Fallback used", ...keys.map((k) => leafEvidence[k]?.fallbackUsed)],
      ["Selected route X@V", ...keys.map(() => selectedXv)],
      ["Active brief", ...keys.map((k) => leafEvidence[k]?.activeBrief)],
      ["RRC present", ...keys.map((k) => leafEvidence[k]?.rrcPresent)],
      [
        "Exact RRC text",
        ...keys.map((k) => {
          const t = leafEvidence[k]?.exactRrcText;
          return t ? String(t).slice(0, 80) + (String(t).length > 80 ? "…" : "") : null;
        }),
      ],
      ["RRC reached provider wire", ...keys.map((k) => leafEvidence[k]?.rrcReachedProviderWire)],
      ["Brand reference reached", ...keys.map((k) => leafEvidence[k]?.brandReferenceReached)],
      ["Provider executed", ...keys.map((k) => leafEvidence[k]?.providerExecuted)],
      ["OCR executed", ...keys.map((k) => leafEvidence[k]?.ocrExecuted)],
      [
        "OCR extracted text",
        ...keys.map((k) => {
          const t = leafEvidence[k]?.ocrExtractedText;
          return t ? String(t).slice(0, 100) : null;
        }),
      ],
      ["Text presence verdict", ...keys.map((k) => leafEvidence[k]?.textPresenceVerdict)],
      ["Text match verdict", ...keys.map((k) => leafEvidence[k]?.textMatchVerdict)],
      ["Structural verdict", ...keys.map((k) => leafEvidence[k]?.structuralVerdict)],
      [
        "Presentation eligibility",
        ...keys.map((k) => leafEvidence[k]?.presentationEligibility?.status ?? null),
      ],
      [
        "Raw media artifactIds",
        ...keys.map((k) =>
          (leafEvidence[k]?.rawMediaArtifactIds || []).join(",") || null,
        ),
      ],
      [
        "Generation context hash",
        ...keys.map((k) => leafEvidence[k]?.generationContextHash ?? null),
      ],
      ["Canonical completion", ...keys.map((k) => leafEvidence[k]?.canonicalCompletion)],
      [
        "ArtifactVersion",
        ...keys.map((k) => {
          const avs = leafEvidence[k]?.artifactVersions || [];
          return avs.length
            ? avs.map((a) => `${a.artifactId}@${a.version}`).join(",")
            : null;
        }),
      ],
      [
        "M9C binding",
        ...keys.map((k) => {
          const m = leafEvidence[k]?.m9cBinding;
          return m ? `${m.platform}/${m.format}` : null;
        }),
      ],
    ],
  };
  report.evidenceTable = table;
  write("06_evidence_table.json", table);

  // Hydration / restart check — re-poll each leaf; no new generation.
  const hydration = {};
  for (const k of keys) {
    const eid = leafEvidence[k]?.leafExecutionId;
    if (!eid) continue;
    const again = await pollExecution(token, eid, 3);
    const pack2 = await loadJob(eid);
    const meta2 = pack2.job?.payload?.metadata || {};
    const result2 =
      pack2.execution?.result?.data &&
      typeof pack2.execution.result.data === "object"
        ? pack2.execution.result.data
        : again.ex?.result?.data || {};
    const st2 = structuralFromMeta(meta2, result2);
    hydration[k] = {
      executionId: eid,
      statusAfterHydrate: again.status,
      presentationEligibility: st2.presentationEligibility,
      productCompletionBlocked: st2.productCompletionBlocked,
      structuralVerdict: st2.structuralVerdict,
      artifactIds: pack2.execution?.artifactIds || again.ex?.artifactIds || [],
      stillNotAvailableWhenRejected:
        st2.presentationEligibility?.status === "REJECTED" ||
        st2.presentationEligibility?.status === "FAILED" ||
        st2.productCompletionBlocked === true ||
        again.status === "failed",
    };
  }
  report.hydrationCheck = hydration;
  write("06b_hydration_check.json", hydration);
  step("hydration_check", hydration);

  // Classification
  const classifications = {};
  for (const k of keys) {
    const e = leafEvidence[k];
    let cls = "unknown";
    const reqOk =
      e.requestedProvider &&
      e.actualProvider &&
      e.requestedProvider === e.actualProvider &&
      e.requestedModel === e.actualModel;
    const err = String(e.providerError || "");
    const errBody = JSON.stringify(e.ops || []);
    if (e.fallbackUsed && e.generationFanoutLeaf) {
      cls = "A. fanout/planner defect (leaf consumed failover)";
    } else if (!reqOk && e.actualProvider && e.actualProvider !== e.requestedProvider) {
      cls = e.fallbackUsed
        ? "A. fanout/planner defect"
        : "C. provider/model routing defect";
    } else if (
      /cannot be represented|REQUIRED_BUT_UNREPRESENTABLE|provider_lacks_canonical/i.test(
        err,
      )
    ) {
      cls = "B. canonical context propagation defect";
    } else if (!e.rrcPresent) {
      cls = "B. canonical context propagation defect";
    } else if (
      /insufficient_quota|credit_balance|RESOURCE_EXHAUSTED|billing|prepayment/i.test(
        err + errBody,
      )
    ) {
      cls = "D. provider operational/billing defect";
    } else if (/429|rate.?limit/i.test(err) && !/insufficient_quota|credit/i.test(err + errBody)) {
      cls = "D. provider operational/billing defect (inspect body — may be quota)";
    } else if (
      e.providerResponseStatus === "failed" ||
      e.providerResponseStatus === "error"
    ) {
      if (!(e.rawMediaArtifactIds || []).length) {
        cls = "D. provider operational/billing defect";
      } else if (
        e.structuralVerdict === "NON_COMPLIANT" ||
        e.productCompletionBlocked ||
        e.presentationEligibility?.status === "REJECTED"
      ) {
        cls = "E. provider instruction-adherence defect";
      } else {
        cls = "D. provider operational/billing defect";
      }
    } else if (
      e.structuralVerdict === "NON_COMPLIANT" ||
      e.productCompletionBlocked ||
      e.presentationEligibility?.status === "REJECTED"
    ) {
      if (e.rrcReachedProviderWire && e.ocrExecuted) {
        cls = "E. provider instruction-adherence defect";
      } else if (e.ocrExecuted === false && e.productCompletionBlocked) {
        cls = "F. OCR/structural verification defect";
      } else {
        cls = "G. canonical acceptance defect";
      }
    } else if (
      (e.rawMediaArtifactIds || []).length > 0 &&
      e.presentationEligibility?.status === "AVAILABLE" &&
      !e.canonicalCompletion
    ) {
      cls = "H. presentation eligibility defect";
    } else if (reqOk && e.rrcPresent && e.canonicalCompletion && e.presentationEligibility?.status === "AVAILABLE") {
      cls = "PASS — leaf completed with independent acceptance";
    } else if (reqOk && e.rrcPresent && e.canonicalCompletion) {
      cls = "PASS — leaf completed with independent acceptance";
    } else if (reqOk && e.rrcPresent && !e.canonicalCompletion) {
      cls = "E. provider instruction-adherence defect (or acceptance blocked)";
    } else {
      cls = "investigate";
    }
    classifications[k] = cls;
  }
  report.classifications = classifications;
  write("07_classifications.json", classifications);

  // Failover vs fanout check.
  // Declared architecture (post structural-warning-correction-pass): a fanout
  // leaf's intra-leaf fallback chain is same-provider-only and must never
  // contain another leaf's exact provider::model — "empty" is not required.
  const siblingKeys = new Set(
    keys.map((k) => `${leafEvidence[k]?.requestedProvider}::${leafEvidence[k]?.requestedModel}`),
  );
  const fanoutVsFailover = {
    allLeavesMarkedFanout: keys.every((k) => leafEvidence[k]?.generationFanoutLeaf === true),
    allFailoverChainsIntraLeafOnly: keys.every((k) => {
      const e = leafEvidence[k];
      const c = e?.imageFailoverChain;
      if (!Array.isArray(c)) return false;
      return c.every(
        (step) =>
          step.providerId === e.requestedProvider &&
          !siblingKeys.has(`${step.providerId}::${step.modelId}`),
      );
    }),
    independentExecutionIds: new Set(keys.map((k) => leafEvidence[k]?.leafExecutionId)).size === 3,
    noCrossLeafFallback: keys.every((k) => {
      const e = leafEvidence[k];
      if (!e.fallbackUsed) return true;
      // If fallback used, actual must still be requested family (should not happen for fanout)
      return e.actualProvider === e.requestedProvider;
    }),
  };
  report.fanoutVsFailover = fanoutVsFailover;
  write("08_fanout_vs_failover.json", fanoutVsFailover);

  // Verdict
  const frameworkDefect =
    !fanoutVsFailover.allLeavesMarkedFanout ||
    !fanoutVsFailover.allFailoverChainsIntraLeafOnly ||
    !fanoutVsFailover.independentExecutionIds ||
    !fanoutVsFailover.noCrossLeafFallback ||
    compareFields.some(
      (f) =>
        !comparison[f].identical &&
        !["activeBriefIdentity", "activeBriefVersion"].includes(f),
    ) ||
    keys.some(
      (k) =>
        classifications[k]?.startsWith("A.") ||
        classifications[k]?.startsWith("B.") ||
        classifications[k]?.startsWith("C.") ||
        classifications[k]?.startsWith("F.") ||
        classifications[k]?.startsWith("G.") ||
        classifications[k]?.startsWith("H.") ||
        classifications[k]?.startsWith("I.") ||
        classifications[k]?.startsWith("J."),
    );

  // Note: E (provider adherence) and D (billing/ops) are not framework defects.
  const providerOnly =
    !frameworkDefect &&
    keys.some(
      (k) =>
        classifications[k]?.startsWith("D.") ||
        classifications[k]?.startsWith("E.") ||
        classifications[k]?.startsWith("PASS"),
    );

  const allPass = keys.every(
    (k) =>
      classifications[k]?.startsWith("PASS") ||
      classifications[k]?.startsWith("D.") ||
      classifications[k]?.startsWith("E."),
  );

  if (frameworkDefect) {
    report.verdict = "FAIL — FRAMEWORK DEFECT";
  } else if (providerOnly || allPass) {
    const anyE = keys.some((k) => classifications[k]?.startsWith("E."));
    const anyD = keys.some((k) => classifications[k]?.startsWith("D."));
    const anyPass = keys.some((k) => classifications[k]?.startsWith("PASS"));
    if (anyPass && !anyE && !anyD) {
      report.verdict = "PASS";
    } else {
      report.verdict = "PASS WITH PROVIDER QUALITY/OPERATIONAL ISSUE";
    }
  } else {
    report.verdict = "FAIL — FRAMEWORK DEFECT";
  }

  // Explicit three-model fanout validation statement
  report.threeModelFanoutValidated =
    fanoutVsFailover.allLeavesMarkedFanout &&
    fanoutVsFailover.allFailoverChainsIntraLeafOnly &&
    fanoutVsFailover.independentExecutionIds &&
    fanoutVsFailover.noCrossLeafFallback &&
    keys.every((k) => leafEvidence[k]?.providerExecuted === true || leafEvidence[k]?.ops?.length > 0 || ["failed","succeeded","completed","error"].includes(leafEvidence[k]?.providerResponseStatus));

  report.endedAt = new Date().toISOString();
  write("REPORT.json", report);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  step("FINAL_VERDICT", { verdict: report.verdict, classifications });
  console.log("\n\nEVIDENCE TABLE:");
  for (const row of table.rows) {
    console.log(row.map((c) => String(c ?? "")).join(" | "));
  }
}

main().catch((e) => {
  console.error("E2E FAILED", e);
  report.verdict = "FAIL — FRAMEWORK DEFECT";
  report.error = String(e?.stack || e);
  write("REPORT.json", report);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.exit(1);
});
