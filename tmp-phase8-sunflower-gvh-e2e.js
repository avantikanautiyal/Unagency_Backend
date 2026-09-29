/**
 * Controlled Sunflower E2E — G vs H diagnosis only.
 * No product-code changes. Captures composition + brand reference + image for pixel assessment.
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
const LOG = "/tmp/phase8-sunflower-gvh-backend.log";
const OUT = "/tmp/phase8-sunflower-gvh-report.json";
const EV = "/tmp/phase8_sunflower_gvh_evidence";

const RAW_INSTRUCTION =
  "I want to create an instagram post about my brand. It is an introductory post hence it should be able to describe the brand properly and should be aesthetically good looking and must follow the colour scheme it has been following until now";

const SUNFLOWER = {
  brandId: "6a98c471613dce5f8e5b8b9f",
  brandName: "Sunflower",
  logoAssetId: "6a98cb217bc20263f64311aa",
};

const EMAIL =
  process.env.PHASE8_E2E_EMAIL ||
  process.env.SUNFLOWER_E2E_EMAIL ||
  "avantika.mcs22.du@gmail.com";
const PASSWORD =
  process.env.PHASE8_E2E_PASSWORD || process.env.SUNFLOWER_E2E_PASSWORD;

const report = {
  purpose: "phase8_sunflower_g_vs_h",
  startedAt: new Date().toISOString(),
  steps: [],
  evidence: {},
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

/** Dev/diagnostic auth: mint ID token via Admin SDK (no user password). */
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
async function pollExecution(token, eid, maxPolls = 140) {
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
  }
  return { status: "timeout", ex: null };
}
async function mongoRoutes(sessionId) {
  const client = new MongoClient(process.env.DB_URI, {
    serverSelectionTimeoutMS: 30000,
  });
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
    return { arts, vers };
  } finally {
    await client.close();
  }
}
async function loadJob(executionId) {
  const client = new MongoClient(process.env.DB_URI, {
    serverSelectionTimeoutMS: 30000,
  });
  await client.connect();
  try {
    const db = client.db();
    const job = await db.collection("enterprise_jobs").findOne({
      $or: [
        { "payload.metadata.cdfSessionId": { $exists: true }, jobId: { $regex: executionId.slice(-10) } },
        { "payload.correlationId": { $regex: executionId.replace("exec_", "") } },
      ],
    });
    // Prefer direct match via executions → jobId
    const ex = await db
      .collection("enterprise_executions")
      .findOne({ executionId });
    let job2 = null;
    if (ex?.jobId) {
      job2 = await db.collection("enterprise_jobs").findOne({ jobId: ex.jobId });
    }
    return { execution: ex, job: job2 || job };
  } finally {
    await client.close();
  }
}

