/**
 * Phase 8 live validation — Deliverable Composition Contract must reach provider.
 * Evidence-only. Restarts backend so Phase 8 source is loaded. Does not patch product code.
 *
 * Flow: session → brief → Instagram Feed Post → routes → select → output image
 * Brand: Sunflower (user's prior live brand) when reachable; else BloomSip demo fallback.
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
const LOG = "/tmp/phase8-composition-e2e-backend.log";
const OUT = "/tmp/phase8-composition-e2e-report.json";
const EVIDENCE_DIR = "/tmp/phase8_composition_evidence";

const RAW_INSTRUCTION =
  "I want to create an instagram post about my brand. It is an introductory post hence it should be able to describe the brand properly and should be aesthetically good looking and must follow the colour scheme it has been following until now";

const SUNFLOWER = {
  brandId: "6a98c471613dce5f8e5b8b9f",
  brandName: "Sunflower",
  logoAssetId: "6a98cb217bc20263f64311aa",
};
const BLOOMSIP = {
  brandId: "6aa6e05525cbda7ee6aed864",
  brandName: "BloomSip",
  logoAssetId: null,
};

const report = {
  startedAt: new Date().toISOString(),
  purpose: "phase8_deliverable_composition_live_validation",
  boundaries: {},
  steps: [],
  evidence: {},
  firstDivergence: null,
  verdict: null,
};

function ensureDir() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}
function step(name, data) {
  report.steps.push({ name, at: new Date().toISOString(), ...data });
  console.log("\n===", name, "===");
  console.log(JSON.stringify(data, null, 2));
}
function boundary(name, pass, evidence) {
  report.boundaries[name] = { pass: !!pass, evidence };
  console.log(`\n### BOUNDARY ${name}: ${pass ? "PASS" : "FAIL"}`);
  console.log(JSON.stringify(evidence, null, 2));
  if (!pass && !report.firstDivergence) {
    report.firstDivergence = { boundary: name, evidence };
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function unwrap(json) {
  return json?.data != null ? json.data : json;
}
function writeEvidence(name, value) {
  ensureDir();
  const p = path.join(EVIDENCE_DIR, name);
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  fs.writeFileSync(p, text);
  return p;
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
async function firebaseToken(email, password) {
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
        email,
        password,
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
function scanLogs(patterns, limit = 80) {
  if (!fs.existsSync(LOG)) return [];
  const lines = fs.readFileSync(LOG, "utf8").split("\n");
  const out = [];
  for (const line of lines) {
    if (patterns.some((p) => p.test(line))) out.push(line.slice(0, 4000));
  }
  return out.slice(-limit);
}
function extractJsonLines(patterns) {
  const hits = [];
  if (!fs.existsSync(LOG)) return hits;
  for (const line of fs.readFileSync(LOG, "utf8").split("\n")) {
    if (!patterns.some((p) => p.test(line))) continue;
    const i = line.indexOf("{");
    if (i < 0) continue;
    try {
      hits.push(JSON.parse(line.slice(i)));
    } catch {}
  }
  return hits;
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
async function loadJobPayload(executionId) {
  const client = new MongoClient(process.env.DB_URI, {
    serverSelectionTimeoutMS: 30000,
  });
  await client.connect();
  try {
    const db = client.db();
    const collections = [
      "direct_execution_jobs",
      "enterprise_direct_jobs",
      "jobs",
      "execution_jobs",
    ];
    for (const col of collections) {
      try {
        const job = await db.collection(col).findOne({
          $or: [
            { executionId },
            { "payload.executionId": executionId },
            { requestId: executionId },
            { correlationId: executionId },
          ],
        });
        if (job) {
          return { collection: col, job };
        }
      } catch {}
    }
    // fallback: search provider ops
    const op = await db.collection("enterprise_provider_operations").findOne({
      $or: [{ executionId }, { requestId: executionId }],
    });
    return { collection: null, job: null, providerOp: op };
  } finally {
    await client.close();
  }
}
async function mongoArtifactEvidence(sessionId) {
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
        dataKeys:
          v.data && typeof v.data === "object"
            ? Object.keys(v.data).slice(0, 20)
            : [],
        routeCount: Array.isArray(v.data?.routes) ? v.data.routes.length : null,
        selectedRouteId: v.data?.selectedRouteId,
        routes: Array.isArray(v.data?.routes) ? v.data.routes : undefined,
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

function findCmrPart(cmr, name) {
  if (!cmr?.messages) return null;
  for (const m of cmr.messages) {
    for (const p of m.content || []) {
      if (p.type === "structured" && p.name === name) return p;
    }
  }
  return null;
}

function flattenHas(flat, needle) {
  return typeof flat === "string" && flat.includes(needle);
}

async function main() {
  ensureDir();
  step("restart_backend", {
    reason: "ensure Phase 8 DeliverableCompositionContract is loaded",
  });
  await killBackend();
  const pid = startBackend();
  step("backend_spawned", { pid, log: LOG });
  if (!(await waitReady())) throw new Error("backend not ready");

  // Prefer demo account (known working). Brand: try Sunflower under that org via list; else BloomSip.
  let token = await firebaseToken("demo@unagency.test", "DemoPass123!");
  let me = unwrap((await http("GET", "/v1/me", { token })).json);
  let orgId = me?.currentOrganizationId || me?.organizationId;
  step("auth", {
    email: me?.user?.email || me?.email,
    orgId,
  });

  // Resolve brand: prefer Sunflower if accessible under this org.
  let brand = BLOOMSIP;
  try {
    const brandsRes = await http("GET", "/v1/brands", { token });
    const list = unwrap(brandsRes.json);
    const arr = Array.isArray(list) ? list : list?.brands || list?.items || [];
    const sunflower = arr.find(
      (b) =>
        String(b._id || b.id || b.brandId) === SUNFLOWER.brandId ||
        /sunflower/i.test(String(b.name || b.brandName || "")),
    );
    if (sunflower) {
      brand = {
        brandId: String(sunflower._id || sunflower.id || sunflower.brandId),
        brandName: sunflower.name || sunflower.brandName || "Sunflower",
        logoAssetId:
          sunflower.logoAssetId ||
          sunflower.brandLogoAssetId ||
          SUNFLOWER.logoAssetId,
      };
    }
  } catch (e) {
    step("brand_list_fallback", { error: String(e) });
  }

  // Optional: switch to Sunflower owner account when credentials are provided.
  const altEmail = process.env.PHASE8_E2E_EMAIL;
  const altPass = process.env.PHASE8_E2E_PASSWORD;
  if (brand.brandName !== "Sunflower" && altEmail && altPass) {
    token = await firebaseToken(altEmail, altPass);
    me = unwrap((await http("GET", "/v1/me", { token })).json);
    orgId = me?.currentOrganizationId || me?.organizationId;
    brand = SUNFLOWER;
    step("auth_switched_to_sunflower_account", {
      email: altEmail,
      orgId,
      brand,
    });
  }

  report.evidence.brand = brand;
  step("brand_selected", brand);

  // Registry contract via tsx (same module backend live process loads after restart)
  let registryContract = null;
  {
    const { execSync } = require("child_process");
    const out = execSync(
      `npx --yes tsx -e "import { resolveCdfPhaseExecutionContract } from './src/platform/cdf/canonical'; const e=resolveCdfPhaseExecutionContract({serviceId:'social-media',phaseId:'output'}); console.log(JSON.stringify({deliverableKind:e?.deliverableKind,requiresDeliverableComposition:e?.requiresDeliverableComposition,contract:e?.deliverableComposition}))"`,
      { cwd: ROOT, encoding: "utf8", maxBuffer: 5_000_000 },
    );
    const line = out
      .trim()
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    registryContract = JSON.parse(line);
  }
  writeEvidence("01_registry_contract.json", registryContract);
  boundary(
    "REGISTRY_COMPOSITION",
    registryContract?.deliverableKind === "social_creative" &&
      registryContract?.contract?.communicationMode ===
        "single_frame_communication" &&
      Array.isArray(registryContract?.contract?.requiredElements) &&
      registryContract.contract.requiredElements.includes(
        "primary_message_surface",
      ),
    registryContract,
  );

  let r = await http("POST", "/v1/cdf/sessions", {
    token,
    body: {
      serviceId: "social-media",
      productMode: "ai",
      brandId: brand.brandId,
    },
  });
  let session = unwrap(r.json)?.session;
  if (!session?.sessionId) {
    throw new Error(`session create failed: ${JSON.stringify(r.json)}`);
  }
  const sid = session.sessionId;
  report.evidence.sessionId = sid;
  step("session_start", { sid, phaseId: session.phaseId });

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
  step("submit_brief", {
    phaseId: session.phaseId,
    sessionVersion: session.sessionVersion,
  });

  // Platform / Format — Instagram Feed Post
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
    brandId: brand.brandId,
    brandName: brand.brandName,
    canonicalBrandName: brand.brandName,
    brandConfirmed: true,
    conversationalCurrentUserInstruction: RAW_INSTRUCTION,
    ...(brand.logoAssetId
      ? {
          logoAssetId: brand.logoAssetId,
          brandLogoAssetId: brand.logoAssetId,
          vaultAssetIds: [brand.logoAssetId],
        }
      : {}),
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
  let routesEid = ex?.executionId || ex?.id;
  step("routes_create", { httpStatus: r.status, eid: routesEid, status: ex?.status });
  if (!routesEid) throw new Error(`routes create failed: ${JSON.stringify(r.json)}`);

  let polled = { status: ex?.status, ex };
  if (!["succeeded", "failed", "completed", "error"].includes(polled.status)) {
    polled = await pollExecution(token, routesEid);
  }
  step("routes_result", {
    status: polled.status,
    err: polled.ex?.errorMessage,
  });
  if (polled.status !== "succeeded" && polled.status !== "completed") {
    throw new Error(`routes failed: ${polled.ex?.errorMessage || polled.status}`);
  }

  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, {
    token,
  });
  session = unwrap(r.json)?.session ?? session;
  const routesGen = pin(
    (session.generatedArtifacts || []).find(
      (x) => x.artifactKey === "social-media.routes",
    ),
  );
  report.evidence.routesArtifact = routesGen;
  const mongoRoutes = await mongoArtifactEvidence(sid);
  writeEvidence("02_routes_mongo.json", mongoRoutes);

  const routesVersion = mongoRoutes.versions.find(
    (v) =>
      v.artifactId === routesGen?.artifactId &&
      v.version === routesGen?.version,
  );
  const routesPayload = routesVersion?.routes || null;
  writeEvidence("03_routes_payload.json", {
    routesGen,
    routes: routesPayload,
  });

  boundary(
    "ROUTES_ARTIFACT",
    !!routesGen &&
      String(routesGen.artifactId).startsWith("cdfart_") &&
      Array.isArray(routesPayload) &&
      routesPayload.length === 3,
    { routesGen, routeCount: routesPayload?.length },
  );

  // SELECT route index 2 (same as prior Sunflower live that used routes[2])
  const selectIndex = Math.min(2, (routesPayload?.length || 1) - 1);
  const selectedRouteObject = routesPayload?.[selectIndex] || null;
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
  report.evidence.selectedRoute = {
    pin: selected,
    routeIndex: selectIndex,
    route: selectedRouteObject,
  };
  writeEvidence("04_selected_route.json", report.evidence.selectedRoute);
  step("select_route", {
    httpStatus: r.status,
    phaseId: session.phaseId,
    selected,
    routeName: selectedRouteObject?.name,
  });
  if (r.status >= 400) {
    throw new Error(`select failed: ${JSON.stringify(r.json)}`);
  }

  // OUTPUT image generation
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
  report.evidence.outputExecutionId = outEid;
  step("output_create", {
    httpStatus: r.status,
    eid: outEid,
    status: ex?.status,
    error: r.status >= 400 ? r.json : undefined,
  });
  if (!outEid) throw new Error(`output create failed: ${JSON.stringify(r.json)}`);

  let outPolled = { status: ex?.status, ex };
  if (!["succeeded", "failed", "completed", "error"].includes(outPolled.status)) {
    outPolled = await pollExecution(token, outEid, 140);
  }
  const outMeta = outPolled.ex?.metadata || ex?.metadata || {};
  writeEvidence("05_output_execution_meta.json", {
    status: outPolled.status,
    errorMessage: outPolled.ex?.errorMessage,
    sectionsPresent: outMeta.cdfCanonicalSectionsPresent,
    selectedDirectionPresent: outMeta.cdfSelectedDirectionPresent,
    selectedDirectionIdentity: outMeta.cdfSelectedDirectionIdentity,
    selectedDirectionSemanticFields: outMeta.cdfSelectedDirectionSemanticFields,
    brandFactKeys: outMeta.cdfBrandFactKeys,
    providerIntentDiagnostics: outMeta.cdfProviderIntentDiagnostics,
    canonicalContextApplied: outMeta.cdfCanonicalContextApplied,
    deliverableCompositionPresent:
      outMeta.cdfCanonicalSectionsPresent?.deliverableComposition,
  });

  // Extract CMR from metadata if present
  const cmr =
    outMeta.canonicalModelRequest ||
    outPolled.ex?.metadata?.canonicalModelRequest ||
    null;
  if (cmr) {
    writeEvidence("06_output_cmr.json", cmr);
  }

  // Job payload / raw prompt
  let jobPack = null;
  try {
    jobPack = await loadJobPayload(outEid);
    if (jobPack?.job) {
      const payload = jobPack.job.payload || jobPack.job;
      const rawPrompt =
        payload.rawPrompt ||
        payload.prompt ||
        payload.flattenedPrompt ||
        "";
      const jobMeta = payload.metadata || {};
      writeEvidence("07_job_meta_keys.json", {
        collection: jobPack.collection,
        metaKeys: Object.keys(jobMeta).slice(0, 80),
        hasCmr: Boolean(jobMeta.canonicalModelRequest),
        sectionsPresent: jobMeta.cdfCanonicalSectionsPresent,
        rawPromptLen: typeof rawPrompt === "string" ? rawPrompt.length : 0,
      });
      if (typeof rawPrompt === "string" && rawPrompt.length) {
        writeEvidence("08_provider_flat_prompt.txt", rawPrompt);
      }
      if (jobMeta.canonicalModelRequest) {
        writeEvidence("06b_job_cmr.json", jobMeta.canonicalModelRequest);
      }
    }
  } catch (e) {
    step("job_load_error", { error: String(e) });
  }

  // Log-based compiled / provider_boundary events
  const compiledEvents = extractJsonLines([
    /cdf\.generation_context\.compiled/,
    new RegExp(outEid),
  ]).filter(
    (j) =>
      j.event === "cdf.generation_context.compiled" &&
      (j.executionId === outEid ||
        String(j.cdfPhaseId || j.phaseId || "") === "output"),
  );
  const boundaryEvents = extractJsonLines([
    /cdf\.generation_context\.provider_boundary/,
  ]).filter((j) => j.executionId === outEid);
  writeEvidence("09_compiled_events.json", compiledEvents.slice(-3));
  writeEvidence("10_provider_boundary_events.json", boundaryEvents.slice(-3));

  // Prefer CMR from job or execution
  const liveCmr =
    (jobPack?.job?.payload?.metadata || {}).canonicalModelRequest ||
    cmr ||
    null;
  const compositionPart = liveCmr
    ? findCmrPart(liveCmr, "deliverable_composition")
    : null;
  const productionPart = liveCmr ? findCmrPart(liveCmr, "production_spec") : null;
  const ssdPart = liveCmr
    ? findCmrPart(liveCmr, "selected_semantic_directions")
    : null;
  writeEvidence("11_cmr_deliverable_composition.json", compositionPart);
  writeEvidence("12_cmr_production_spec_present.json", {
    present: !!productionPart,
    productionRuleId: productionPart?.schema || productionPart?.data?.productionRuleId,
  });
  writeEvidence("13_cmr_selected_semantic_directions.json", ssdPart);

  // Flatten if we have CMR but no raw prompt
  let flat = null;
  try {
    const flatPath = path.join(EVIDENCE_DIR, "08_provider_flat_prompt.txt");
    if (fs.existsSync(flatPath)) {
      flat = fs.readFileSync(flatPath, "utf8");
    } else if (liveCmr) {
      writeEvidence("06c_cmr_for_flatten.json", liveCmr);
      const { execSync } = require("child_process");
      flat = execSync(
        `npx --yes tsx -e "import { flattenCanonicalModelRequestToLabeledPrompt } from './src/platform/ai/canonical-model-request/flatten-labeled'; import fs from 'fs'; const cmr=JSON.parse(fs.readFileSync('${EVIDENCE_DIR}/06c_cmr_for_flatten.json','utf8')); process.stdout.write(flattenCanonicalModelRequestToLabeledPrompt(cmr));"`,
        { cwd: ROOT, encoding: "utf8", maxBuffer: 20_000_000 },
      );
      writeEvidence("08_provider_flat_prompt.txt", flat);
    }
  } catch (e) {
    step("flatten_error", { error: String(e) });
  }

  const sections =
    outMeta.cdfCanonicalSectionsPresent ||
    compiledEvents.slice(-1)[0]?.sectionsPresent ||
    {};

  const compositionReachPass =
    sections.deliverableComposition === true &&
    !!compositionPart &&
    compositionPart.data?.communicationMode === "single_frame_communication" &&
    Array.isArray(compositionPart.data?.requiredElements) &&
    compositionPart.data.requiredElements.includes("primary_message_surface") &&
    flattenHas(flat, "DELIVERABLE COMPOSITION") &&
    flattenHas(flat, "single_frame_communication") &&
    flattenHas(flat, "primary_message_surface");

  // Slot population quality
  const slots = compositionPart?.data?.filledSlots || [];
  const primarySlot = slots.find((s) => s.element === "primary_message_surface");
  const visualSlot = slots.find((s) => s.element === "visual_subject");
  const brandSlot = slots.find(
    (s) => s.element === "brand_signature" || s.element === "identity_mark",
  );
  const userSlot = slots.find((s) => s.source === "user_instruction");

  boundary("COMPOSITION_IN_CMR_AND_PROVIDER", compositionReachPass, {
    sectionsDeliverableComposition: sections.deliverableComposition,
    communicationMode: compositionPart?.data?.communicationMode,
    requiredElements: compositionPart?.data?.requiredElements,
    flatHasDeliverableComposition: flattenHas(flat, "DELIVERABLE COMPOSITION"),
    flatHasMode: flattenHas(flat, "single_frame_communication"),
    flatHasPrimary: flattenHas(flat, "primary_message_surface"),
    productionSpecSeparate:
      sections.productionSpec === true &&
      flattenHas(flat, "PRODUCTION SPEC") &&
      !String(compositionPart?.data?.policies?.text || "").includes("1080"),
  });

  boundary(
    "SELECTED_ROUTE_FILLS_SLOTS",
    !!primarySlot?.value &&
      primarySlot.source === "creative_direction" &&
      !!visualSlot?.value &&
      !!userSlot?.value &&
      /introductory|instagram|colour|color|brand/i.test(userSlot.value),
    {
      primarySlot,
      visualSlot,
      brandSlot,
      userSlotPreview: userSlot?.value?.slice(0, 200),
      selectedDirectionIdentity: outMeta.cdfSelectedDirectionIdentity,
      selectedDirectionSemanticFields: outMeta.cdfSelectedDirectionSemanticFields,
      selectedRouteExactPin: selected,
      selectedRouteObject: selectedRouteObject
        ? {
            routeId: selectedRouteObject.routeId,
            name: selectedRouteObject.name,
            creativeIdea: selectedRouteObject.creativeIdea,
            primaryMessage: selectedRouteObject.primaryMessage,
            visualConcept: selectedRouteObject.visualConcept,
            hierarchy: selectedRouteObject.hierarchy,
            brandIntegration: selectedRouteObject.brandIntegration,
            identityMarkRole: selectedRouteObject.identityMarkRole,
          }
        : null,
    },
  );

  // Layers remain separate
  boundary(
    "LAYER_SEPARATION",
    sections.currentUserInstruction === true &&
      sections.selectedSemanticDirections === true &&
      sections.deliverableComposition === true &&
      sections.brandContext === true &&
      (sections.productionSpec === true || !!productionPart) &&
      sections.outputContract === true,
    { sections },
  );

  // Reference role from multimodal / meta
  const refEvidence = {
    logoAssetId: brand.logoAssetId || outMeta.logoAssetId || outMeta.brandLogoAssetId,
    semanticReferenceRole:
      outMeta.cdfProviderIntentDiagnostics?.referenceRole ||
      outMeta.semanticReferenceRole ||
      null,
    multimodalNotes: flat
      ? (flat.match(/semanticReferenceRole:\s*\S+/g) || []).slice(0, 5)
      : [],
    multimodalSection: flat
      ? (flat.includes("MULTIMODAL CONTEXT")
          ? flat.slice(
              flat.indexOf("MULTIMODAL CONTEXT"),
              flat.indexOf("MULTIMODAL CONTEXT") + 800,
            )
          : null)
      : null,
  };
  writeEvidence("14_reference_evidence.json", refEvidence);

  // Canonical output artifact
  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, {
    token,
  });
  session = unwrap(r.json)?.session ?? session;
  const outputGen = pin(
    (session.generatedArtifacts || []).find(
      (x) => x.artifactKey === "social-media.output",
    ),
  );
  const mongoOut = await mongoArtifactEvidence(sid);
  writeEvidence("15_output_artifact.json", { outputGen, mongoOut });

  const imageSucceeded =
    outPolled.status === "succeeded" || outPolled.status === "completed";
  const m9cPass =
    !!outputGen &&
    String(outputGen.artifactId || "").startsWith("cdfart_") &&
    outputGen.artifactKey === "social-media.output";

  boundary("CANONICAL_OUTPUT_M9C", imageSucceeded && m9cPass, {
    status: outPolled.status,
    errorMessage: outPolled.ex?.errorMessage,
    outputGen,
    exactGenerated: outputGen
      ? `${outputGen.artifactId}@${outputGen.version}`
      : null,
  });

  // Download / refresh — re-GET session should not create new AV
  const beforeVersion = outputGen?.version;
  r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, {
    token,
  });
  const session2 = unwrap(r.json)?.session ?? session;
  const outputGen2 = pin(
    (session2.generatedArtifacts || []).find(
      (x) => x.artifactKey === "social-media.output",
    ),
  );
  boundary(
    "REFRESH_NO_NEW_ARTIFACT",
    !!outputGen2 &&
      outputGen2.artifactId === outputGen?.artifactId &&
      outputGen2.version === beforeVersion,
    { before: outputGen, after: outputGen2 },
  );

  // Structural vs model quality — without image bytes we use provider result meta + composition presence
  const structuralSemantic = {
    compositionReachedProvider: compositionReachPass,
    primaryMessageSurfaceFilled: Boolean(primarySlot?.value),
    visualSubjectFilled: Boolean(visualSlot?.value),
    brandSignatureFilled: Boolean(brandSlot?.value),
    hierarchyDefined: Array.isArray(compositionPart?.data?.hierarchy) &&
      compositionPart.data.hierarchy.length > 0,
    textPolicyOnAssetRequired:
      compositionPart?.data?.policies?.text?.placement === "on_asset" &&
      compositionPart?.data?.policies?.text?.required === true,
    note:
      "Structural semantic PASS means the framework delivered the contract. Image visual inspection is separate.",
  };
  const modelQuality = {
    executionStatus: outPolled.status,
    governanceQuality: outMeta.quality ?? outMeta.productionQuality ?? null,
    note:
      "Model quality is independent of structural composition delivery. Inspect generated image artifact for communication-asset behavior.",
  };
  writeEvidence("16_structural_vs_model.json", {
    structuralSemantic,
    modelQuality,
  });

  // First divergence table
  const table = [
    {
      boundary: "Registry",
      expected: "social_creative composition contract",
      actual: registryContract?.deliverableKind,
      ok: registryContract?.deliverableKind === "social_creative",
    },
    {
      boundary: "Route",
      expected: "exact X@V selected with actionable fields",
      actual: selected
        ? `${selected.artifactId}@${selected.version}#routes[${selectIndex}]`
        : null,
      ok: !!selected && !!selectedRouteObject,
    },
    {
      boundary: "Compiler",
      expected: "filled composition slots from route",
      actual: {
        primary: primarySlot?.value?.slice(0, 80),
        visual: visualSlot?.value?.slice(0, 80),
      },
      ok: !!primarySlot && !!visualSlot,
    },
    {
      boundary: "CMR",
      expected: "structured deliverable_composition",
      actual: compositionPart?.data?.communicationMode || null,
      ok: !!compositionPart,
    },
    {
      boundary: "Flatten",
      expected: "DELIVERABLE COMPOSITION labeled section",
      actual: flattenHas(flat, "DELIVERABLE COMPOSITION"),
      ok: flattenHas(flat, "DELIVERABLE COMPOSITION"),
    },
    {
      boundary: "Provider request",
      expected: "composition semantics in bound prompt",
      actual: {
        hasMode: flattenHas(flat, "single_frame_communication"),
        hasPrimary: flattenHas(flat, "primary_message_surface"),
      },
      ok:
        flattenHas(flat, "single_frame_communication") &&
        flattenHas(flat, "primary_message_surface"),
    },
    {
      boundary: "Provider result",
      expected: "canonical communication asset completed",
      actual: { status: outPolled.status, outputGen },
      ok: imageSucceeded && m9cPass,
    },
  ];
  writeEvidence("17_divergence_table.json", table);
  const firstFail = table.find((row) => !row.ok);
  report.firstDivergence = firstFail || null;

  // Final PASS criteria
  const pass =
    report.boundaries.REGISTRY_COMPOSITION?.pass &&
    report.boundaries.ROUTES_ARTIFACT?.pass &&
    report.boundaries.SELECTED_ROUTE_FILLS_SLOTS?.pass &&
    report.boundaries.COMPOSITION_IN_CMR_AND_PROVIDER?.pass &&
    report.boundaries.LAYER_SEPARATION?.pass &&
    report.boundaries.CANONICAL_OUTPUT_M9C?.pass &&
    report.boundaries.REFRESH_NO_NEW_ARTIFACT?.pass;

  report.verdict = pass ? "PASS" : "FAIL";
  report.finishedAt = new Date().toISOString();
  report.summary = {
    verdict: report.verdict,
    sessionId: sid,
    brand,
    routesArtifact: routesGen,
    selectedRoute: `${selected?.artifactId}@${selected?.version}#routes[${selectIndex}]`,
    outputExecutionId: outEid,
    outputArtifact: outputGen,
    compositionReachedProvider: compositionReachPass,
    firstDivergence: report.firstDivergence,
    boundaries: Object.fromEntries(
      Object.entries(report.boundaries).map(([k, v]) => [
        k,
        v.pass ? "PASS" : "FAIL",
      ]),
    ),
    evidenceDir: EVIDENCE_DIR,
  };

  console.log("\n========== PHASE 8 LIVE VALIDATION ==========");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("\nDIVERGENCE TABLE");
  console.log(JSON.stringify(table, null, 2));
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("Wrote", OUT);

  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  report.fatal = String(e && e.stack ? e.stack : e);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.exit(1);
});
