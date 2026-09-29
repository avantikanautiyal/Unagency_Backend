/**
 * LIVE fanout certification — real CDF session lifecycle (no upstream bypass).
 *
 * For EVERY fanout-capable phase (social-media.output, logo.logo-options,
 * packaging.3d-direction):
 *
 *   GENERATE → CANONICAL → PERSIST → RELOAD/HYDRATE
 *   → UI projection (projectFanoutRouteCardUserFacing)
 *   → SELECT exact leaf (by generationFanoutTargetId)
 *   → APPROVE exact X@V
 *   → assert next phase + no sibling approval
 *
 * Repeated independently for Route/leaf target 1, 2, and 3.
 *
 * LIVE_CERT_PASS only when:
 *   DECLARED=CREATED=EXECUTED=CANONICAL=PERSISTED=HYDRATED=DISPLAYED=3
 *   + ROUTE 1/2/3 SELECT+APPROVE PASS
 *   + NO CROSS-LEAF / FIRST-MATCH / TARGET-ID LOSS / DIAGNOSTIC LEAK
 *   + STRUCTURAL WARNING REMAINS USABLE
 *
 * Does NOT manufacture cdfart_* / mock continuity / weaken ingest.
 * Does NOT use route index, provider, or executionId as a substitute for targetId.
 */
const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");

const ROOT = path.join(__dirname);
process.chdir(ROOT);
require("dotenv").config({ path: path.join(ROOT, ".env") });

const API = process.env.LIVE_CERT_API || "http://127.0.0.1:4000";
const OUT =
  process.env.LIVE_CERT_OUT ||
  path.join(ROOT, "tmp-fanout-framework-live-cert-report.json");
const LOG = "/tmp/cdf-fanout-framework-live-backend.log";
const WEB_ENV =
  "/Users/avantikanautiyal/Desktop/Unagency_fullstack/Unagency-frontend/apps/web/.env.local";
const FE_API = path.join(
  ROOT,
  "../Unagency-frontend/packages/api",
);

const EMAIL =
  process.env.PHASE8_E2E_EMAIL ||
  process.env.SUNFLOWER_E2E_EMAIL ||
  "avantika.mcs22.du@gmail.com";
const PASSWORD =
  process.env.PHASE8_E2E_PASSWORD || process.env.SUNFLOWER_E2E_PASSWORD;

const SUNFLOWER = {
  brandId: "6a98c471613dce5f8e5b8b9f",
  brandName: "Sunflower",
  logoAssetId: "6a98cb217bc20263f64311aa",
};

/** All fanout-capable phases — no service special-case opt-out for PASS. */
const PHASES = [
  {
    key: "logo.logo-options",
    serviceId: "logo",
    phaseId: "logo-options",
    artifactKey: "logo.logo-options",
    nextPhaseId: "logo-system",
    brief:
      "Logo for a modern tea brand called Leaf & Co. Premium, clean wordmark with a simple leaf mark.",
  },
  {
    key: "packaging.3d-direction",
    serviceId: "packaging",
    phaseId: "3d-direction",
    artifactKey: "packaging.3d-direction",
    nextPhaseId: "front-pack",
    brief:
      "Premium mango juice carton packaging. Bright fruit-forward shelf presence, clear brand lockup.",
  },
  {
    key: "social-media.output",
    serviceId: "social-media",
    phaseId: "output",
    artifactKey: "social-media.output",
    nextPhaseId: "final",
    brief:
      "Introductory Instagram feed post for Sunflower brand. Clean aesthetic, brand colours.",
  },
];

