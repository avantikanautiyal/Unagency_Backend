/**
 * Resume forensic collection for the controlled three-leaf E2E that already
 * created executions (no new generation / no extra provider credits).
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

const EMAIL =
  process.env.PHASE8_E2E_EMAIL ||
  process.env.SUNFLOWER_E2E_EMAIL ||
  "avantika.mcs22.du@gmail.com";
const PASSWORD =
  process.env.PHASE8_E2E_PASSWORD || process.env.SUNFLOWER_E2E_PASSWORD;

const LEAVES = JSON.parse(fs.readFileSync(path.join(EV, "04_leaf_creates.json"), "utf8"));
const SELECTED = JSON.parse(fs.readFileSync(path.join(EV, "02_selected_route.json"), "utf8"));
const FANOUT = JSON.parse(fs.readFileSync(path.join(EV, "03_fanout_graph.json"), "utf8"));
const INVENTORY = JSON.parse(fs.readFileSync(path.join(EV, "00_live_inventory.json"), "utf8"));

const report = {
  purpose: "fanout_three_leaf_controlled_e2e_RESUME_NO_NEW_GENERATION",
  startedAt: new Date().toISOString(),
  resumeFrom: LEAVES.map((l) => l.executionId),
  liveInventory: INVENTORY,
  selectedRoute: SELECTED,
  fanoutGraph: FANOUT,
  leaves: {},
  steps: [],
};

function write(name, value) {
  fs.mkdirSync(EV, { recursive: true });
  fs.writeFileSync(
    path.join(EV, name),
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
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

async function firebaseToken(email, password) {
  if (password) {
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
  const admin = require("firebase-admin");
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
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
  if (!j.idToken) throw new Error(`Custom token exchange failed: ${JSON.stringify(j)}`);
  return j.idToken;
}

async function pollExecution(token, eid, maxPolls = 200) {
  for (let i = 0; i < maxPolls; i++) {
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
    if (i % 5 === 0) console.log(`  poll ${eid} #${i} status=${status}`);
    await sleep(3000);
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
    const sessionId =
      job?.payload?.metadata?.cdfSessionId ||
      ex?.result?.data?.cdfSessionId ||
      null;
    let session = null;
    if (sessionId) {
      session = await db.collection("cdf_sessions").findOne({ sessionId });
    }
    const bag = await db
      .collection("cdf_canonical_artifact_bags")
      .findOne({ bagKey: "global" });
    return { execution: ex, job, ops, session, bag };
  });
}

// Reuse helpers from main e2e by eval'ing the updated functions from the file text
// (avoid duplicate drift): require via vm of extracted functions is heavy — inline minimal copy.

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

/** ONE authoritative hash — matches provider_boundary. Never invent. */
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
      it.assetId === "6a98cb217bc20263f64311aa",
  );
  return {
    selectedRouteArtifactId: routePin.selectedRouteArtifactId,
    selectedRouteArtifactVersion: routePin.selectedRouteArtifactVersion,
    selectedRouteArtifactKey: routePin.selectedRouteArtifactKey,
    selectedRoutePinSource: routePin.source,
    activeBriefIdentity:
      meta?.cdfActiveBriefId || meta?.activeBriefId || cmr?.activeBrief?.id || null,
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
      brandRef?.assetId || meta?.logoAssetId || meta?.brandLogoAssetId || null,
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
  const eligibility =
    bag.presentationEligibility && typeof bag.presentationEligibility === "object"
      ? bag.presentationEligibility
      : null;
  return {
    ocrExecuted: !!(compliance.ocrExecuted || compliance.extractedText),
    ocrOutcome: compliance.ocrOutcome || null,
    ocrExtractedText: compliance.extractedText || null,
    ocrConfidence:
      typeof compliance.ocrConfidence === "number" ? compliance.ocrConfidence : null,
    expectedTexts: compliance.expectedRenderedTexts || null,
    textPresence: compliance.renderedTextPresenceVerdict || null,
    textMatch: compliance.renderedTextMatchVerdict || null,
    structuralVerdict:
      compliance.overallStructuralVerdict ||
      compliance.status ||
      bag.cdfStructuralComplianceStatus ||
      null,
    failedRequirementIds:
      compliance.failedRequirementIds || compliance.failedRequirements || null,
    blockingDecision:
      compliance.blockingDecision === true ||
      compliance.blocksCanonicalCompletion === true,
    canonicalIngestDecision: compliance.canonicalIngestDecision || null,
    productCompletionBlocked:
      bag.productCompletionBlocked === true ||
      bag.cdfCanonicalRejected === true ||
      compliance.blockingDecision === true,
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

async function ensureBackend() {
  try {
    const r = await fetch(`${API}/v1/ready`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) return;
  } catch {}
  try {
    execSync("lsof -tiTCP:4000 -sTCP:LISTEN | xargs kill -9", { stdio: "ignore" });
  } catch {}
  await sleep(2000);
  const fd = fs.openSync(LOG, "a");
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
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    try {
      const r = await fetch(`${API}/v1/ready`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return;
    } catch {}
  }
  throw new Error("backend not ready for resume");
}

async function main() {
  step("resume_mode", {
    note: "No new leaf creates — collecting terminal evidence from existing executions",
    leaves: LEAVES,
    selected: SELECTED.xAtV,
  });
  await ensureBackend();
  const token = await firebaseToken(EMAIL, PASSWORD);

  const leafResults = await Promise.all(
    LEAVES.map(async (l) => {
      const polled = await pollExecution(token, l.executionId, 200);
      return {
        target: {
          targetId: l.targetId,
          providerId: l.provider,
          modelId: l.model,
        },
        executionId: l.executionId,
        polled,
      };
    }),
  );

  const selectedXv = SELECTED.xAtV;
  const leafEvidence = {};
  const fingerprints = {};
  for (const l of leafResults) {
    const key =
      l.target.providerId === "provider.openai"
        ? "openai"
        : l.target.providerId === "provider.google"
          ? "google"
          : "ideogram";
    const pack = await loadJob(l.executionId);
    const meta = pack.job?.payload?.metadata || {};
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

    let flatHasRrc = false;
    if (cmr) {
      write(`${key}_cmr.json`, cmr);
      try {
        const cmrPath = path.join(EV, `${key}_cmr.json`);
        const flatPrompt = execSync(
          `npx --yes tsx -e "import { flattenCanonicalModelRequestToLabeledPrompt } from './src/platform/ai/canonical-model-request/flatten-labeled'; import fs from 'fs'; const cmr=JSON.parse(fs.readFileSync('${cmrPath}','utf8')); process.stdout.write(flattenCanonicalModelRequestToLabeledPrompt(cmr));"`,
          { cwd: ROOT, encoding: "utf8", maxBuffer: 30_000_000 },
        );
        write(`${key}_flat_prompt.txt`, flatPrompt);
        flatHasRrc = !!(
          rrc.exactText && flatPrompt.includes(String(rrc.exactText).slice(0, 40))
        );
      } catch (e) {
        write(`${key}_flat_error.txt`, String(e));
      }
    }

    const bagArts = pack.bag?.snapshot?.artifacts || [];
    const bagVers = pack.bag?.snapshot?.versions || [];
    const outputArts = bagArts.filter(
      (a) =>
        a.artifactKey === "social-media.output" &&
        (a.executionId === l.executionId ||
          a.provenance?.executionId === l.executionId ||
          a.sourceExecutionId === l.executionId),
    );
    const versByExec = bagVers.filter(
      (v) =>
        v.data?.executionId === l.executionId ||
        v.provenance?.executionId === l.executionId ||
        v.metadata?.executionId === l.executionId ||
        v.createdByExecutionId === l.executionId,
    );

    const evidence = {
      fanoutGroup: meta.generationFanoutGroupId || FANOUT.groupId || INVENTORY.groupId,
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
      generationFanoutLeaf: meta.generationFanoutLeaf === true,
      imageFailoverChain: meta.imageFailoverChain ?? null,
      disableCrossProviderFailover: meta.disableCrossProviderFailover === true,
      selectedRouteXv: selectedXv,
      rrc,
      rrcPresent: rrc.requiredRenderedCommunication_exists && !!rrc.exactText,
      exactRrcText: rrc.exactText,
      rrcReachedProviderWire: flatHasRrc,
      brandReferenceReached: !!fp.brandReferenceAssetId,
      providerExecuted: ["succeeded", "completed", "failed", "error"].includes(
        l.polled.status,
      ),
      providerResponseStatus: l.polled.status,
      providerError: l.polled.ex?.errorMessage || meta.errorMessage || null,
      structural,
      ocrExecuted: structural.ocrExecuted,
      ocrOutcome: structural.ocrOutcome,
      ocrExtractedText: structural.ocrExtractedText,
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
          outputArts.length > 0 ||
          versByExec.length > 0 ||
          !!resultData.cdfArtifactId),
      artifactVersions: [
        ...(resultData.cdfArtifactId
          ? [
              {
                artifactId: resultData.cdfArtifactId,
                version: resultData.cdfArtifactVersion,
                key: resultData.cdfArtifactKey,
                executionId: l.executionId,
              },
            ]
          : []),
        ...outputArts.map((a) => ({
          artifactId: a.artifactId,
          version: a.version,
          key: a.artifactKey,
          executionId: a.executionId || a.provenance?.executionId,
        })),
        ...versByExec.map((v) => ({
          artifactId: v.artifactId,
          version: v.version,
          key: v.artifactKey,
          executionId: v.executionId || v.provenance?.executionId,
        })),
      ],
      fingerprint: fp,
      ops: (pack.ops || []).map((o) => ({
        providerId: o.providerId,
        modelId: o.modelId,
        status: o.status,
        errorCode: o.errorCode,
        errorMessage: o.errorMessage || o.lastError || null,
        responseBodySnippet:
          typeof o.responseBody === "string"
            ? o.responseBody.slice(0, 800)
            : o.response?.error
              ? JSON.stringify(o.response.error).slice(0, 800)
              : o.error
                ? JSON.stringify(o.error).slice(0, 800)
                : null,
      })),
      executionResultKeys: pack.execution?.result
        ? Object.keys(pack.execution.result)
        : [],
      resultDataKeys: Object.keys(resultData || {}),
    };
    leafEvidence[key] = evidence;
    write(`${key}_evidence.json`, evidence);
    step(`leaf_${key}`, {
      eid: l.executionId,
      status: l.polled.status,
      requested: `${l.target.providerId}/${l.target.modelId}`,
      actual: `${evidence.actualProvider}/${evidence.actualModel}`,
      structural: evidence.structuralVerdict,
      presentation: evidence.presentationEligibility?.status,
      rawMedia: evidence.rawMediaArtifactIds,
      artifacts: evidence.artifactVersions.length,
      error: evidence.providerError,
    });
  }

  report.leaves = leafEvidence;

  const keys = ["openai", "google", "ideogram"];
  const compareFields = [
    "selectedRouteArtifactId",
    "selectedRouteArtifactVersion",
    "selectedRouteArtifactKey",
    "canonicalBrandIdentity",
    "brandReferenceAssetId",
    "semanticCreativeDirectionSha",
    "deliverableCompositionSha",
    "rrcSha",
    "productionSpecSha",
    "generationContextHash",
  ];
  const comparison = {};
  for (const field of compareFields) {
    const vals = keys.map((k) => fingerprints[k]?.[field] ?? null);
    const allSame = vals.every((v) => JSON.stringify(v) === JSON.stringify(vals[0]));
    comparison[field] = {
      values: Object.fromEntries(keys.map((k, i) => [k, vals[i]])),
      identical: allSame,
    };
  }
  report.canonicalInputComparison = comparison;
  write("05_canonical_input_comparison.json", comparison);

  const table = {
    headers: ["Field", "OpenAI", "Google", "Ideogram"],
    rows: [
      ["Leaf execution ID", ...keys.map((k) => leafEvidence[k]?.leafExecutionId)],
      ["Requested provider", ...keys.map((k) => leafEvidence[k]?.requestedProvider)],
      ["Requested model", ...keys.map((k) => leafEvidence[k]?.requestedModel)],
      ["Actual provider", ...keys.map((k) => leafEvidence[k]?.actualProvider)],
      ["Actual model", ...keys.map((k) => leafEvidence[k]?.actualModel)],
      ["Fallback used", ...keys.map((k) => leafEvidence[k]?.fallbackUsed)],
      ["Selected route X@V", ...keys.map(() => selectedXv)],
      ["Generation context hash", ...keys.map((k) => leafEvidence[k]?.generationContextHash)],
      ["RRC present", ...keys.map((k) => leafEvidence[k]?.rrcPresent)],
      ["Exact RRC text", ...keys.map((k) => {
        const t = leafEvidence[k]?.exactRrcText;
        return t ? String(t).slice(0, 100) + (String(t).length > 100 ? "…" : "") : null;
      })],
      ["RRC on flattened wire", ...keys.map((k) => leafEvidence[k]?.rrcReachedProviderWire)],
      ["Provider status", ...keys.map((k) => leafEvidence[k]?.providerResponseStatus)],
      ["Provider error", ...keys.map((k) => leafEvidence[k]?.providerError)],
      ["Raw media", ...keys.map((k) => (leafEvidence[k]?.rawMediaArtifactIds || []).join(",") || null)],
      ["OCR executed", ...keys.map((k) => leafEvidence[k]?.ocrExecuted)],
      ["OCR extracted", ...keys.map((k) => {
        const t = leafEvidence[k]?.ocrExtractedText;
        return t ? String(t).slice(0, 120) : null;
      })],
      ["Presence verdict", ...keys.map((k) => leafEvidence[k]?.textPresenceVerdict)],
      ["Match verdict", ...keys.map((k) => leafEvidence[k]?.textMatchVerdict)],
      ["Structural verdict", ...keys.map((k) => leafEvidence[k]?.structuralVerdict)],
      ["Presentation eligibility", ...keys.map((k) => leafEvidence[k]?.presentationEligibility?.status ?? null)],
      ["Canonical completion", ...keys.map((k) => leafEvidence[k]?.canonicalCompletion)],
      ["ArtifactVersion", ...keys.map((k) => {
        const avs = leafEvidence[k]?.artifactVersions || [];
        return avs.length
          ? avs.map((a) => `${a.artifactId}@${a.version}`).join(",")
          : null;
      })],
    ],
  };
  report.evidenceTable = table;
  write("06_evidence_table.json", table);

  // Hydration re-poll
  const hydration = {};
  for (const k of keys) {
    const eid = leafEvidence[k]?.leafExecutionId;
    const again = await pollExecution(token, eid, 2);
    const pack2 = await loadJob(eid);
    const st2 = structuralFromMeta(
      pack2.job?.payload?.metadata || {},
      pack2.execution?.result?.data || {},
    );
    hydration[k] = {
      statusAfterHydrate: again.status,
      presentationEligibility: st2.presentationEligibility,
      productCompletionBlocked: st2.productCompletionBlocked,
      artifactIds: pack2.execution?.artifactIds || [],
      stillRejectedOrFailed:
        again.status === "failed" ||
        st2.presentationEligibility?.status === "REJECTED" ||
        st2.presentationEligibility?.status === "FAILED" ||
        st2.productCompletionBlocked === true,
    };
  }
  report.hydrationCheck = hydration;
  write("06b_hydration_check.json", hydration);

  const classifications = {};
  for (const k of keys) {
    const e = leafEvidence[k];
    const err = String(e.providerError || "");
    const body = JSON.stringify(e.ops || []);
    let cls = "investigate";
    if (e.fallbackUsed) cls = "A. fanout/planner defect";
    else if (
      e.actualProvider &&
      e.requestedProvider &&
      e.actualProvider !== e.requestedProvider
    )
      cls = "C. provider/model routing defect";
    else if (!e.rrcPresent) cls = "B. canonical context propagation defect";
    else if (/insufficient_quota|credit_balance|RESOURCE_EXHAUSTED|billing|prepayment/i.test(err + body))
      cls = "D. provider operational/billing defect";
    else if (/429|rate.?limit/i.test(err))
      cls = "D. provider operational/billing defect (inspect body)";
    else if (
      e.structuralVerdict === "NON_COMPLIANT" ||
      e.presentationEligibility?.status === "REJECTED" ||
      e.productCompletionBlocked
    ) {
      cls =
        e.rrcReachedProviderWire && e.ocrExecuted
          ? "E. provider instruction-adherence defect"
          : e.ocrExecuted === false
            ? "F. OCR/structural verification defect"
            : "E. provider instruction-adherence defect";
    } else if (e.canonicalCompletion && e.presentationEligibility?.status === "AVAILABLE")
      cls = "PASS — leaf completed with independent acceptance";
    else if (e.providerResponseStatus === "failed")
      cls = "D. provider operational/billing defect";
    classifications[k] = cls;
  }
  report.classifications = classifications;
  write("07_classifications.json", classifications);

  const fanoutVsFailover = {
    allLeavesMarkedFanout: keys.every((k) => leafEvidence[k]?.generationFanoutLeaf === true),
    allFailoverChainsEmpty: keys.every((k) => {
      const c = leafEvidence[k]?.imageFailoverChain;
      return Array.isArray(c) && c.length === 0;
    }),
    independentExecutionIds:
      new Set(keys.map((k) => leafEvidence[k]?.leafExecutionId)).size === 3,
    noCrossLeafFallback: keys.every((k) => !leafEvidence[k]?.fallbackUsed),
  };
  report.fanoutVsFailover = fanoutVsFailover;
  write("08_fanout_vs_failover.json", fanoutVsFailover);

  const frameworkDefect =
    !fanoutVsFailover.allLeavesMarkedFanout ||
    !fanoutVsFailover.allFailoverChainsEmpty ||
    !fanoutVsFailover.independentExecutionIds ||
    !fanoutVsFailover.noCrossLeafFallback ||
    compareFields.some((f) => !comparison[f].identical) ||
    keys.some((k) =>
      /^(A|B|C|F|G|H|I|J)\./.test(classifications[k] || ""),
    );

  report.threeModelFanoutValidated =
    fanoutVsFailover.allLeavesMarkedFanout &&
    fanoutVsFailover.independentExecutionIds &&
    fanoutVsFailover.noCrossLeafFallback &&
    keys.every((k) => leafEvidence[k]?.providerExecuted);

  if (frameworkDefect) report.verdict = "FAIL — FRAMEWORK DEFECT";
  else report.verdict = "PASS WITH PROVIDER QUALITY/OPERATIONAL ISSUE";

  const availableCount = keys.filter(
    (k) => leafEvidence[k]?.presentationEligibility?.status === "AVAILABLE",
  ).length;
  report.uiProjection = {
    availableCreatives: availableCount,
    note: "UI must show only AVAILABLE leaves; REJECTED/FAILED must not surface raw art_* as creatives",
    perLeaf: Object.fromEntries(
      keys.map((k) => [
        k,
        {
          presentation: leafEvidence[k]?.presentationEligibility?.status,
          rawMedia: leafEvidence[k]?.rawMediaArtifactIds,
          canonicalAV: leafEvidence[k]?.artifactVersions,
        },
      ]),
    ),
  };

  report.endedAt = new Date().toISOString();
  write("REPORT.json", report);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  step("FINAL_VERDICT", {
    verdict: report.verdict,
    classifications,
    threeModelFanoutValidated: report.threeModelFanoutValidated,
    availableCreatives: availableCount,
  });
  console.log("\nEVIDENCE TABLE:");
  for (const row of table.rows) {
    console.log(row.map((c) => String(c ?? "")).join(" | "));
  }
}

main().catch((e) => {
  console.error("RESUME E2E FAILED", e);
  report.error = String(e?.stack || e);
  write("REPORT.json", report);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.exit(1);
});