async function main() {
  ensureDir();
  step("auth_mode", {
    email: EMAIL,
    mode: PASSWORD ? "password" : "firebase_admin_custom_token",
  });

  step("restart_backend", { reason: "ensure Phase 8 code loaded" });
  await killBackend();
  const pid = startBackend();
  step("backend_spawned", { pid });
  if (!(await waitReady())) throw new Error("backend not ready");

  const token = await firebaseToken(EMAIL, PASSWORD);
  const me = unwrap((await http("GET", "/v1/me", { token })).json);
  const orgId = me?.currentOrganizationId || me?.organizationId;
  step("auth", {
    email: me?.user?.email || me?.email || EMAIL,
    orgId,
    brandId: SUNFLOWER.brandId,
  });

  // Confirm brand accessible (legacy routes are /brands, not /v1/brands)
  let brandOk = false;
  try {
    const br = await http("GET", `/brands/${SUNFLOWER.brandId}`, { token });
    const body = unwrap(br.json);
    brandOk = br.status < 400 && !!body;
    write("00_brand_get.json", {
      status: br.status,
      id: body?.id || body?._id,
      name: body?.name,
      logoAssetId: body?.logoAssetId || body?.logo?.assetId,
      colors: body?.colors,
      positioning: body?.positioning,
    });
  } catch (e) {
    write("00_brand_get_error.json", { error: String(e) });
  }
  if (!brandOk) {
    const list = await http("GET", "/brands", { token });
    const arr = unwrap(list.json);
    const items = Array.isArray(arr) ? arr : arr?.brands || arr?.items || [];
    const hit = items.find(
      (b) =>
        String(b._id || b.id || b.brandId) === SUNFLOWER.brandId ||
        /sunflower/i.test(String(b.name || "")),
    );
    write("00_brand_list_hit.json", hit
      ? { id: hit.id || hit._id, name: hit.name, logoAssetId: hit.logoAssetId }
      : { count: items.length });
    if (!hit) throw new Error("Sunflower brand not accessible under this account");
  }

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
  report.evidence.sessionId = sid;
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
  step("platform_format", {
    phaseId: session.phaseId,
    platform: session.masters?.platform,
    format: session.masters?.format,
  });

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
    logoAssetId: SUNFLOWER.logoAssetId,
    brandLogoAssetId: SUNFLOWER.logoAssetId,
    vaultAssetIds: [SUNFLOWER.logoAssetId],
  };

  // ROUTES
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
  step("routes_create", { status: r.status, eid: routesEid });
  if (!routesEid) throw new Error("routes create failed");
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

  const selectIndex = Math.min(2, Math.max(0, routesPayload.length - 1));
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
  write("02_selected_route.json", {
    pin: selected,
    routeIndex: selectIndex,
    route: selectedRouteObject,
  });
  step("select_route", {
    selected,
    routeName: selectedRouteObject?.name,
    routeIndex: selectIndex,
  });

  // OUTPUT
  r = await http("POST", "/v1/executions", {
    token,
    timeoutMs: 120000,
    body: {
      prompt: `${RAW_INSTRUCTION}\n\nGenerate the final Instagram feed post creative for the selected direction.`,
      capabilityId: "image.generate",
      organizationId: orgId,
      metadata: {
        ...baseMeta,
        cdfSessionId: sid,
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfArtifactKey: "social-media.output",
        cdfExecutionStrategy: "canonical",
        cdfGenerator: "image",
        cdfSemanticRole: "visual",
      },
    },
  });
  ex = unwrap(r.json);
  const outEid = ex?.executionId || ex?.id;
  step("output_create", { status: r.status, eid: outEid });
  if (!outEid) throw new Error(`output create failed: ${JSON.stringify(r.json)}`);

  let outPolled = { status: ex?.status, ex };
  if (!["succeeded", "failed", "completed", "error"].includes(outPolled.status)) {
    outPolled = await pollExecution(token, outEid, 160);
  }
  step("output_result", {
    status: outPolled.status,
    err: outPolled.ex?.errorMessage,
  });

  const pack = await loadJob(outEid);
  const job = pack.job;
  const meta = job?.payload?.metadata || {};
  write("03_job_meta_slim.json", {
    jobId: job?.jobId,
    sectionsPresent: meta.cdfCanonicalSectionsPresent,
    selectedDirectionIdentity: meta.cdfSelectedDirectionIdentity,
    selectedDirectionSemanticFields: meta.cdfSelectedDirectionSemanticFields,
    brandId: meta.cdfSelectedBrandId || meta.brandId,
    brandName: meta.cdfSelectedCanonicalBrandName || meta.canonicalBrandName,
    brandFactKeys: meta.cdfBrandFactKeys,
    logoAssetId: meta.logoAssetId || meta.brandLogoAssetId,
    providerIntentDiagnostics: meta.cdfProviderIntentDiagnostics,
    multimodal: {
      applied: meta.cdfMultimodalContextApplied,
      itemCount: meta.cdfMultimodalItemCount,
      imageCount: meta.cdfMultimodalImageCount,
    },
  });

  const cmr = meta.canonicalModelRequest;
  if (!cmr) throw new Error("canonicalModelRequest missing from job metadata");
  write("04_cmr.json", cmr);
  const parts = (cmr.messages || []).flatMap((m) => m.content || []);
  const dc = parts.find((p) => p.name === "deliverable_composition");
  const brandCtx = parts.find((p) => p.name === "brand_context");
  const mm = parts.find((p) => p.name === "multimodal_context");
  write("05_deliverable_composition.json", dc);
  write("06_brand_context.json", brandCtx);
  write("07_multimodal_context.json", mm);

  // Flatten from stored CMR (= provider-bound semantic content)
  write("04b_cmr_for_flatten.json", cmr);
  const { execSync } = require("child_process");
  const flat = execSync(
    `npx --yes tsx -e "import { flattenCanonicalModelRequestToLabeledPrompt } from './src/platform/ai/canonical-model-request/flatten-labeled'; import fs from 'fs'; const cmr=JSON.parse(fs.readFileSync('${EV}/04b_cmr_for_flatten.json','utf8')); process.stdout.write(flattenCanonicalModelRequestToLabeledPrompt(cmr));"`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 30_000_000 },
  );
  write("08_provider_flat_prompt.txt", flat);

  // Reference role extraction from multimodal + flat
  const mmItems = mm?.data?.items || [];
  const refTrace = {
    logoAssetId: SUNFLOWER.logoAssetId,
    multimodalItems: mmItems.map((it) => ({
      assetId: it.assetId,
      semanticReferenceRole: it.semanticReferenceRole,
      referenceRoleResolutionSource: it.referenceRoleResolutionSource,
      relationshipLabel: it.relationshipLabel,
      hasVisualProviderRef: it.hasVisualProviderRef,
      deliveryStatus: it.deliveryStatus,
      modality: it.modality,
    })),
    flatReferenceSnippets: (flat.match(/semanticReferenceRole:\s*\S+/g) || []).slice(
      0,
      10,
    ),
    flatHasIdentityMark: /identity_mark|IDENTITY.?MARK/i.test(flat),
    multimodalSection: flat.includes("MULTIMODAL CONTEXT")
      ? flat.slice(
          flat.indexOf("MULTIMODAL CONTEXT"),
          flat.indexOf("MULTIMODAL CONTEXT") + 1200,
        )
      : null,
  };
  write("09_reference_trace.json", refTrace);

  // Provider wire from logs
  const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
  const wireHits = [];
  for (const line of log.split("\n")) {
    if (
      line.includes(outEid) &&
      (line.includes("provider_wire") ||
        line.includes("provider_boundary") ||
        line.includes("ideogram") ||
        line.includes("character_reference") ||
        line.includes("style_reference") ||
        line.includes("identity"))
    ) {
      wireHits.push(line.slice(0, 3000));
    }
  }
  write("10_wire_log_hits.json", wireHits.slice(-20));

  // Session output AV
  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, { token });
  session = unwrap(r.json)?.session ?? session;
  const outputGen = pin(
    (session.generatedArtifacts || []).find(
      (x) => x.artifactKey === "social-media.output",
    ),
  );
  write("11_output_artifact.json", {
    outputGen,
    status: outPolled.status,
    artifactIds: pack.execution?.artifactIds || outPolled.ex?.artifactIds,
    provider: pack.execution?.result?.provider || meta.actualProviderId,
    model: pack.execution?.result?.model || meta.actualModelId,
  });

  // Registry contract snapshot
  const contractOut = execSync(
    `npx --yes tsx -e "import { resolveCdfPhaseExecutionContract } from './src/platform/cdf/canonical'; const e=resolveCdfPhaseExecutionContract({serviceId:'social-media',phaseId:'output'}); console.log(JSON.stringify({deliverableKind:e?.deliverableKind,contract:e?.deliverableComposition}))"`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 5_000_000 },
  );
  const contractLine = contractOut
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .pop();
  write("12_registry_contract.json", JSON.parse(contractLine));

  // Capture image via API if possible
  const artId = (pack.execution?.artifactIds || outPolled.ex?.artifactIds || [])[0];
  let imageSaved = false;
  if (artId) {
    for (const p of [
      `/v1/artifacts/${artId}/download`,
      `/v1/artifacts/${artId}/content`,
      `/v1/media/${artId}`,
      `/v1/executions/${outEid}/artifacts/${artId}`,
    ]) {
      try {
        const rr = await fetch(`${API}${p}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const ct = rr.headers.get("content-type") || "";
        step("image_fetch_try", { path: p, status: rr.status, ct });
        if (rr.ok && ct.includes("image")) {
          const buf = Buffer.from(await rr.arrayBuffer());
          write("13_output.png", ""); // placeholder path via binary write below
          fs.writeFileSync(path.join(EV, "13_output.png"), buf);
          imageSaved = true;
          break;
        }
        if (rr.ok && ct.includes("json")) {
          const j = await rr.json();
          write(`13_fetch_${p.replace(/\W+/g, "_")}.json`, j);
          const uri =
            j?.data?.url ||
            j?.data?.downloadUrl ||
            j?.url ||
            j?.downloadUrl ||
            j?.data?.mediaUri;
          if (uri && /^https?:/.test(uri)) {
            const img = await fetch(uri);
            if (img.ok) {
              const buf = Buffer.from(await img.arrayBuffer());
              fs.writeFileSync(path.join(EV, "13_output.png"), buf);
              imageSaved = true;
              break;
            }
          }
        }
      } catch (e) {
        step("image_fetch_error", { path: p, error: String(e.message || e) });
      }
    }
  }

  // Governance from logs
  const gov = [];
  for (const line of log.split("\n")) {
    if (line.includes(outEid) && /QUALITY|governance|PRODUCTION-EVIDENCE|quality=/i.test(line)) {
      gov.push(line.slice(0, 500));
    }
  }
  write("14_governance_log.json", gov.slice(-15));

  report.evidence = {
    sessionId: sid,
    routesArtifact: routesGen,
    selected: `${selected?.artifactId}@${selected?.version}#routes[${selectIndex}]`,
    outputExecutionId: outEid,
    outputArtifact: outputGen,
    imageSaved,
    compositionMode: dc?.data?.communicationMode,
    primarySlot: (dc?.data?.filledSlots || []).find(
      (s) => s.element === "primary_message_surface",
    ),
    brandFactKeys: meta.cdfBrandFactKeys,
    brandId: meta.cdfSelectedBrandId || meta.brandId,
    brandName: meta.cdfSelectedCanonicalBrandName || meta.canonicalBrandName,
    logoAssetId: SUNFLOWER.logoAssetId,
    referenceRoles: refTrace.multimodalItems.map((i) => i.semanticReferenceRole),
    flatLen: flat.length,
    hasDeliverableComposition: flat.includes("DELIVERABLE COMPOSITION"),
    sectionsPresent: meta.cdfCanonicalSectionsPresent,
  };
  report.finishedAt = new Date().toISOString();
  write("99_capture_summary.json", report);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("\n========== SUNFLOWER CAPTURE DONE ==========");
  console.log(JSON.stringify(report.evidence, null, 2));
  console.log("Evidence:", EV);
}

main().catch((e) => {
  console.error(e);
  report.fatal = String(e && e.stack ? e.stack : e);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.exit(1);
});