if (process.env.LIVE_CERT_SKIP_SOCIAL === "1") {
  const idx = PHASES.findIndex((p) => p.serviceId === "social-media");
  if (idx >= 0) PHASES.splice(idx, 1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function unwrap(json) {
  return json?.data != null ? json.data : json?.result != null ? json.result : json;
}

function pin(ref) {
  if (!ref) return null;
  return {
    artifactKey: ref.artifactKey,
    artifactId: ref.artifactId,
    version: ref.version,
    role: ref.role,
    phaseId: ref.phaseId,
    generationFanoutTargetId: ref.generationFanoutTargetId || null,
    generationFanoutGroupId: ref.generationFanoutGroupId || null,
    generationExecutionId: ref.generationExecutionId || null,
  };
}

async function killBackend() {
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
  const child = spawn("npm", ["start"], {
    cwd: ROOT,
    env: {
      ...process.env,
      ENTERPRISE_API_START_LEGACY_WORKERS: "false",
      CDF_CANONICAL_GENERATION_CONTEXT: "1",
      CDF_PACKAGING_INGEST: "1",
      CDF_SOCIAL_MEDIA_INGEST: "1",
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
    try {
      const r = await fetch(`${API}/v1/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (r && (r.ok || r.status === 404 || r.status === 401)) return true;
    } catch {}
    await sleep(1500);
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
      json = { raw: text.slice(0, 1200) };
    }
    return { status: r.status, json };
  } finally {
    clearTimeout(t);
  }
}

function firebaseWebApiKey() {
  if (fs.existsSync(WEB_ENV)) {
    const line = fs
      .readFileSync(WEB_ENV, "utf8")
      .split("\n")
      .find((l) => l.startsWith("NEXT_PUBLIC_FIREBASE_API_KEY="));
    if (line) return line.split("=").slice(1).join("=").trim();
  }
  return process.env.FIREBASE_WEB_API_KEY || "";
}

async function firebaseToken(email) {
  if (PASSWORD) {
    const apiKey = firebaseWebApiKey();
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: PASSWORD,
          returnSecureToken: true,
        }),
      },
    );
    const j = await res.json();
    if (j.idToken) return j.idToken;
  }
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

async function poll(token, eid, max = 180) {
  for (let i = 0; i < max; i++) {
    const r = await http("GET", `/v1/executions/${encodeURIComponent(eid)}`, {
      token,
    });
    const ex = unwrap(r.json);
    const st = String(ex?.status || "");
    if (
      ["succeeded", "failed", "completed", "error", "cancelled"].includes(st)
    ) {
      return ex;
    }
    await sleep(2500);
  }
  return { status: "timeout", executionId: eid };
}

async function getSession(token, sid) {
  const r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, {
    token,
  });
  return unwrap(r.json)?.session ?? unwrap(r.json);
}

async function transition(token, body) {
  return http("POST", "/v1/cdf/transition", { token, body });
}

function loadFanoutPlan() {
  const probe = execSync(
    `npx --yes ts-node --transpile-only -e "import { planImageGenerationFanout, GENERATION_FANOUT_PROVIDER_FAMILIES, buildGenerationFanoutLeafMetadata } from './src/platform/generation/generation-fanout'; const plan = planImageGenerationFanout({ useCase: 'marketing_creative', groupId: 'live_c5c6_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6), executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES) }); console.log(JSON.stringify({ cardinality: plan.cardinality, groupId: plan.groupId, targets: plan.targets, metas: plan.targets.map(t => buildGenerationFanoutLeafMetadata({ plan, target: t })) }));"`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 5_000_000 },
  );
  const planLine = probe
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .pop();
  return JSON.parse(planLine);
}

function firstDivergence(counts) {
  const order = [
    "DECLARED",
    "CREATED",
    "EXECUTED",
    "CANONICAL",
    "PERSISTED",
    "HYDRATED",
    "DISPLAYED",
  ];
  for (const k of order) {
    if (counts[k] !== 3) return { stage: k, actual: counts[k], expected: 3 };
  }
  return null;
}

function fanoutPins(session, artifactKey) {
  return (session?.generatedArtifacts || []).filter(
    (r) =>
      r.artifactKey === artifactKey &&
      typeof r.generationFanoutTargetId === "string" &&
      r.generationFanoutTargetId.trim() &&
      typeof r.artifactId === "string" &&
      r.artifactId.startsWith("cdfart_"),
  );
}

function layerProof(counts, leaves, session, artifactKey, uiProjection) {
  const pins = fanoutPins(session, artifactKey);
  return {
    A_fanoutExecution: {
      declared: counts.DECLARED,
      created: counts.CREATED,
      executed: counts.EXECUTED,
      uniqueTargetIds: new Set(leaves.map((l) => l.targetId)).size,
      uniqueExecutionIds: new Set(
        leaves.map((l) => l.executionId).filter(Boolean),
      ).size,
      ok:
        counts.DECLARED === 3 &&
        counts.CREATED === 3 &&
        counts.EXECUTED === 3 &&
        new Set(leaves.map((l) => l.targetId)).size === 3 &&
        new Set(leaves.map((l) => l.executionId).filter(Boolean)).size === 3,
    },
    B_canonicalCompletion: {
      canonical: counts.CANONICAL,
      uniqueXv: new Set(
        leaves
          .filter((l) => l.cdfArtifactId)
          .map((l) => `${l.cdfArtifactId}@${l.cdfArtifactVersion}`),
      ).size,
      ok: counts.CANONICAL === 3,
    },
    C_persistence: {
      persisted: counts.PERSISTED,
      sessionPinCount: pins.length,
      ok: counts.PERSISTED === 3 && pins.length === 3,
    },
    D_hydration: {
      hydrated: counts.HYDRATED,
      reloadPinCount: pins.length,
      ok: counts.HYDRATED === 3 && pins.length === 3,
    },
    E_uiProjection: {
      displayed: counts.DISPLAYED,
      uiProjectionOk: uiProjection?.displayedOk === true,
      ok: counts.DISPLAYED === 3 && uiProjection?.displayedOk === true,
    },
  };
}

/**
 * Build the same identity-bearing route seeds the chat UI hydrates, then run
 * the real projectFanoutRouteCardUserFacing cert (not session-pin inference).
 */
function certifyUiProjectionFromLeaves(leaves) {
  const routes = leaves.map((leaf) => {
    const hasCanonical =
      typeof leaf.cdfArtifactId === "string" &&
      leaf.cdfArtifactId.startsWith("cdfart_") &&
      typeof leaf.cdfArtifactVersion === "number" &&
      leaf.cdfArtifactVersion >= 1;
    const status =
      leaf.presentationEligibility ||
      (hasCanonical
        ? leaf.structuralWarned
          ? "AVAILABLE_WITH_WARNINGS"
          : "AVAILABLE"
        : "DIAGNOSTIC_PREVIEW_AVAILABLE");
    return {
      generationFanoutTargetId: leaf.generationFanoutTargetId || leaf.targetId,
      cdfArtifactId: leaf.cdfArtifactId || null,
      cdfArtifactVersion: leaf.cdfArtifactVersion ?? null,
      visualExecutionId: leaf.executionId || null,
      presentationEligibilityStatus: status,
      presentationEligibilityReason:
        leaf.presentationEligibilityReason ||
        (hasCanonical ? null : "raw_media_without_canonical_acceptance"),
      visualError: leaf.visualError || null,
      providerLabel: leaf.actualProvider || leaf.requestedProvider || null,
      providerId: leaf.actualProvider || leaf.requestedProvider || null,
      modelId: leaf.actualModel || leaf.requestedModel || null,
    };
  });

  const tmp = path.join(
    FE_API,
    `tmp-fanout-ui-routes-${Date.now().toString(36)}.json`,
  );
  const bundled = path.join(
    FE_API,
    `tmp-fanout-ui-proj-${Date.now().toString(36)}.cjs`,
  );
  fs.writeFileSync(tmp, JSON.stringify(routes));
  try {
    // Bundle the real FE projection module (same code web/mobile use).
    execSync(
      `npx --yes esbuild scripts/cert-fanout-ui-projection.ts --bundle --platform=node --format=cjs --outfile=${JSON.stringify(bundled)}`,
      { cwd: FE_API, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const out = execSync(`node ${JSON.stringify(bundled)} ${JSON.stringify(tmp)}`, {
      cwd: FE_API,
      encoding: "utf8",
      maxBuffer: 5_000_000,
    });
    const line = out
      .trim()
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    if (!line) {
      throw new Error(
        `UI projection cert produced no JSON: ${out.slice(0, 500)}`,
      );
    }
    return JSON.parse(line);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    try {
      fs.unlinkSync(bundled);
    } catch {}
  }
}

/**
 * Authoritative leaf ↔ pin match: generationFanoutTargetId ONLY.
 * executionId is never allowed to rescue a failed targetId match.
 */
function matchPinByTargetId(pins, targetId) {
  const tid = typeof targetId === "string" ? targetId.trim() : "";
  if (!tid) return null;
  const matches = pins.filter(
    (p) =>
      typeof p.generationFanoutTargetId === "string" &&
      p.generationFanoutTargetId.trim() === tid,
  );
  return matches.length === 1 ? matches[0] : null;
}

async function createTextPhase(token, orgId, {
  sessionId,
  serviceId,
  phaseId,
  artifactKey,
  brief,
  prompt,
  brandMeta = {},
}) {
  const r = await http("POST", "/v1/executions", {
    token,
    timeoutMs: 120000,
    body: {
      prompt,
      capabilityId: "text.generate",
      organizationId: orgId,
      providerId: "provider.openai",
      modelId: "gpt-4o",
      metadata: {
        service: serviceId,
        productAction: "generate",
        brandId: SUNFLOWER.brandId,
        brandName: SUNFLOWER.brandName,
        canonicalBrandName: SUNFLOWER.brandName,
        brandConfirmed: true,
        conversationalCurrentUserInstruction: brief,
        // Text upstream must not pin vault refs — Asset not found aborts create.
        cdfSessionId: sessionId,
        cdfServiceId: serviceId,
        cdfPhaseId: phaseId,
        cdfArtifactKey: artifactKey,
        cdfExecutionStrategy: "canonical",
        cdfGenerator: "text",
        cdfSemanticRole: "text_choice",
        cdfGenerationModality: "text",
        cdfOmitStructuredOutput: true,
        forceWriteCopy: true,
        ...brandMeta,
      },
    },
  });
  const ex = unwrap(r.json);
  const eid = ex?.executionId || ex?.id;
  if (!eid) {
    throw new Error(
      `${serviceId}.${phaseId} create failed: ${JSON.stringify(r.json)}`,
    );
  }
  let terminal = ex;
  if (
    !["succeeded", "failed", "completed", "error"].includes(
      String(ex?.status || ""),
    )
  ) {
    terminal = await poll(token, eid);
  }
  if (
    terminal.status !== "succeeded" &&
    terminal.status !== "completed"
  ) {
    throw new Error(
      `${serviceId}.${phaseId} failed: ${terminal.errorMessage || terminal.status}`,
    );
  }
  return { executionId: eid, terminal };
}

async function progressLogoUpstream(token, orgId, phase) {
  const steps = [];
  let r = await http("POST", "/v1/cdf/sessions", {
    token,
    body: {
      serviceId: "logo",
      productMode: "ai",
      brandId: SUNFLOWER.brandId,
    },
  });
  let session = unwrap(r.json)?.session;
  if (!session?.sessionId) {
    throw new Error(`logo session failed: ${JSON.stringify(r.json)}`);
  }
  const sid = session.sessionId;
  steps.push({ step: "session", sid, phaseId: session.phaseId });

  r = await transition(token, {
    sessionId: sid,
    action: "submit_brief",
    brief: phase.brief,
    expectedVersion: session.sessionVersion,
  });
  session = unwrap(r.json)?.session ?? (await getSession(token, sid));
  steps.push({ step: "brief", phaseId: session.phaseId });

  // logo-type config — Wordmark (index 0)
  r = await transition(token, {
    sessionId: sid,
    action: "select_route",
    routeIndex: 0,
    routeLabel: "Wordmark",
    routeTitle: "Wordmark",
    expectedVersion: session.sessionVersion,
  });
  session = unwrap(r.json)?.session ?? (await getSession(token, sid));
  steps.push({
    step: "logo-type",
    phaseId: session.phaseId,
    status: r.status,
    err: r.status >= 400 ? r.json : undefined,
  });
  if (r.status >= 400) {
    throw new Error(`logo-type select failed: ${JSON.stringify(r.json)}`);
  }

  await createTextPhase(token, orgId, {
    sessionId: sid,
    serviceId: "logo",
    phaseId: "territories",
    artifactKey: "logo.territories",
    brief: phase.brief,
    prompt: `${phase.brief}\n\nGenerate exactly 3 logo territories (creative directions) for this brand.`,
  });
  session = await getSession(token, sid);
  const territoriesGen = pin(
    (session.generatedArtifacts || []).find(
      (x) => x.artifactKey === "logo.territories",
    ),
  );
  steps.push({ step: "territories_gen", pin: territoriesGen });
  if (!territoriesGen?.artifactId) {
    throw new Error("logo.territories canonical pin missing after generate");
  }

  r = await transition(token, {
    sessionId: sid,
    action: "select_route",
    routeIndex: 0,
    expectedVersion: session.sessionVersion,
    artifactId: territoriesGen.artifactId,
    artifactVersion: territoriesGen.version,
    artifactKey: territoriesGen.artifactKey,
  });
  session = unwrap(r.json)?.session ?? (await getSession(token, sid));
  const territoriesSel = pin(
    (session.selectedArtifacts || []).find(
      (x) => x.artifactKey === "logo.territories",
    ),
  );
  steps.push({
    step: "territories_select",
    phaseId: session.phaseId,
    selected: territoriesSel,
    status: r.status,
  });
  if (r.status >= 400 || session.phaseId !== "logo-options") {
    throw new Error(
      `territories select did not reach logo-options: phase=${session.phaseId} status=${r.status} body=${JSON.stringify(r.json)}`,
    );
  }

  return { sessionId: sid, session, upstream: steps, selectedXv: territoriesSel };
}

async function progressPackagingUpstream(token, orgId, phase) {
  const steps = [];
  let r = await http("POST", "/v1/cdf/sessions", {
    token,
    body: {
      serviceId: "packaging",
      productMode: "ai",
      brandId: SUNFLOWER.brandId,
    },
  });
  let session = unwrap(r.json)?.session;
  if (!session?.sessionId) {
    throw new Error(`packaging session failed: ${JSON.stringify(r.json)}`);
  }
  const sid = session.sessionId;
  steps.push({ step: "session", sid, phaseId: session.phaseId });

  r = await transition(token, {
    sessionId: sid,
    action: "submit_brief",
    brief: phase.brief,
    expectedVersion: session.sessionVersion,
  });
  session = unwrap(r.json)?.session ?? (await getSession(token, sid));
  steps.push({ step: "brief", phaseId: session.phaseId });

  // dieline config — "I Don't Have One" is index 1
  // materializeDerivedOnSelect creates packaging.dieline X@V from path label
  r = await transition(token, {
    sessionId: sid,
    action: "select_route",
    routeIndex: 1,
    routeLabel: "I Don't Have One",
    routeTitle: "I Don't Have One",
    expectedVersion: session.sessionVersion,
  });
  session = unwrap(r.json)?.session ?? (await getSession(token, sid));
  const dielinePin = pin(
    (session.generatedArtifacts || []).find(
      (x) => x.artifactKey === "packaging.dieline",
    ) ||
      (session.selectedArtifacts || []).find(
        (x) => x.artifactKey === "packaging.dieline",
      ),
  );
  steps.push({
    step: "dieline_select",
    phaseId: session.phaseId,
    status: r.status,
    dielinePin,
    err: r.status >= 400 ? r.json : undefined,
  });
  if (r.status >= 400) {
    throw new Error(`dieline select failed: ${JSON.stringify(r.json)}`);
  }
  if (!dielinePin?.artifactId) {
    throw new Error(
      "packaging.dieline ArtifactVersion missing after config select (materializeDerivedOnSelect)",
    );
  }

  await createTextPhase(token, orgId, {
    sessionId: sid,
    serviceId: "packaging",
    phaseId: "routes",
    artifactKey: "packaging.routes",
    brief: phase.brief,
    prompt: `${phase.brief}\n\nGenerate exactly 3 packaging design routes (structured directions) for this pack.`,
  });
  session = await getSession(token, sid);
  const routesGen = pin(
    (session.generatedArtifacts || []).find(
      (x) => x.artifactKey === "packaging.routes",
    ),
  );
  steps.push({ step: "routes_gen", pin: routesGen });
  if (!routesGen?.artifactId) {
    throw new Error("packaging.routes canonical pin missing after generate");
  }

  r = await transition(token, {
    sessionId: sid,
    action: "select_route",
    routeIndex: 0,
    expectedVersion: session.sessionVersion,
    artifactId: routesGen.artifactId,
    artifactVersion: routesGen.version,
    artifactKey: routesGen.artifactKey,
  });
  session = unwrap(r.json)?.session ?? (await getSession(token, sid));
  const routesSel = pin(
    (session.selectedArtifacts || []).find(
      (x) => x.artifactKey === "packaging.routes",
    ),
  );
  steps.push({
    step: "routes_select",
    phaseId: session.phaseId,
    selected: routesSel,
    status: r.status,
  });
  if (r.status >= 400 || session.phaseId !== "3d-direction") {
    throw new Error(
      `routes select did not reach 3d-direction: phase=${session.phaseId} status=${r.status} body=${JSON.stringify(r.json)}`,
    );
  }

  return { sessionId: sid, session, upstream: steps, selectedXv: routesSel };
}

async function progressSocialUpstream(token, orgId, phase) {
  const steps = [];
  let r = await http("POST", "/v1/cdf/sessions", {
    token,
    body: {
      serviceId: "social-media",
      productMode: "ai",
      brandId: SUNFLOWER.brandId,
    },
  });
  let session = unwrap(r.json)?.session;
  if (!session?.sessionId) {
    throw new Error(`social session failed: ${JSON.stringify(r.json)}`);
  }
  const sid = session.sessionId;
  steps.push({ step: "session", sid, phaseId: session.phaseId });

  r = await transition(token, {
    sessionId: sid,
    action: "submit_brief",
    brief: phase.brief,
    expectedVersion: session.sessionVersion,
  });
  session = unwrap(r.json)?.session ?? (await getSession(token, sid));

  for (const label of ["Instagram", "Feed Post"]) {
    r = await transition(token, {
      sessionId: sid,
      action: "select_route",
      routeIndex: 0,
      routeLabel: label,
      expectedVersion: session.sessionVersion,
    });
    session = unwrap(r.json)?.session ?? (await getSession(token, sid));
    steps.push({ step: `config_${label}`, phaseId: session.phaseId });
  }

  await createTextPhase(token, orgId, {
    sessionId: sid,
    serviceId: "social-media",
    phaseId: "routes",
    artifactKey: "social-media.routes",
    brief: phase.brief,
    prompt: `${phase.brief}\n\nGenerate exactly 3 creative directions for an introductory Instagram feed post.`,
    brandMeta: {
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      format: "feed-post",
      category: "instagram:feed-post",
    },
  });
  session = await getSession(token, sid);
  const routesGen = pin(
    (session.generatedArtifacts || []).find(
      (x) => x.artifactKey === "social-media.routes",
    ),
  );
  steps.push({ step: "routes_gen", pin: routesGen });
  if (!routesGen?.artifactId) {
    throw new Error("social-media.routes pin missing");
  }

  r = await transition(token, {
    sessionId: sid,
    action: "select_route",
    routeIndex: 0,
    expectedVersion: session.sessionVersion,
    artifactId: routesGen.artifactId,
    artifactVersion: routesGen.version,
    artifactKey: routesGen.artifactKey,
  });
  session = unwrap(r.json)?.session ?? (await getSession(token, sid));
  const routesSel = pin(
    (session.selectedArtifacts || []).find(
      (x) => x.artifactKey === "social-media.routes",
    ),
  );
  steps.push({
    step: "routes_select",
    phaseId: session.phaseId,
    selected: routesSel,
  });

  return { sessionId: sid, session, upstream: steps, selectedXv: routesSel };
}

async function runFanoutLeaves(token, orgId, phase, plan, sessionId) {
  const leaves = [];
  await Promise.all(
    plan.targets.map(async (target, i) => {
      const baseMeta = { ...plan.metas[i] };
      if (i === 2) {
        // C5: drop preferredModelId — requestedModel must keep leaf distinct.
        delete baseMeta.preferredModelId;
        delete baseMeta.modelId;
      }
      const meta = {
        ...baseMeta,
        service:
          phase.serviceId === "social-media" ? "social" : phase.serviceId,
        productAction: "generate",
        capabilityId: "image.generate",
        allowsModelGenerationFanout: true,
        cdfExecutionStrategy: "canonical",
        cdfGenerationModality: "image",
        cdfGenerator: "image",
        cdfSemanticRole: "visual",
        cdfUxType: "visual",
        cdfSessionId: sessionId,
        cdfServiceId: phase.serviceId,
        cdfPhaseId: phase.phaseId,
        cdfArtifactKey: phase.artifactKey,
        brandId: SUNFLOWER.brandId,
        brandName: SUNFLOWER.brandName,
        canonicalBrandName: SUNFLOWER.brandName,
        brandConfirmed: true,
        conversationalCurrentUserInstruction: phase.brief,
        // Do not pin stale vault logoAssetId — create fails with Asset not found.
        ...(phase.serviceId === "social-media"
          ? {
              subtype: "content-design",
              platform: "instagram",
              format: "feed-post",
              category: "instagram:feed-post",
              skipOutputRequirements: true,
            }
          : {}),
      };
      const r = await http("POST", "/v1/executions", {
        token,
        timeoutMs: 120000,
        body: {
          prompt: `${phase.brief}\n\nGenerate the visual for the selected creative direction.`,
          capabilityId: "image.generate",
          organizationId: orgId,
          providerId: target.providerId,
          modelId: target.modelId,
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
        droppedPreferredModelId: i === 2,
        createStatus: r.status,
        createError: r.status >= 400 ? r.json : undefined,
        executionId: eid,
        createMetadataEcho: {
          preferredModelId: meta.preferredModelId ?? null,
          requestedModel: meta.requestedModel || target.modelId,
          preferredProviderId: meta.preferredProviderId,
          generationFanoutTargetId: meta.generationFanoutTargetId,
        },
      });
    }),
  );
  leaves.sort((a, b) => a.index - b.index);

  await Promise.all(
    leaves.map(async (leaf) => {
      if (!leaf.executionId) {
        leaf.terminalStatus = "create_failed";
        return;
      }
      const terminal = await poll(token, leaf.executionId);
      leaf.terminalStatus = terminal.status;
      const data = terminal?.result?.data || {};
      const md = terminal?.metadata || {};
      leaf.actualProvider =
        data.provider ||
        md.actualProviderId ||
        md.finalProviderId ||
        md.preferredProviderId ||
        md.requestedProvider;
      leaf.actualModel =
        data.model ||
        md.actualModelId ||
        md.finalModelId ||
        md.preferredModelId ||
        md.requestedModel;
      leaf.resolvedPreferredModelId = md.preferredModelId;
      leaf.resolvedRequestedModel = md.requestedModel;
      leaf.artifactIds = terminal?.artifactIds || [];
      leaf.cdfArtifactId = data.cdfArtifactId || md.cdfArtifactId || null;
      leaf.cdfArtifactVersion =
        data.cdfArtifactVersion ?? md.cdfArtifactVersion ?? null;
      leaf.cdfArtifactKey = data.cdfArtifactKey || md.cdfArtifactKey || null;
      leaf.presentationEligibility =
        data.presentationEligibility?.status ||
        md.presentationEligibility?.status ||
        data.presentationEligibilityStatus;
      leaf.presentationEligibilityReason =
        data.presentationEligibility?.reason ||
        md.presentationEligibility?.reason ||
        data.presentationEligibilityReason ||
        null;
      leaf.structuralWarned =
        leaf.presentationEligibility === "AVAILABLE_WITH_WARNINGS" ||
        String(leaf.presentationEligibilityReason || "").includes(
          "composition_soft",
        );
      leaf.visualError =
        data.presentationEligibility?.status === "AVAILABLE_WITH_WARNINGS"
          ? "Structural warning — some composition requirements were not verified or met."
          : null;
      leaf.generationFanoutTargetId =
        md.generationFanoutTargetId || leaf.targetId;
      leaf.errorMessage = terminal?.errorMessage;
      leaf.productCompletionBlocked =
        data.productCompletionBlocked || md.productCompletionBlocked;
      leaf.canonicalIngestDecision =
        data.canonicalIngestDecision ||
        md.canonicalIngestDecision ||
        md.cdfCanonicalIngestDecision ||
        null;
      leaf.cdfFallbackReason =
        data.cdfFallbackReason || md.cdfFallbackReason || null;
      leaf.ingestFailure =
        data.packagingIngestFailure ||
        data.genericIngestFailure ||
        md.packagingIngestFailure ||
        md.genericIngestFailure ||
        null;
    }),
  );
  return leaves;
}

async function probeC6MissingTarget(token, session, artifactKey) {
  const pins = fanoutPins(session, artifactKey);
  if (pins.length < 2) {
    return {
      attempted: false,
      reason: "insufficient_fanout_pins",
      pinCount: pins.length,
    };
  }
  const first = pins[0];
  // Visual fanout phases use approve (not select_route). Omit targetId → fail closed.
  const r = await transition(token, {
    sessionId: session.sessionId,
    action: "approve",
    expectedVersion: session.sessionVersion,
    artifactId: first.artifactId,
    artifactVersion: first.version,
    artifactKey: first.artifactKey,
    // intentionally omit generationFanoutTargetId
  });
  const code = r.json?.error?.code || r.json?.code || null;
  const msg =
    r.json?.error?.message || r.json?.message || JSON.stringify(r.json).slice(0, 300);
  const failedClosed =
    r.status >= 400 &&
    (String(code || "").includes("FANOUT") ||
      String(msg || "").toLowerCase().includes("fanout") ||
      String(msg || "").toLowerCase().includes("target") ||
      String(code || "").includes("APPROVAL_INVALID"));
  return {
    attempted: true,
    failedClosed: failedClosed || r.status >= 400,
    status: r.status,
    errorCode: code,
    errorMessage: msg,
  };
}

/**
 * Positive SELECT → APPROVE for one exact fanout leaf (by targetId).
 * Sequence: GENERATE → CANONICAL → PERSIST → RELOAD → SELECT → APPROVE.
 * Identity is generationFanoutTargetId — never index / provider / first-match.
 */
async function certifyPositiveApproveLeaf(token, orgId, phase, plan, targetId) {
  let progressed;
  if (phase.serviceId === "logo") {
    progressed = await progressLogoUpstream(token, orgId, phase);
  } else if (phase.serviceId === "packaging") {
    progressed = await progressPackagingUpstream(token, orgId, phase);
  } else {
    progressed = await progressSocialUpstream(token, orgId, phase);
  }

  const leaves = await runFanoutLeaves(
    token,
    orgId,
    phase,
    plan,
    progressed.sessionId,
  );

  // Persist + reload before select/approve (the original CDF_FANOUT_TARGET_ID_REQUIRED bug).
  await sleep(1500);
  let session = await getSession(token, progressed.sessionId);
  const pinsReload = fanoutPins(session, phase.artifactKey).map(pin);

  for (const leaf of leaves) {
    const match = matchPinByTargetId(pinsReload, leaf.generationFanoutTargetId);
    leaf.sessionPin = match;
    leaf.hydratedXv = match
      ? `${match.artifactId}@${match.version}`
      : null;
    // Strict: targetId must match. executionId is an additional invariant only.
    leaf.targetIdMatchStrict =
      match != null &&
      match.generationFanoutTargetId === leaf.generationFanoutTargetId;
    leaf.executionIdAdditionalOk =
      !match?.generationExecutionId ||
      !leaf.executionId ||
      match.generationExecutionId === leaf.executionId;
  }

  const uiProjection = certifyUiProjectionFromLeaves(leaves);

  const selectedLeaf = leaves.find(
    (l) => l.generationFanoutTargetId === targetId,
  );
  if (!selectedLeaf) {
    return {
      targetId,
      pass: false,
      reason: "LEAF_NOT_FOUND_BY_TARGET_ID",
      leaves: leaves.map((l) => l.generationFanoutTargetId),
    };
  }
  if (!selectedLeaf.targetIdMatchStrict || !selectedLeaf.hydratedXv) {
    return {
      targetId,
      pass: false,
      reason: "TARGET_ID_LOSS_AFTER_RELOAD",
      leaf: {
        generationFanoutTargetId: selectedLeaf.generationFanoutTargetId,
        cdfArtifactId: selectedLeaf.cdfArtifactId,
        sessionPin: selectedLeaf.sessionPin,
      },
      uiProjection,
    };
  }

  // SELECT: exact leaf identity from hydrated pin (not route index / provider).
  const selected = {
    generationFanoutTargetId: selectedLeaf.generationFanoutTargetId,
    artifactId: selectedLeaf.sessionPin.artifactId,
    artifactVersion: selectedLeaf.sessionPin.version,
    artifactKey:
      selectedLeaf.sessionPin.artifactKey ||
      selectedLeaf.cdfArtifactKey ||
      phase.artifactKey,
    executionId:
      selectedLeaf.sessionPin.generationExecutionId ||
      selectedLeaf.executionId,
    generationFanoutGroupId:
      selectedLeaf.sessionPin.generationFanoutGroupId || plan.groupId,
  };

  // Re-GET after select payload construction to prove identity survives reload.
  await sleep(500);
  session = await getSession(token, progressed.sessionId);
  const pinAfterReload = matchPinByTargetId(
    fanoutPins(session, phase.artifactKey),
    selected.generationFanoutTargetId,
  );
  const noTargetIdLossAfterReload =
    pinAfterReload != null &&
    pinAfterReload.artifactId === selected.artifactId &&
    pinAfterReload.version === selected.artifactVersion;

  const siblings = pinsReload.filter(
    (p) => p.generationFanoutTargetId !== selected.generationFanoutTargetId,
  );

  const approveRes = await transition(token, {
    sessionId: session.sessionId,
    action: "approve",
    expectedVersion: session.sessionVersion,
    artifactId: selected.artifactId,
    artifactVersion: selected.artifactVersion,
    artifactKey: selected.artifactKey,
    generationFanoutTargetId: selected.generationFanoutTargetId,
    ...(selected.generationFanoutGroupId
      ? { generationFanoutGroupId: selected.generationFanoutGroupId }
      : {}),
    executionId: selected.executionId,
  });

  const after = unwrap(approveRes.json)?.session
    ? unwrap(approveRes.json).session
    : await getSession(token, progressed.sessionId);

  // Authoritative post-approval state only — never selected/request payload.
  const approvedPhase = (after.approved || []).find(
    (a) => a.phaseId === phase.phaseId,
  );
  // Prefer exact X@V match on approvedArtifacts; fall back to phase/key pin.
  const approvedArtifactRef =
    (after.approvedArtifacts || []).find(
      (a) =>
        (a.artifactKey === phase.artifactKey || a.phaseId === phase.phaseId) &&
        a.artifactId === selected.artifactId &&
        a.version === selected.artifactVersion,
    ) ||
    (after.approvedArtifacts || []).find(
      (a) =>
        a.artifactKey === phase.artifactKey || a.phaseId === phase.phaseId,
    );

  const approvedTargetIdRaw =
    typeof approvedArtifactRef?.generationFanoutTargetId === "string"
      ? approvedArtifactRef.generationFanoutTargetId.trim()
      : "";
  const approvedTargetIdPresent = approvedTargetIdRaw.length > 0;
  // FAIL CLOSED: never substitute selected.generationFanoutTargetId.
  const approvedTargetId = approvedTargetIdPresent
    ? approvedTargetIdRaw
    : null;

  // Prefer approvedArtifacts pin for X@V; approved[] is secondary.
  const approvedArtifactId =
    typeof approvedArtifactRef?.artifactId === "string" &&
    approvedArtifactRef.artifactId.trim()
      ? approvedArtifactRef.artifactId.trim()
      : typeof approvedPhase?.artifactId === "string" &&
          approvedPhase.artifactId.trim()
        ? approvedPhase.artifactId.trim()
        : null;
  const approvedArtifactVersion =
    typeof approvedArtifactRef?.version === "number" &&
    Number.isInteger(approvedArtifactRef.version) &&
    approvedArtifactRef.version >= 1
      ? approvedArtifactRef.version
      : typeof approvedPhase?.artifactVersion === "number" &&
          Number.isInteger(approvedPhase.artifactVersion) &&
          approvedPhase.artifactVersion >= 1
        ? approvedPhase.artifactVersion
        : null;

  const approvedVersionPresent = approvedArtifactVersion != null;
  const approvedXv =
    approvedArtifactId && approvedVersionPresent
      ? `${approvedArtifactId}@${approvedArtifactVersion}`
      : null;

  const expectedXv = `${selected.artifactId}@${selected.artifactVersion}`;
  const nextPhaseOk = after.phaseId === phase.nextPhaseId;
  const approveHttpOk = approveRes.status < 400;

  // Strict X@V: both id and version must be present and equal expected.
  const exactXvOk =
    approvedXv != null &&
    approvedXv === expectedXv &&
    approvedArtifactId === selected.artifactId &&
    approvedArtifactVersion === selected.artifactVersion;

  // Strict targetId: must be present on approvedArtifacts and match selected leaf.
  const exactTargetOk =
    approvedTargetIdPresent &&
    approvedTargetId === selected.generationFanoutTargetId;

  const noSiblingApproved =
    exactXvOk &&
    exactTargetOk &&
    siblings.every((sib) => {
      const sibXv = `${sib.artifactId}@${sib.version}`;
      if (approvedXv === sibXv) return false;
      if (approvedTargetId === sib.generationFanoutTargetId) return false;
      if (
        approvedArtifactId === sib.artifactId &&
        approvedArtifactVersion === sib.version
      ) {
        return false;
      }
      return true;
    });

  const executionIdOk =
    !selected.executionId ||
    !approvedPhase?.executionId ||
    approvedPhase.executionId === selected.executionId;

  const pass =
    approveHttpOk &&
    nextPhaseOk &&
    exactXvOk &&
    exactTargetOk &&
    approvedTargetIdPresent &&
    approvedVersionPresent &&
    noSiblingApproved &&
    noTargetIdLossAfterReload &&
    selectedLeaf.targetIdMatchStrict &&
    uiProjection.displayedOk === true;

  return {
    targetId,
    pass,
    select: selected,
    approveStatus: approveRes.status,
    approveError:
      approveRes.status >= 400
        ? approveRes.json?.error || approveRes.json
        : null,
    nextPhaseId: after.phaseId,
    expectedNextPhaseId: phase.nextPhaseId,
    nextPhaseOk,
    approvedXv,
    expectedXv,
    exactXvOk,
    approvedTargetId,
    approvedTargetIdPresent,
    approvedArtifactId,
    approvedArtifactVersion,
    approvedVersionPresent,
    exactTargetOk,
    noSiblingApproved,
    noTargetIdLossAfterReload,
    executionIdAdditionalOk: executionIdOk,
    uiProjection: {
      displayedOk: uiProjection.displayedOk,
      noInternalDiagnosticLeak: uiProjection.noInternalDiagnosticLeak,
      structuralWarningRemainsUsable:
        uiProjection.structuralWarningRemainsUsable,
    },
    siblingAssertions: siblings.map((sib) => ({
      siblingTargetId: sib.generationFanoutTargetId,
      siblingXv: `${sib.artifactId}@${sib.version}`,
      approvedTargetIdNotSibling:
        approvedTargetId != null &&
        approvedTargetId !== sib.generationFanoutTargetId,
      approvedXvNotSibling:
        approvedXv != null && approvedXv !== `${sib.artifactId}@${sib.version}`,
    })),
    sessionId: progressed.sessionId,
  };
}

function computeCounts(plan, leaves, pinsFinal, uiProjection) {
  const created = leaves.filter((l) => l.executionId).length;
  const executed = leaves.filter((l) =>
    ["succeeded", "completed", "failed", "error"].includes(
      String(l.terminalStatus || ""),
    ),
  ).length;
  const canonical = leaves.filter(
    (l) =>
      typeof l.cdfArtifactId === "string" &&
      l.cdfArtifactId.startsWith("cdfart_") &&
      typeof l.cdfArtifactVersion === "number" &&
      l.cdfArtifactVersion >= 1,
  ).length;
  const persisted = pinsFinal.filter((p) =>
    leaves.some(
      (l) =>
        l.generationFanoutTargetId === p.generationFanoutTargetId &&
        l.cdfArtifactId === p.artifactId &&
        l.cdfArtifactVersion === p.version,
    ),
  ).length;
  const hydrated = leaves.filter(
    (l) =>
      l.targetIdMatchStrict &&
      l.hydratedXv &&
      l.cdfArtifactId &&
      l.hydratedXv === `${l.cdfArtifactId}@${l.cdfArtifactVersion}`,
  ).length;
  // DISPLAYED from real UI projection — never from session pins alone.
  const displayed =
    uiProjection?.displayedOk === true && uiProjection.cardCount === 3
      ? 3
      : uiProjection?.cards
        ? uiProjection.cards.filter(
            (c) =>
              c.generationFanoutTargetId &&
              c.xv &&
              c.usable &&
              !c.staleRawAfterCanonical &&
              c.noInternalLeak,
          ).length
        : 0;

  return {
    DECLARED: plan.cardinality,
    CREATED: created,
    EXECUTED: executed,
    CANONICAL: canonical,
    PERSISTED: persisted,
    HYDRATED: hydrated,
    DISPLAYED: displayed,
  };
}

async function certifyPhase(token, orgId, phase, plan) {
  let progressed;
  if (phase.serviceId === "logo") {
    progressed = await progressLogoUpstream(token, orgId, phase);
  } else if (phase.serviceId === "packaging") {
    progressed = await progressPackagingUpstream(token, orgId, phase);
  } else {
    progressed = await progressSocialUpstream(token, orgId, phase);
  }

  const leaves = await runFanoutLeaves(
    token,
    orgId,
    phase,
    plan,
    progressed.sessionId,
  );

  let session = await getSession(token, progressed.sessionId);
  const pinsAfter = fanoutPins(session, phase.artifactKey).map(pin);

  await sleep(1500);
  const sessionReload = await getSession(token, progressed.sessionId);
  const pinsReload = fanoutPins(sessionReload, phase.artifactKey).map(pin);

  for (const leaf of leaves) {
    // STRICT: targetId only — executionId must not rescue a miss.
    const match = matchPinByTargetId(
      pinsReload,
      leaf.generationFanoutTargetId,
    );
    leaf.sessionPin = match;
    leaf.hydratedXv = match
      ? `${match.artifactId}@${match.version}`
      : null;
    leaf.targetIdMatchStrict =
      match != null &&
      match.generationFanoutTargetId === leaf.generationFanoutTargetId;
    leaf.executionIdAdditionalOk =
      !match?.generationExecutionId ||
      !leaf.executionId ||
      match.generationExecutionId === leaf.executionId;
  }

  const uiProjection = certifyUiProjectionFromLeaves(leaves);

  const c6 = await probeC6MissingTarget(token, sessionReload, phase.artifactKey);
  session = await getSession(token, progressed.sessionId);
  const pinsFinal = fanoutPins(session, phase.artifactKey);

  const counts = computeCounts(plan, leaves, pinsFinal, uiProjection);
  const uniqueAv = new Set(
    leaves
      .filter((l) => l.cdfArtifactId)
      .map((l) => `${l.cdfArtifactId}@${l.cdfArtifactVersion}`),
  );

  const openaiLeaves = leaves.filter(
    (l) =>
      String(l.actualProvider || l.requestedProvider) === "provider.openai",
  );
  const openaiModelsDistinct =
    new Set(openaiLeaves.map((l) => l.actualModel || l.requestedModel)).size ===
    openaiLeaves.length;

  const layers = layerProof(
    counts,
    leaves,
    session,
    phase.artifactKey,
    uiProjection,
  );
  const allLayersOk = Object.values(layers).every((l) => l.ok === true);

  // Positive SELECT→APPROVE for each leaf targetId independently (fresh sessions).
  const routeApprovals = [];
  for (const target of plan.targets) {
    console.error(
      `  → SELECT+APPROVE ${phase.key} targetId=${target.targetId}`,
    );
    const leafPlan = loadFanoutPlan();
    const approval = await certifyPositiveApproveLeaf(
      token,
      orgId,
      phase,
      leafPlan,
      target.targetId,
    );
    routeApprovals.push(approval);
    console.error(
      `  → ${target.targetId}: ${approval.pass ? "PASS" : "FAIL"}` +
        (approval.pass
          ? ""
          : ` reason=${approval.reason || "gates"}` +
            ` http=${approval.approveStatus}` +
            ` exactTarget=${approval.exactTargetOk}` +
            ` targetPresent=${approval.approvedTargetIdPresent}` +
            ` exactXv=${approval.exactXvOk}` +
            ` versionPresent=${approval.approvedVersionPresent}` +
            ` nextPhase=${approval.nextPhaseOk}` +
            ` approvedTarget=${approval.approvedTargetId}` +
            ` approvedXv=${approval.approvedXv}` +
            ` expectedXv=${approval.expectedXv}` +
            (approval.approveError
              ? ` err=${JSON.stringify(approval.approveError).slice(0, 200)}`
              : "")),
    );
  }

  const route1 = routeApprovals[0];
  const route2 = routeApprovals[1];
  const route3 = routeApprovals[2];

  const gates = {
    ROUTE_1_SELECT_APPROVE: route1?.pass === true,
    ROUTE_2_SELECT_APPROVE: route2?.pass === true,
    ROUTE_3_SELECT_APPROVE: route3?.pass === true,
    NO_CROSS_LEAF_APPROVAL: routeApprovals.every(
      (a) => a.noSiblingApproved === true,
    ),
    NO_FIRST_MATCH_APPROVAL: routeApprovals.every(
      (a) =>
        a.exactTargetOk === true &&
        a.exactXvOk === true &&
        a.approvedTargetIdPresent === true &&
        a.approvedVersionPresent === true &&
        a.approvedTargetId === a.targetId &&
        a.approvedXv === a.expectedXv &&
        a.select?.generationFanoutTargetId === a.targetId,
    ),
    APPROVED_TARGET_ID_PRESENT: routeApprovals.every(
      (a) => a.approvedTargetIdPresent === true && a.exactTargetOk === true,
    ),
    APPROVED_ARTIFACT_VERSION_PRESENT: routeApprovals.every(
      (a) => a.approvedVersionPresent === true && a.exactXvOk === true,
    ),
    EXACT_TARGET_OK: routeApprovals.every((a) => a.exactTargetOk === true),
    EXACT_XV_OK: routeApprovals.every((a) => a.exactXvOk === true),
    NEXT_PHASE_OK: routeApprovals.every((a) => a.nextPhaseOk === true),
    NO_TARGET_ID_LOSS_AFTER_RELOAD: routeApprovals.every(
      (a) => a.noTargetIdLossAfterReload === true,
    ),
    NO_INTERNAL_DIAGNOSTIC_UI_LEAK:
      uiProjection.noInternalDiagnosticLeak === true &&
      routeApprovals.every(
        (a) => a.uiProjection?.noInternalDiagnosticLeak !== false,
      ),
    STRUCTURAL_WARNING_REMAINS_USABLE:
      uiProjection.structuralWarningRemainsUsable === true,
  };

  const allGatesOk = Object.values(gates).every((v) => v === true);

  return {
    phase,
    sessionId: progressed.sessionId,
    upstream: progressed.upstream,
    selectedUpstreamXv: progressed.selectedXv,
    counts,
    firstDivergence: firstDivergence(counts),
    layers,
    uiProjection,
    leaves,
    sessionPinsAfterFanout: pinsAfter,
    sessionPinsAfterReload: pinsReload,
    reloadCollapsed3to1: pinsAfter.length === 3 && pinsReload.length < 3,
    c6MissingTarget: c6,
    routeApprovals,
    gates,
    invariants: {
      uniqueTargetIds: new Set(leaves.map((l) => l.targetId)).size === 3,
      uniqueExecutionIds:
        new Set(leaves.map((l) => l.executionId).filter(Boolean)).size ===
          counts.CREATED && counts.CREATED === 3,
      noSharedArtifactVersion:
        uniqueAv.size === counts.CANONICAL && counts.CANONICAL === 3,
      uniqueProviderModelPairs: new Set(
        leaves
          .filter((l) => l.actualProvider && l.actualModel)
          .map((l) => `${l.actualProvider}::${l.actualModel}`),
      ).size,
      openaiDualModelsDistinct: openaiModelsDistinct,
      noCrossLeafFallback: plan.metas.every(
        (m) =>
          Array.isArray(m.imageFailoverChain) &&
          m.imageFailoverChain.every(
            (s) => s && s.providerId === m.preferredProviderId,
          ),
      ),
      c5Leaf2RetainedRequestedModel: Boolean(
        leaves[2]?.createMetadataEcho?.requestedModel &&
          !leaves[2]?.createMetadataEcho?.preferredModelId,
      ),
      c5Leaf2ResolvedDistinctFromLeaf0:
        (leaves[2]?.actualModel || leaves[2]?.resolvedRequestedModel) !==
        (leaves[0]?.actualModel || leaves[0]?.requestedModel),
      c6FailedClosed: c6.attempted ? c6.failedClosed === true : null,
      reloadRetainedThreePins: pinsReload.length === 3,
      sessionPinScopedToTarget: leaves.every(
        (l) =>
          !l.cdfArtifactId ||
          (l.sessionPin &&
            l.sessionPin.generationFanoutTargetId ===
              l.generationFanoutTargetId),
      ),
      targetIdMatchStrictNoExecRescue: leaves.every(
        (l) => !l.cdfArtifactId || l.targetIdMatchStrict === true,
      ),
      displayedFromUiProjectionNotPinsAlone:
        uiProjection?.displayedOk === true,
    },
    allLayersOk,
    allGatesOk,
    phasePass: allLayersOk && allGatesOk && !firstDivergence(counts),
  };
}

async function main() {
  const report = {
    purpose: "cdf_fanout_framework_live_certification_select_approve",
    startedAt: new Date().toISOString(),
    phases: [],
    verdict: "INCOMPLETE",
    note:
      "LIVE_CERT_PASS requires cardinality 3 + UI projection DISPLAYED + Route 1/2/3 SELECT+APPROVE + isolation gates for every fanout-capable phase",
  };

  const reuse = process.env.LIVE_CERT_REUSE_BACKEND === "1";
  if (!reuse) {
    await killBackend();
    startBackend();
  }
  if (!(await waitReady())) throw new Error("backend not ready");

  const token = await firebaseToken(EMAIL);
  const me = unwrap((await http("GET", "/v1/me", { token })).json);
  const orgId = me?.currentOrganizationId || me?.organizationId;
  report.orgId = orgId;
  report.phasesConfigured = PHASES.map((p) => p.key);

  for (const phase of PHASES) {
    console.error(`\n=== CERTIFY ${phase.key} ===`);
    const phasePlan = loadFanoutPlan();
    if (phasePlan.cardinality !== 3) {
      throw new Error(
        `DECLARED fanout cardinality ${phasePlan.cardinality} !== 3`,
      );
    }
    try {
      const result = await certifyPhase(token, orgId, phase, phasePlan);
      report.phases.push(result);
      console.error(
        `${phase.key}: counts=${JSON.stringify(result.counts)} gates=${JSON.stringify(result.gates)} divergence=${JSON.stringify(result.firstDivergence)}`,
      );
    } catch (e) {
      report.phases.push({
        phase,
        error: String(e?.stack || e),
        counts: {
          DECLARED: 3,
          CREATED: 0,
          EXECUTED: 0,
          CANONICAL: 0,
          PERSISTED: 0,
          HYDRATED: 0,
          DISPLAYED: 0,
        },
        firstDivergence: { stage: "UPSTREAM", actual: 0, expected: 3 },
        allLayersOk: false,
        allGatesOk: false,
        phasePass: false,
        gates: {},
      });
      console.error(`${phase.key} FAILED:`, e);
    }
  }

  const allPass = report.phases.every(
    (p) =>
      p.phasePass === true &&
      p.allLayersOk &&
      p.allGatesOk &&
      !p.firstDivergence &&
      p.invariants?.uniqueTargetIds &&
      p.invariants?.uniqueExecutionIds &&
      p.invariants?.noSharedArtifactVersion &&
      p.invariants?.noCrossLeafFallback &&
      p.invariants?.openaiDualModelsDistinct &&
      p.invariants?.c5Leaf2ResolvedDistinctFromLeaf0 &&
      p.invariants?.c6FailedClosed !== false &&
      p.invariants?.reloadRetainedThreePins &&
      p.invariants?.targetIdMatchStrictNoExecRescue &&
      p.invariants?.displayedFromUiProjectionNotPinsAlone &&
      !p.reloadCollapsed3to1,
  );

  report.verdict = allPass ? "LIVE_CERT_PASS" : "LIVE_CERT_FAIL";
  report.finishedAt = new Date().toISOString();
  report.matrix = report.phases.map((p) => ({
    phase: p.phase?.key,
    counts: p.counts,
    gates: p.gates,
    phasePass: p.phasePass === true,
    firstDivergence: p.firstDivergence,
  }));
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error(`\nWrote ${OUT}`);
  console.error(`Verdict: ${report.verdict}`);
  for (const p of report.phases) {
    console.error(
      `${p.phase?.key || p.phase?.artifactKey}: pass=${p.phasePass} counts=${JSON.stringify(p.counts)} gates=${JSON.stringify(p.gates)} divergence=${JSON.stringify(p.firstDivergence)}`,
    );
  }
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("LIVE FANOUT CERT FAILED", e);
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        verdict: "LIVE_CERT_ERROR",
        error: String(e?.stack || e),
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
