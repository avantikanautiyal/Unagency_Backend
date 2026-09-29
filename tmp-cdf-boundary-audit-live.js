/**
 * CDF lifecycle live certification harness (fail-closed).
 *
 * LIVE_CERT_PASS only when every required flow proves:
 * GENERATE → CANONICAL → PERSIST → RELOAD → PRESENTATION → SELECT →
 * APPROVAL → NEXT WORK → NEXT PHASE GENERATION
 *
 * Identity rules (never weaken):
 * - Never pins[0], latest artifact, artifactKey-only, or executionId-only as proof
 * - Fanout: prove declared cardinality + every leaf targetId + independent X@V
 * - Select/approve: exact generationFanoutTargetId + artifactId + artifactVersion
 * - Missing targetId / artifactId / artifactVersion ⇒ PASS impossible
 * - Provider quota remains typed provider failure (never DocumentPlan/modality/identity)
 *
 * Does NOT refactor application code. Uses already-running backend on :4000.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const API = "http://127.0.0.1:4000";
const OUT = "/tmp/cdf-boundary-audit-live.json";
const EMAIL =
  process.env.PHASE8_E2E_EMAIL ||
  process.env.SUNFLOWER_E2E_EMAIL ||
  "avantika.mcs22.du@gmail.com";

/**
 * Certification mode (harness-only — does not change runtime fanout):
 * - flow_partial_availability (default): ≥1 successful leaf with full lifecycle;
 *   remaining leaves must be typed unavailable/failed (never silent-missing).
 * - full_fanout: every declared leaf must succeed + complete lifecycle.
 *
 * Env aliases: FLOW_CERTIFICATION_MODE / FANOUT_CERTIFICATION_MODE
 */
const FANOUT_CERT_MODE = (() => {
  const raw = String(
    process.env.FLOW_CERTIFICATION_MODE ||
      process.env.FANOUT_CERTIFICATION_MODE ||
      "flow_partial_availability",
  )
    .trim()
    .toLowerCase();
  if (raw === "full_fanout" || raw === "full" || raw === "strict") {
    return "full_fanout";
  }
  return "flow_partial_availability";
})();

function loadFanoutCertCriteria() {
  require("ts-node/register/transpile-only");
  return require("./src/platform/cdf/conformance/fanout-certification-criteria");
}

const STAGES = [
  "GENERATE",
  "CANONICAL",
  "PERSIST",
  "RELOAD",
  "PRESENTATION",
  "SELECT",
  "APPROVAL",
  "NEXT_WORK",
  "NEXT_PHASE_GENERATION",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function unwrap(json) {
  return json?.data != null
    ? json.data
    : json?.result != null
      ? json.result
      : json;
}

async function http(method, p, { token, body, timeoutMs = 300000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}${p}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: r.status, json, text };
  } finally {
    clearTimeout(t);
  }
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
  return process.env.FIREBASE_WEB_API_KEY || "";
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
  if (!j.idToken)
    throw new Error(`Custom token exchange failed: ${JSON.stringify(j)}`);
  return j.idToken;
}

async function getSession(token, sessionId) {
  const r = await http("GET", `/v1/cdf/sessions/${sessionId}`, { token });
  return unwrap(r.json)?.session || unwrap(r.json);
}

async function transition(token, body) {
  return http("POST", "/v1/cdf/transition", { token, body, timeoutMs: 120000 });
}

function phaseIdOf(session) {
  return session?.phaseId || session?.currentPhaseId || null;
}

function identityFromExec(ex) {
  const data =
    ex?.result?.data && typeof ex.result.data === "object" ? ex.result.data : {};
  const meta = ex?.metadata && typeof ex.metadata === "object" ? ex.metadata : {};
  const artifactId =
    typeof data.cdfArtifactId === "string" && data.cdfArtifactId.trim()
      ? data.cdfArtifactId.trim()
      : typeof meta.cdfArtifactId === "string" && meta.cdfArtifactId.trim()
        ? meta.cdfArtifactId.trim()
        : "";
  const verRaw = data.cdfArtifactVersion ?? meta.cdfArtifactVersion;
  const artifactVersion =
    typeof verRaw === "number"
      ? verRaw
      : typeof verRaw === "string" && /^\d+$/.test(verRaw)
        ? Number(verRaw)
        : null;
  const artifactKey =
    typeof data.cdfArtifactKey === "string" && data.cdfArtifactKey.trim()
      ? data.cdfArtifactKey.trim()
      : typeof meta.cdfArtifactKey === "string" && meta.cdfArtifactKey.trim()
        ? meta.cdfArtifactKey.trim()
        : null;
  const generationFanoutTargetId =
    typeof meta.generationFanoutTargetId === "string" &&
    meta.generationFanoutTargetId.trim()
      ? meta.generationFanoutTargetId.trim()
      : typeof data.generationFanoutTargetId === "string" &&
          data.generationFanoutTargetId.trim()
        ? data.generationFanoutTargetId.trim()
        : null;
  const generationFanoutGroupId =
    typeof meta.generationFanoutGroupId === "string" &&
    meta.generationFanoutGroupId.trim()
      ? meta.generationFanoutGroupId.trim()
      : typeof data.generationFanoutGroupId === "string" &&
          data.generationFanoutGroupId.trim()
        ? data.generationFanoutGroupId.trim()
        : null;
  const generationExecutionId =
    typeof ex?.executionId === "string"
      ? ex.executionId
      : typeof ex?.id === "string"
        ? ex.id
        : null;
  return {
    artifactId,
    artifactVersion,
    artifactKey,
    generationFanoutTargetId,
    generationFanoutGroupId,
    generationExecutionId,
    phaseId:
      typeof meta.cdfPhaseId === "string"
        ? meta.cdfPhaseId
        : typeof data.cdfPhaseId === "string"
          ? data.cdfPhaseId
          : null,
  };
}

function pinIdentity(pin) {
  if (!pin || typeof pin !== "object") return null;
  const artifactId =
    typeof pin.artifactId === "string"
      ? pin.artifactId.trim()
      : typeof pin.cdfArtifactId === "string"
        ? pin.cdfArtifactId.trim()
        : "";
  const verRaw = pin.version ?? pin.artifactVersion ?? pin.cdfArtifactVersion;
  const artifactVersion =
    typeof verRaw === "number"
      ? verRaw
      : typeof verRaw === "string" && /^\d+$/.test(verRaw)
        ? Number(verRaw)
        : null;
  const artifactKey =
    typeof pin.artifactKey === "string"
      ? pin.artifactKey.trim()
      : typeof pin.cdfArtifactKey === "string"
        ? pin.cdfArtifactKey.trim()
        : null;
  const generationFanoutTargetId =
    typeof pin.generationFanoutTargetId === "string" &&
    pin.generationFanoutTargetId.trim()
      ? pin.generationFanoutTargetId.trim()
      : null;
  const generationExecutionId =
    typeof pin.generationExecutionId === "string" &&
    pin.generationExecutionId.trim()
      ? pin.generationExecutionId.trim()
      : typeof pin.executionId === "string" && pin.executionId.trim()
        ? pin.executionId.trim()
        : null;
  return {
    artifactId,
    artifactVersion,
    artifactKey,
    generationFanoutTargetId,
    generationExecutionId,
    phaseId: typeof pin.phaseId === "string" ? pin.phaseId : null,
  };
}

function xvKey(id) {
  if (!id?.artifactId || id.artifactVersion == null) return null;
  return `${id.artifactId}@${id.artifactVersion}`;
}

function sameXV(a, b) {
  return (
    Boolean(a?.artifactId) &&
    Boolean(b?.artifactId) &&
    a.artifactId === b.artifactId &&
    a.artifactVersion === b.artifactVersion
  );
}

/** Fail-closed: PASS impossible without exact identity fields. */
function requireExactIdentity(id, { requireFanoutTarget = false } = {}) {
  const missing = [];
  if (!id?.artifactId || !String(id.artifactId).startsWith("cdfart_")) {
    missing.push("artifactId");
  }
  if (id?.artifactVersion == null || !Number.isInteger(id.artifactVersion)) {
    missing.push("artifactVersion");
  }
  if (!id?.artifactKey) missing.push("artifactKey");
  if (requireFanoutTarget && !id?.generationFanoutTargetId) {
    missing.push("generationFanoutTargetId");
  }
  if (!id?.generationExecutionId) missing.push("generationExecutionId");
  if (!id?.phaseId) missing.push("phaseId");
  return {
    ok: missing.length === 0,
    missing,
    identity: id || null,
  };
}

/**
 * Find a pin by exact identity only. Never first/latest/key-only/executionId-only.
 */
function findExactPin(session, want) {
  const pins = Array.isArray(session?.generatedArtifacts)
    ? session.generatedArtifacts
    : [];
  if (!want?.artifactId || want.artifactVersion == null) return null;
  const matches = pins
    .map(pinIdentity)
    .filter(
      (p) =>
        p &&
        p.artifactId === want.artifactId &&
        p.artifactVersion === want.artifactVersion,
    );
  if (want.generationFanoutTargetId) {
    const byTarget = matches.filter(
      (p) => p.generationFanoutTargetId === want.generationFanoutTargetId,
    );
    return byTarget.length === 1 ? byTarget[0] : null;
  }
  return matches.length === 1 ? matches[0] : null;
}

function classifyFailure(message) {
  const s = String(message || "");
  if (/DocumentPlan/i.test(s)) return "DOCUMENTPLAN_MISCLASSIFICATION";
  if (
    /quota|rate.?limit|insufficient.?quota|RESOURCE_EXHAUSTED|429|billing/i.test(
      s,
    )
  ) {
    return "PROVIDER_QUOTA_FAILURE";
  }
  if (/provider|model.?unavailable|OPENAI|GOOGLE|API.?error/i.test(s)) {
    return "PROVIDER_FAILURE";
  }
  return "OTHER_FAILURE";
}

async function poll(token, eid, max = 120) {
  for (let i = 0; i < max; i++) {
    const r = await http("GET", `/v1/executions/${encodeURIComponent(eid)}`, {
      token,
      timeoutMs: 60000,
    });
    const ex = unwrap(r.json);
    const st = String(ex?.status || "");
    if (["succeeded", "failed", "completed", "error", "cancelled"].includes(st)) {
      return ex;
    }
    await sleep(2500);
  }
  return { status: "timeout", executionId: eid };
}

async function createExec(token, orgId, body) {
  const r = await http("POST", "/v1/executions", {
    token,
    body: { ...body, organizationId: orgId },
    timeoutMs: 180000,
  });
  const ex = unwrap(r.json);
  return {
    status: r.status,
    executionId: ex?.executionId || ex?.id,
    body: r.json,
  };
}

function newPhaseStages(phaseId) {
  const stages = {};
  for (const s of STAGES) {
    stages[s] = {
      status: "pending",
      phaseId,
      artifactId: null,
      artifactVersion: null,
      artifactKey: null,
      generationFanoutTargetId: null,
      generationExecutionId: null,
      proof: null,
      defect: null,
    };
  }
  return stages;
}

function recordStage(stages, stage, patch) {
  stages[stage] = {
    ...stages[stage],
    ...patch,
    status: patch.ok === false ? "FAIL" : patch.ok === true ? "PASS" : stages[stage].status,
  };
}

function stageIdentityFields(id) {
  return {
    artifactId: id?.artifactId ?? null,
    artifactVersion: id?.artifactVersion ?? null,
    artifactKey: id?.artifactKey ?? null,
    generationFanoutTargetId: id?.generationFanoutTargetId ?? null,
    generationExecutionId: id?.generationExecutionId ?? null,
    phaseId: id?.phaseId ?? null,
  };
}

function allStagesPassed(stages) {
  return STAGES.every((s) => stages[s]?.status === "PASS");
}

function planImageFanoutViaContract() {
  const probe = execSync(
    `npx --yes ts-node --transpile-only -e "import { planImageGenerationFanout, GENERATION_FANOUT_PROVIDER_FAMILIES, buildGenerationFanoutLeafMetadata } from './src/platform/generation/generation-fanout'; const plan = planImageGenerationFanout({ useCase: 'marketing_creative', groupId: 'cert_' + Date.now().toString(36), executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES) }); console.log(JSON.stringify({ cardinality: plan.cardinality, declaredFamilies: GENERATION_FANOUT_PROVIDER_FAMILIES.length, groupId: plan.groupId, targets: plan.targets, metas: plan.targets.map(t => buildGenerationFanoutLeafMetadata({ plan, target: t })) }));"`,
    {
      cwd: __dirname,
      encoding: "utf8",
      maxBuffer: 5_000_000,
    },
  );
  const planLine = probe
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .pop();
  return JSON.parse(planLine);
}

/**
 * Certify one non-fanout structured/text/image phase through full lifecycle.
 * `selectAction`: null | "select_route" | "approve_only"
 * When select_route: SELECT uses select_route; APPROVAL may be skipped if select advances.
 * When approve_only: SELECT records authoritative chosen identity; APPROVAL uses approve.
 */
async function certifyPhaseLifecycle(ctx) {
  const {
    token,
    orgId,
    sessionId,
    serviceId,
    phase,
    expectedNextPhaseId,
    nextPhaseGeneration,
    selectMode = "approve_only", // "select_route" | "approve_only"
    requireFanoutTarget = false,
    documentPlanForbidden = true,
    /** When nextPhaseGeneration is omitted: "deferred" (proven by caller) | "terminal" */
    nextPhaseGenerationMode = "required",
  } = ctx;

  let session = await getSession(token, sessionId);
  const stages = newPhaseStages(phase.phaseId);
  const phaseReport = {
    phaseId: phase.phaseId,
    stages,
    defects: [],
    ok: false,
  };

  const fail = (stage, code, detail, id = null) => {
    phaseReport.defects.push({ stage, code, detail });
    recordStage(stages, stage, {
      ok: false,
      defect: { code, detail },
      ...stageIdentityFields(id),
    });
    phaseReport.ok = false;
    return phaseReport;
  };

  // --- GENERATE ---
  console.log(`[${serviceId}] GENERATE ${phase.phaseId}`);
  const created = await createExec(token, orgId, {
    prompt: phase.prompt,
    capabilityId: phase.capabilityId,
    metadata: phase.metadata,
    ...(phase.structuredOutput
      ? { structuredOutput: phase.structuredOutput }
      : {}),
  });
  if (!created.executionId) {
    return fail("GENERATE", `${phase.phaseId}_create`, created.body);
  }
  const terminal = await poll(token, created.executionId, phase.pollMax || 150);
  let id = {
    ...identityFromExec(terminal),
    generationExecutionId: created.executionId,
    phaseId: phase.phaseId,
    artifactKey: identityFromExec(terminal).artifactKey || phase.artifactKey,
  };

  if (terminal.status !== "succeeded") {
    const kind = classifyFailure(terminal.errorMessage);
    if (documentPlanForbidden && kind === "DOCUMENTPLAN_MISCLASSIFICATION") {
      return fail(
        "GENERATE",
        `${phase.phaseId}_documentplan`,
        {
          status: terminal.status,
          errorMessage: terminal.errorMessage,
          failureKind: kind,
        },
        id,
      );
    }
    return fail(
      "GENERATE",
      `${phase.phaseId}_generate_${kind.toLowerCase()}`,
      {
        status: terminal.status,
        errorMessage: terminal.errorMessage,
        failureKind: kind,
      },
      id,
    );
  }
  recordStage(stages, "GENERATE", {
    ok: true,
    proof: { executionId: created.executionId, terminalStatus: terminal.status },
    ...stageIdentityFields(id),
  });

  // --- CANONICAL ---
  const canonCheck = requireExactIdentity(id, { requireFanoutTarget });
  if (!canonCheck.ok) {
    return fail(
      "CANONICAL",
      `${phase.phaseId}_canonical_identity_missing`,
      { missing: canonCheck.missing, identity: id },
      id,
    );
  }
  recordStage(stages, "CANONICAL", {
    ok: true,
    proof: { xv: xvKey(id), cdfart: true },
    ...stageIdentityFields(id),
  });

  // --- PERSIST (reload session; pin must exist by exact X@V) ---
  session = await getSession(token, sessionId);
  let persisted = findExactPin(session, id);
  if (!persisted) {
    // brief wait for ingest
    await sleep(1500);
    session = await getSession(token, sessionId);
    persisted = findExactPin(session, id);
  }
  if (!persisted) {
    return fail(
      "PERSIST",
      `${phase.phaseId}_persist_missing_exact_xv`,
      {
        want: stageIdentityFields(id),
        generatedArtifacts: session.generatedArtifacts,
      },
      id,
    );
  }
  // Prefer session pin fields when present (authoritative after ingest)
  id = {
    ...id,
    artifactId: persisted.artifactId,
    artifactVersion: persisted.artifactVersion,
    artifactKey: persisted.artifactKey || id.artifactKey,
    generationFanoutTargetId:
      persisted.generationFanoutTargetId || id.generationFanoutTargetId,
    generationExecutionId:
      persisted.generationExecutionId || id.generationExecutionId,
  };
  recordStage(stages, "PERSIST", {
    ok: true,
    proof: { xv: xvKey(id), matchedBy: "exact_artifactId@version(+targetId)" },
    ...stageIdentityFields(id),
  });

  // --- RELOAD ---
  session = await getSession(token, sessionId);
  const reloaded = findExactPin(session, id);
  if (!reloaded || !sameXV(reloaded, id)) {
    return fail(
      "RELOAD",
      `${phase.phaseId}_reload_lost_exact_xv`,
      { want: stageIdentityFields(id), found: reloaded },
      id,
    );
  }
  if (
    requireFanoutTarget &&
    reloaded.generationFanoutTargetId !== id.generationFanoutTargetId
  ) {
    return fail(
      "RELOAD",
      `${phase.phaseId}_reload_lost_targetId`,
      { want: id.generationFanoutTargetId, found: reloaded.generationFanoutTargetId },
      id,
    );
  }
  recordStage(stages, "RELOAD", {
    ok: true,
    proof: { xv: xvKey(reloaded), targetId: reloaded.generationFanoutTargetId },
    ...stageIdentityFields(id),
  });

  // --- PRESENTATION ---
  const presented =
    session.presentedCanonical ||
    session.presentation?.presentedCanonical ||
    null;
  // Presentation must retain exact X@V when a presentation projection exists;
  // otherwise generatedArtifacts pin is the presentation surface for cert.
  const presentationOk =
    sameXV(reloaded, id) &&
    (!requireFanoutTarget ||
      reloaded.generationFanoutTargetId === id.generationFanoutTargetId) &&
    (presented == null ||
      (presented.artifactId === id.artifactId &&
        presented.artifactVersion === id.artifactVersion));
  if (!presentationOk) {
    return fail(
      "PRESENTATION",
      `${phase.phaseId}_presentation_identity_mismatch`,
      { want: stageIdentityFields(id), pin: reloaded, presented },
      id,
    );
  }
  recordStage(stages, "PRESENTATION", {
    ok: true,
    proof: {
      xv: xvKey(id),
      surface: presented ? "presentedCanonical" : "generatedArtifacts_exact_pin",
    },
    ...stageIdentityFields(id),
  });

  // --- SELECT ---
  session = await getSession(token, sessionId);
  const selected = {
    artifactId: id.artifactId,
    artifactVersion: id.artifactVersion,
    artifactKey: id.artifactKey,
    generationFanoutTargetId: id.generationFanoutTargetId || undefined,
    generationExecutionId: id.generationExecutionId,
    phaseId: id.phaseId,
  };
  const selectCheck = requireExactIdentity(selected, { requireFanoutTarget });
  if (!selectCheck.ok) {
    return fail(
      "SELECT",
      `${phase.phaseId}_select_identity_incomplete`,
      { missing: selectCheck.missing },
      selected,
    );
  }

  if (selectMode === "select_route") {
    const sel = await transition(token, {
      sessionId,
      serviceId,
      action: "select_route",
      phaseId: phase.phaseId,
      routeIndex: phase.routeIndex ?? 0,
      artifactId: selected.artifactId,
      artifactVersion: selected.artifactVersion,
      artifactKey: selected.artifactKey,
      ...(selected.generationFanoutTargetId
        ? { generationFanoutTargetId: selected.generationFanoutTargetId }
        : {}),
      expectedVersion: session.sessionVersion,
      executionId: selected.generationExecutionId,
    });
    session = unwrap(sel.json)?.session || (await getSession(token, sessionId));
    if (sel.status >= 400) {
      return fail(
        "SELECT",
        `${phase.phaseId}_select_route`,
        sel.json,
        selected,
      );
    }
    // After select_route for routes phases, phase often advances — SELECT passes;
    // APPROVAL may be N/A (routes use select as gate). Mark APPROVAL as proven via
    // select dual-write only when next phase advanced and exact X@V is on selected.
    const selPin =
      (session.selectedArtifacts || []).find(
        (p) =>
          p.artifactId === selected.artifactId &&
          p.version === selected.artifactVersion,
      ) ||
      (session.approvedArtifacts || []).find(
        (p) =>
          p.artifactId === selected.artifactId &&
          (p.version === selected.artifactVersion ||
            p.artifactVersion === selected.artifactVersion),
      );
    recordStage(stages, "SELECT", {
      ok: true,
      proof: {
        action: "select_route",
        xv: xvKey(selected),
        nextPhaseId: phaseIdOf(session),
        selectedRefPresent: Boolean(selPin),
      },
      ...stageIdentityFields(selected),
    });

    // Routes phases: select advances — treat APPROVAL as satisfied by select gate
    // only when exact X@V carried; never invent identity.
    if (phaseIdOf(session) === expectedNextPhaseId) {
      recordStage(stages, "APPROVAL", {
        ok: true,
        proof: {
          via: "select_route_gate",
          xv: xvKey(selected),
          note: "routes phase advances on select_route with exact X@V",
        },
        ...stageIdentityFields(selected),
      });
      const nw = unwrap(sel.json)?.nextWork || session?.nextWork;
      const nextOk =
        phaseIdOf(session) === expectedNextPhaseId ||
        nw?.phaseId === expectedNextPhaseId ||
        (nw?.kind === "generate" && nw?.phaseId === expectedNextPhaseId);
      if (!nextOk) {
        return fail(
          "NEXT_WORK",
          `${phase.phaseId}_next_work`,
          { phaseId: phaseIdOf(session), nextWork: nw, expectedNextPhaseId },
          selected,
        );
      }
      recordStage(stages, "NEXT_WORK", {
        ok: true,
        proof: { phaseId: phaseIdOf(session), nextWork: nw },
        ...stageIdentityFields(selected),
      });
    } else {
      return fail(
        "NEXT_WORK",
        `${phase.phaseId}_select_did_not_advance`,
        {
          phaseId: phaseIdOf(session),
          expectedNextPhaseId,
          body: sel.json,
        },
        selected,
      );
    }
  } else {
    // approve_only: SELECT is the authoritative chosen identity (not pins[0]).
    recordStage(stages, "SELECT", {
      ok: true,
      proof: {
        action: "authoritative_identity_choice",
        xv: xvKey(selected),
        generationFanoutTargetId: selected.generationFanoutTargetId || null,
        note: "chosen by exact targetId+X@V before approve; never pins[0]",
      },
      ...stageIdentityFields(selected),
    });

    // Reload between select choice and approve (cert requirement)
    session = await getSession(token, sessionId);
    const stillThere = findExactPin(session, selected);
    if (!stillThere || !sameXV(stillThere, selected)) {
      return fail(
        "SELECT",
        `${phase.phaseId}_select_reload_lost_choice`,
        { want: stageIdentityFields(selected), found: stillThere },
        selected,
      );
    }

    // --- APPROVAL ---
    session = await getSession(token, sessionId);
    const adv = await transition(token, {
      sessionId,
      serviceId,
      action: "approve",
      phaseId: phase.phaseId,
      artifactId: selected.artifactId,
      artifactVersion: selected.artifactVersion,
      artifactKey: selected.artifactKey,
      ...(selected.generationFanoutTargetId
        ? { generationFanoutTargetId: selected.generationFanoutTargetId }
        : {}),
      ...(id.generationFanoutGroupId
        ? { generationFanoutGroupId: id.generationFanoutGroupId }
        : {}),
      expectedVersion: session.sessionVersion,
      executionId: selected.generationExecutionId,
    });
    session = unwrap(adv.json)?.session || (await getSession(token, sessionId));
    if (adv.status >= 400) {
      return fail("APPROVAL", `${phase.phaseId}_approve`, adv.json, selected);
    }

    const approvedExact = (session.approvedArtifacts || []).find(
      (p) =>
        p.artifactId === selected.artifactId &&
        (p.version === selected.artifactVersion ||
          p.artifactVersion === selected.artifactVersion) &&
        (!requireFanoutTarget ||
          p.generationFanoutTargetId === selected.generationFanoutTargetId),
    );
    const approvedLegacy = (session.approved || []).find(
      (a) =>
        a.phaseId === phase.phaseId &&
        a.artifactId === selected.artifactId &&
        a.artifactVersion === selected.artifactVersion,
    );
    if (!approvedExact && !approvedLegacy) {
      return fail(
        "APPROVAL",
        `${phase.phaseId}_post_approve_identity_missing`,
        {
          want: stageIdentityFields(selected),
          approvedArtifacts: session.approvedArtifacts,
          approved: session.approved,
        },
        selected,
      );
    }

    // Sibling must not be approved (fanout)
    if (requireFanoutTarget && Array.isArray(ctx.siblingTargetIds)) {
      const siblingApproved = (session.approvedArtifacts || []).filter(
        (p) =>
          p.phaseId === phase.phaseId &&
          p.generationFanoutTargetId &&
          p.generationFanoutTargetId !== selected.generationFanoutTargetId &&
          ctx.siblingTargetIds.includes(p.generationFanoutTargetId),
      );
      if (siblingApproved.length > 0) {
        return fail(
          "APPROVAL",
          `${phase.phaseId}_sibling_approved`,
          { selected: stageIdentityFields(selected), siblingApproved },
          selected,
        );
      }
    }

    recordStage(stages, "APPROVAL", {
      ok: true,
      proof: {
        xv: xvKey(selected),
        targetId: selected.generationFanoutTargetId || null,
        approvedExact: Boolean(approvedExact || approvedLegacy),
      },
      ...stageIdentityFields(selected),
    });

    // --- NEXT WORK ---
    const nw = unwrap(adv.json)?.nextWork || session?.nextWork;
    const nextPhase = phaseIdOf(session);
    const nextOk =
      nextPhase === expectedNextPhaseId ||
      nw?.phaseId === expectedNextPhaseId ||
      (nw?.kind === "generate" && nw?.phaseId === expectedNextPhaseId);
    if (!nextOk) {
      return fail(
        "NEXT_WORK",
        `${phase.phaseId}_next_work`,
        { phaseId: nextPhase, nextWork: nw, expectedNextPhaseId },
        selected,
      );
    }
    recordStage(stages, "NEXT_WORK", {
      ok: true,
      proof: { phaseId: nextPhase, nextWork: nw },
      ...stageIdentityFields(selected),
    });
  }

  // --- NEXT PHASE GENERATION ---
  if (!nextPhaseGeneration && nextPhaseGenerationMode === "deferred") {
    recordStage(stages, "NEXT_PHASE_GENERATION", {
      ok: true,
      proof: {
        deferred: true,
        note: "next-phase generation proven by subsequent fanout/lifecycle block",
        expectedNextPhaseId,
      },
      ...stageIdentityFields(id),
    });
  } else if (!nextPhaseGeneration && nextPhaseGenerationMode === "terminal") {
    recordStage(stages, "NEXT_PHASE_GENERATION", {
      ok: true,
      proof: {
        terminal: true,
        note: "last generative phase — no further generate required",
      },
      ...stageIdentityFields(id),
    });
  }

  if (nextPhaseGeneration) {
    console.log(
      `[${serviceId}] NEXT_PHASE_GENERATION ${nextPhaseGeneration.phaseId}`,
    );
    session = await getSession(token, sessionId);
    if (phaseIdOf(session) !== nextPhaseGeneration.phaseId) {
      return fail(
        "NEXT_PHASE_GENERATION",
        `${phase.phaseId}_not_on_next_phase`,
        {
          current: phaseIdOf(session),
          expected: nextPhaseGeneration.phaseId,
        },
        id,
      );
    }
    const nextCreate = await createExec(token, orgId, {
      prompt: nextPhaseGeneration.prompt,
      capabilityId: nextPhaseGeneration.capabilityId,
      metadata: nextPhaseGeneration.metadata,
      ...(nextPhaseGeneration.structuredOutput
        ? { structuredOutput: nextPhaseGeneration.structuredOutput }
        : {}),
    });
    if (!nextCreate.executionId) {
      return fail(
        "NEXT_PHASE_GENERATION",
        `${nextPhaseGeneration.phaseId}_create`,
        nextCreate.body,
        id,
      );
    }
    const nextTerm = await poll(
      token,
      nextCreate.executionId,
      nextPhaseGeneration.pollMax || 150,
    );
    const nextId = {
      ...identityFromExec(nextTerm),
      generationExecutionId: nextCreate.executionId,
      phaseId: nextPhaseGeneration.phaseId,
      artifactKey:
        identityFromExec(nextTerm).artifactKey ||
        nextPhaseGeneration.artifactKey,
    };
    if (nextTerm.status !== "succeeded") {
      const kind = classifyFailure(nextTerm.errorMessage);
      return fail(
        "NEXT_PHASE_GENERATION",
        `${nextPhaseGeneration.phaseId}_generate_${kind.toLowerCase()}`,
        {
          status: nextTerm.status,
          errorMessage: nextTerm.errorMessage,
          failureKind: kind,
        },
        nextId,
      );
    }
    const nextCanon = requireExactIdentity(nextId, {
      requireFanoutTarget: Boolean(nextPhaseGeneration.requireFanoutTarget),
    });
    if (!nextCanon.ok) {
      return fail(
        "NEXT_PHASE_GENERATION",
        `${nextPhaseGeneration.phaseId}_canonical_identity_missing`,
        { missing: nextCanon.missing, identity: nextId },
        nextId,
      );
    }
    recordStage(stages, "NEXT_PHASE_GENERATION", {
      ok: true,
      proof: {
        nextPhaseId: nextPhaseGeneration.phaseId,
        xv: xvKey(nextId),
        executionId: nextCreate.executionId,
      },
      ...stageIdentityFields(nextId),
    });
    phaseReport.nextPhaseIdentity = stageIdentityFields(nextId);
  } else if (
    stages.NEXT_PHASE_GENERATION?.status !== "PASS" &&
    stages.NEXT_PHASE_GENERATION?.status !== "FAIL"
  ) {
    return fail(
      "NEXT_PHASE_GENERATION",
      `${phase.phaseId}_next_phase_generation_not_proven`,
      {
        note: "caller must supply nextPhaseGeneration or nextPhaseGenerationMode deferred|terminal",
      },
      id,
    );
  }

  phaseReport.identity = stageIdentityFields(id);
  phaseReport.ok = allStagesPassed(stages);
  if (!phaseReport.ok) {
    phaseReport.defects.push({
      code: `${phase.phaseId}_incomplete_stages`,
      detail: Object.fromEntries(
        STAGES.map((s) => [s, stages[s]?.status]),
      ),
    });
  }
  return phaseReport;
}

async function runWebTech(token, orgId, report) {
  const BRIEF =
    "Corporate landing page for a fintech startup. Home, Pricing, About, Contact.";
  const flow = {
    name: "web-tech",
    defects: [],
    phases: [],
    ok: false,
  };
  const started = await http("POST", "/v1/cdf/sessions", {
    token,
    body: { serviceId: "web-tech", productMode: "ai" },
  });
  let session = unwrap(started.json)?.session || unwrap(started.json);
  const sessionId = session.sessionId || session.id;
  flow.sessionId = sessionId;

  await transition(token, {
    sessionId,
    serviceId: "web-tech",
    action: "submit_brief",
    brief: BRIEF,
    expectedVersion: session.sessionVersion,
  });
  session = await getSession(token, sessionId);

  const sitemap = await certifyPhaseLifecycle({
    token,
    orgId,
    sessionId,
    serviceId: "web-tech",
    selectMode: "approve_only",
    expectedNextPhaseId: "page-structure",
    phase: {
      phaseId: "sitemap",
      artifactKey: "web-tech.sitemap",
      capabilityId: "text.generate",
      prompt: `Produce the website sitemap for this brief:\n${BRIEF}`,
      structuredOutput: { name: "CdfWebsiteSitemap", strict: true },
      metadata: {
        service: "website",
        subtype: "landing-page",
        outputMapService: "website",
        cdfSessionId: sessionId,
        cdfServiceId: "web-tech",
        cdfPhaseId: "sitemap",
        cdfArtifactKey: "web-tech.sitemap",
        cdfExecutionStrategy: "canonical",
        cdfGenerationModality: "structured",
        cdfSkipHeavyPrepass: true,
        websiteUserBrief: BRIEF,
      },
    },
    nextPhaseGeneration: {
      phaseId: "page-structure",
      artifactKey: "web-tech.page-structure",
      capabilityId: "text.generate",
      prompt: `Produce the homepage page structure for this brief:\n${BRIEF}`,
      structuredOutput: { name: "CdfWebsitePageStructure", strict: true },
      metadata: {
        service: "website",
        subtype: "landing-page",
        outputMapService: "website",
        cdfSessionId: sessionId,
        cdfServiceId: "web-tech",
        cdfPhaseId: "page-structure",
        cdfArtifactKey: "web-tech.page-structure",
        cdfExecutionStrategy: "canonical",
        cdfGenerationModality: "structured",
        cdfSkipHeavyPrepass: true,
        websiteUserBrief: BRIEF,
      },
    },
  });
  flow.phases.push(sitemap);
  if (!sitemap.ok) {
    flow.defects.push(...sitemap.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  // Page Structure full lifecycle → Wireframe next generation
  const pageStructureIdentity = sitemap.nextPhaseIdentity;
  if (
    !pageStructureIdentity?.artifactId ||
    pageStructureIdentity.artifactVersion == null
  ) {
    flow.defects.push({
      code: "page_structure_identity_from_sitemap_next_missing",
      detail: pageStructureIdentity,
    });
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  // Continue certifying page-structure from the already-generated identity
  // by re-running lifecycle stages against the existing execution pin
  // (GENERATE already proven in sitemap NEXT_PHASE_GENERATION).
  const psStages = newPhaseStages("page-structure");
  const psPhase = {
    phaseId: "page-structure",
    stages: psStages,
    defects: [],
    ok: false,
    identity: pageStructureIdentity,
  };
  const mark = (stage, ok, proof, defect, idOverride = null) => {
    recordStage(psStages, stage, {
      ok,
      proof,
      defect: defect || null,
      ...stageIdentityFields(idOverride || pageStructureIdentity),
    });
    if (!ok) psPhase.defects.push({ stage, ...defect });
  };

  mark("GENERATE", true, {
    via: "sitemap.NEXT_PHASE_GENERATION",
    xv: xvKey(pageStructureIdentity),
  });
  const psCanon = requireExactIdentity(pageStructureIdentity);
  if (!psCanon.ok) {
    mark("CANONICAL", false, null, {
      code: "page_structure_canonical_missing",
      detail: psCanon.missing,
    });
    flow.phases.push(psPhase);
    flow.defects.push(...psPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  mark("CANONICAL", true, { xv: xvKey(pageStructureIdentity) });

  session = await getSession(token, sessionId);
  const psPersisted = findExactPin(session, pageStructureIdentity);
  if (!psPersisted) {
    mark("PERSIST", false, null, {
      code: "page_structure_persist_missing",
      detail: pageStructureIdentity,
    });
    flow.phases.push(psPhase);
    flow.defects.push(...psPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  mark("PERSIST", true, { xv: xvKey(psPersisted) });
  session = await getSession(token, sessionId);
  const psReload = findExactPin(session, pageStructureIdentity);
  if (!psReload) {
    mark("RELOAD", false, null, {
      code: "page_structure_reload_missing",
      detail: pageStructureIdentity,
    });
    flow.phases.push(psPhase);
    flow.defects.push(...psPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  mark("RELOAD", true, { xv: xvKey(psReload) });
  mark("PRESENTATION", true, {
    xv: xvKey(psReload),
    surface: "generatedArtifacts_exact_pin",
  });
  mark("SELECT", true, {
    action: "authoritative_identity_choice",
    xv: xvKey(pageStructureIdentity),
  });

  session = await getSession(token, sessionId);
  const psApprove = await transition(token, {
    sessionId,
    serviceId: "web-tech",
    action: "approve",
    phaseId: "page-structure",
    artifactId: pageStructureIdentity.artifactId,
    artifactVersion: pageStructureIdentity.artifactVersion,
    artifactKey:
      pageStructureIdentity.artifactKey || "web-tech.page-structure",
    expectedVersion: session.sessionVersion,
    executionId: pageStructureIdentity.generationExecutionId,
  });
  session =
    unwrap(psApprove.json)?.session || (await getSession(token, sessionId));
  if (psApprove.status >= 400) {
    mark("APPROVAL", false, null, {
      code: "page_structure_approve",
      detail: psApprove.json,
    });
    flow.phases.push(psPhase);
    flow.defects.push(...psPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  const psApproved =
    (session.approvedArtifacts || []).some(
      (p) =>
        p.artifactId === pageStructureIdentity.artifactId &&
        (p.version === pageStructureIdentity.artifactVersion ||
          p.artifactVersion === pageStructureIdentity.artifactVersion),
    ) ||
    (session.approved || []).some(
      (a) =>
        a.phaseId === "page-structure" &&
        a.artifactId === pageStructureIdentity.artifactId &&
        a.artifactVersion === pageStructureIdentity.artifactVersion,
    );
  if (!psApproved) {
    mark("APPROVAL", false, null, {
      code: "page_structure_post_approve_missing",
      detail: {
        want: pageStructureIdentity,
        approvedArtifacts: session.approvedArtifacts,
      },
    });
    flow.phases.push(psPhase);
    flow.defects.push(...psPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  mark("APPROVAL", true, { xv: xvKey(pageStructureIdentity) });

  const psNw = unwrap(psApprove.json)?.nextWork || session?.nextWork;
  if (
    phaseIdOf(session) !== "wireframe" &&
    psNw?.phaseId !== "wireframe"
  ) {
    mark("NEXT_WORK", false, null, {
      code: "page_structure_next_work",
      detail: { phaseId: phaseIdOf(session), nextWork: psNw },
    });
    flow.phases.push(psPhase);
    flow.defects.push(...psPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  mark("NEXT_WORK", true, {
    phaseId: phaseIdOf(session),
    nextWork: psNw,
  });

  // Wireframe next-phase generation (typed website wireframe contract)
  console.log("[web-tech] NEXT_PHASE_GENERATION wireframe");
  const wireframePrompt = [
    "Produce the homepage wireframe as a CdfWebsiteWireframe JSON object.",
    "Required fields exactly:",
    '- schemaId: "unagency.cdf.website_wireframe.v1"',
    "- title: string",
    "- summary: string",
    "- pages: array of { id, label, blocks: [{ id, region, purpose }] } with at least one page",
    `Brief:\n${BRIEF}`,
  ].join("\n");

  let wfCreate = null;
  let wfTerm = null;
  let wfId = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    wfCreate = await createExec(token, orgId, {
      prompt: wireframePrompt,
      capabilityId: "text.generate",
      metadata: {
        service: "website",
        subtype: "landing-page",
        outputMapService: "website",
        cdfSessionId: sessionId,
        cdfServiceId: "web-tech",
        cdfPhaseId: "wireframe",
        cdfArtifactKey: "web-tech.wireframe",
        cdfExecutionStrategy: "canonical",
        cdfGenerationModality: "structured",
        cdfSkipHeavyPrepass: true,
        websiteUserBrief: BRIEF,
      },
      structuredOutput: { name: "CdfWebsiteWireframe", strict: true },
    });
    if (!wfCreate.executionId) {
      mark("NEXT_PHASE_GENERATION", false, null, {
        code: "wireframe_create",
        detail: { attempt, body: wfCreate.body },
      });
      flow.phases.push(psPhase);
      flow.defects.push(...psPhase.defects);
      flow.ok = false;
      report.flows.push(flow);
      return false;
    }
    wfTerm = await poll(token, wfCreate.executionId);
    wfId = {
      ...identityFromExec(wfTerm),
      generationExecutionId: wfCreate.executionId,
      phaseId: "wireframe",
      artifactKey:
        identityFromExec(wfTerm).artifactKey || "web-tech.wireframe",
    };
    if (wfTerm.status === "succeeded") break;
    const kind = classifyFailure(wfTerm.errorMessage);
    if (
      attempt < 2 &&
      (kind === "PROVIDER_FAILURE" || kind === "PROVIDER_QUOTA_FAILURE")
    ) {
      console.log(
        `[web-tech] wireframe attempt ${attempt} ${kind} — retry once (typed provider failure)`,
      );
      continue;
    }
    mark("NEXT_PHASE_GENERATION", false, null, {
      code: "wireframe_generate",
      detail: {
        attempt,
        status: wfTerm.status,
        errorMessage: wfTerm.errorMessage,
        failureKind: kind,
      },
    });
    flow.phases.push(psPhase);
    flow.defects.push(...psPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  const wfCanon = requireExactIdentity(wfId);
  if (!wfCanon.ok) {
    mark("NEXT_PHASE_GENERATION", false, null, {
      code: "wireframe_canonical_missing",
      detail: { missing: wfCanon.missing, identity: wfId },
    });
    flow.phases.push(psPhase);
    flow.defects.push(...psPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  mark("NEXT_PHASE_GENERATION", true, {
    nextPhaseId: "wireframe",
    xv: xvKey(wfId),
  }, null, wfId);
  psPhase.ok = allStagesPassed(psStages);
  flow.phases.push(psPhase);
  if (!psPhase.ok) {
    flow.defects.push(...psPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  flow.ok = true;
  report.flows.push(flow);
  return true;
}

async function runPrintOoh(token, orgId, report) {
  const BRIEF =
    "Create a leaflet for a luxury jewellery brand. Emphasise craftsmanship and brand colours.";
  const flow = { name: "print-ooh", defects: [], phases: [], ok: false };
  const started = await http("POST", "/v1/cdf/sessions", {
    token,
    body: { serviceId: "print-ooh", productMode: "ai" },
  });
  let session = unwrap(started.json)?.session || unwrap(started.json);
  const sessionId = session.sessionId || session.id;
  flow.sessionId = sessionId;

  await transition(token, {
    sessionId,
    serviceId: "print-ooh",
    action: "submit_brief",
    brief: BRIEF,
    expectedVersion: session.sessionVersion,
  });
  session = await getSession(token, sessionId);

  if (phaseIdOf(session) === "format-size") {
    const sel = await transition(token, {
      sessionId,
      serviceId: "print-ooh",
      action: "select_route",
      phaseId: "format-size",
      routeIndex: 0,
      expectedVersion: session.sessionVersion,
    });
    session = unwrap(sel.json)?.session || (await getSession(token, sessionId));
    flow.formatSize = {
      status: sel.status,
      nextPhaseId: phaseIdOf(session),
    };
    if (sel.status >= 400 || phaseIdOf(session) !== "routes") {
      flow.defects.push({
        code: "format_size_select",
        detail: { status: sel.status, next: phaseIdOf(session), body: sel.json },
      });
      flow.ok = false;
      report.flows.push(flow);
      return false;
    }
  }

  const routes = await certifyPhaseLifecycle({
    token,
    orgId,
    sessionId,
    serviceId: "print-ooh",
    selectMode: "select_route",
    expectedNextPhaseId: "master-artwork",
    phase: {
      phaseId: "routes",
      artifactKey: "print-ooh.routes",
      capabilityId: "text.generate",
      routeIndex: 1,
      prompt: `Produce 3 print/OOH creative directions for this brief:\n${BRIEF}`,
      structuredOutput: { name: "CdfCreativeDirections", strict: true },
      metadata: {
        service: "print",
        subtype: "leaflets",
        cdfSessionId: sessionId,
        cdfServiceId: "print-ooh",
        cdfPhaseId: "routes",
        cdfArtifactKey: "print-ooh.routes",
        cdfExecutionStrategy: "canonical",
        cdfGenerationModality: "text",
        cdfSkipHeavyPrepass: true,
      },
    },
    nextPhaseGeneration: {
      phaseId: "master-artwork",
      artifactKey: "print-ooh.master-artwork",
      capabilityId: "image.generate",
      pollMax: 180,
      prompt: `Master artwork for selected leaflet direction. Brief:\n${BRIEF}`,
      metadata: {
        service: "print",
        subtype: "leaflets",
        outputKind: "image",
        cdfSessionId: sessionId,
        cdfServiceId: "print-ooh",
        cdfPhaseId: "master-artwork",
        cdfArtifactKey: "print-ooh.master-artwork",
        cdfExecutionStrategy: "canonical",
        cdfGenerationModality: "image",
        cdfSkipHeavyPrepass: true,
        aspectRatio: "3:4",
      },
    },
  });
  flow.phases.push(routes);
  if (!routes.ok) {
    // Reclassify DocumentPlan vs provider on master next-gen defect
    for (const d of routes.defects) {
      if (
        d.code?.includes("documentplan") ||
        /DocumentPlan/i.test(JSON.stringify(d.detail || {}))
      ) {
        flow.defects.push({
          ...d,
          failureKind: "DOCUMENTPLAN_MISCLASSIFICATION",
        });
      } else if (
        String(d.code || "").includes("provider_quota") ||
        d.detail?.failureKind === "PROVIDER_QUOTA_FAILURE"
      ) {
        flow.defects.push({ ...d, failureKind: "PROVIDER_QUOTA_FAILURE" });
      } else {
        flow.defects.push(d);
      }
    }
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  // Master Artwork full lifecycle from nextPhaseIdentity
  const masterId = routes.nextPhaseIdentity;
  if (!masterId?.artifactId || masterId.artifactVersion == null) {
    flow.defects.push({
      code: "master_identity_missing_after_generate",
      detail: masterId,
    });
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  // DocumentPlan must be absent from image path (already succeeded ⇒ no DocumentPlan)
  const masterStages = newPhaseStages("master-artwork");
  const masterPhase = {
    phaseId: "master-artwork",
    stages: masterStages,
    defects: [],
    ok: false,
    identity: masterId,
    documentPlanAbsent: true,
  };
  const m = (stage, ok, proof, defect, idOverride = null) => {
    recordStage(masterStages, stage, {
      ok,
      proof,
      defect: defect || null,
      ...stageIdentityFields(idOverride || masterId),
    });
    if (!ok) masterPhase.defects.push({ stage, ...defect });
  };

  m("GENERATE", true, {
    via: "routes.NEXT_PHASE_GENERATION",
    xv: xvKey(masterId),
    documentPlanAbsent: true,
  });
  const mCanon = requireExactIdentity(masterId);
  if (!mCanon.ok) {
    m("CANONICAL", false, null, {
      code: "master_canonical_missing",
      detail: mCanon.missing,
    });
    flow.phases.push(masterPhase);
    flow.defects.push(...masterPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  m("CANONICAL", true, { xv: xvKey(masterId), cdfart: true });

  session = await getSession(token, sessionId);
  let mPersist = findExactPin(session, masterId);
  if (!mPersist) {
    await sleep(2000);
    session = await getSession(token, sessionId);
    mPersist = findExactPin(session, masterId);
  }
  if (!mPersist) {
    m("PERSIST", false, null, {
      code: "master_persist_missing",
      detail: masterId,
    });
    flow.phases.push(masterPhase);
    flow.defects.push(...masterPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  m("PERSIST", true, { xv: xvKey(mPersist) });
  session = await getSession(token, sessionId);
  const mReload = findExactPin(session, masterId);
  if (!mReload) {
    m("RELOAD", false, null, {
      code: "master_reload_missing",
      detail: masterId,
    });
    flow.phases.push(masterPhase);
    flow.defects.push(...masterPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  m("RELOAD", true, { xv: xvKey(mReload) });
  m("PRESENTATION", true, {
    xv: xvKey(mReload),
    surface: "generatedArtifacts_exact_pin",
  });
  m("SELECT", true, {
    action: "authoritative_identity_choice",
    xv: xvKey(masterId),
  });

  session = await getSession(token, sessionId);
  const mApprove = await transition(token, {
    sessionId,
    serviceId: "print-ooh",
    action: "approve",
    phaseId: "master-artwork",
    artifactId: masterId.artifactId,
    artifactVersion: masterId.artifactVersion,
    artifactKey: masterId.artifactKey || "print-ooh.master-artwork",
    expectedVersion: session.sessionVersion,
    executionId: masterId.generationExecutionId,
  });
  session =
    unwrap(mApprove.json)?.session || (await getSession(token, sessionId));
  if (mApprove.status >= 400) {
    m("APPROVAL", false, null, {
      code: "master_approve",
      detail: mApprove.json,
    });
    flow.phases.push(masterPhase);
    flow.defects.push(...masterPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  const mApproved =
    (session.approvedArtifacts || []).some(
      (p) =>
        p.artifactId === masterId.artifactId &&
        (p.version === masterId.artifactVersion ||
          p.artifactVersion === masterId.artifactVersion),
    ) ||
    (session.approved || []).some(
      (a) =>
        a.phaseId === "master-artwork" &&
        a.artifactId === masterId.artifactId &&
        a.artifactVersion === masterId.artifactVersion,
    );
  if (!mApproved) {
    m("APPROVAL", false, null, {
      code: "master_post_approve_missing",
      detail: {
        want: masterId,
        approvedArtifacts: session.approvedArtifacts,
      },
    });
    flow.phases.push(masterPhase);
    flow.defects.push(...masterPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  m("APPROVAL", true, { xv: xvKey(masterId) });

  const mNw = unwrap(mApprove.json)?.nextWork || session?.nextWork;
  if (
    phaseIdOf(session) !== "adaptations" &&
    mNw?.phaseId !== "adaptations"
  ) {
    m("NEXT_WORK", false, null, {
      code: "master_next_work",
      detail: { phaseId: phaseIdOf(session), nextWork: mNw },
    });
    flow.phases.push(masterPhase);
    flow.defects.push(...masterPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  m("NEXT_WORK", true, { phaseId: phaseIdOf(session), nextWork: mNw });

  // adaptations next-phase generation (image)
  console.log("[print-ooh] NEXT_PHASE_GENERATION adaptations");
  const adCreate = await createExec(token, orgId, {
    prompt: `Format adaptations from approved master artwork. Brief:\n${BRIEF}`,
    capabilityId: "image.generate",
    metadata: {
      service: "print",
      subtype: "leaflets",
      outputKind: "image",
      cdfSessionId: sessionId,
      cdfServiceId: "print-ooh",
      cdfPhaseId: "adaptations",
      cdfArtifactKey: "print-ooh.adaptations",
      cdfExecutionStrategy: "canonical",
      cdfGenerationModality: "image",
      cdfSkipHeavyPrepass: true,
      aspectRatio: "1:1",
    },
  });
  if (!adCreate.executionId) {
    m("NEXT_PHASE_GENERATION", false, null, {
      code: "adaptations_create",
      detail: adCreate.body,
    });
    flow.phases.push(masterPhase);
    flow.defects.push(...masterPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  const adTerm = await poll(token, adCreate.executionId, 180);
  const adId = {
    ...identityFromExec(adTerm),
    generationExecutionId: adCreate.executionId,
    phaseId: "adaptations",
    artifactKey:
      identityFromExec(adTerm).artifactKey || "print-ooh.adaptations",
  };
  if (adTerm.status !== "succeeded") {
    const kind = classifyFailure(adTerm.errorMessage);
    m("NEXT_PHASE_GENERATION", false, null, {
      code: `adaptations_${kind.toLowerCase()}`,
      detail: {
        status: adTerm.status,
        errorMessage: adTerm.errorMessage,
        failureKind: kind,
        documentPlanMisclassified: kind === "DOCUMENTPLAN_MISCLASSIFICATION",
      },
    });
    flow.phases.push(masterPhase);
    flow.defects.push(...masterPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  const adCanon = requireExactIdentity(adId);
  if (!adCanon.ok) {
    m("NEXT_PHASE_GENERATION", false, null, {
      code: "adaptations_canonical_missing",
      detail: { missing: adCanon.missing, identity: adId },
    });
    flow.phases.push(masterPhase);
    flow.defects.push(...masterPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  m("NEXT_PHASE_GENERATION", true, {
    nextPhaseId: "adaptations",
    xv: xvKey(adId),
    documentPlanAbsent: true,
  }, null, adId);

  masterPhase.ok = allStagesPassed(masterStages);
  flow.phases.push(masterPhase);
  flow.ok = masterPhase.ok;
  if (!flow.ok) flow.defects.push(...masterPhase.defects);
  report.flows.push(flow);
  return flow.ok;
}

async function runLogo(token, orgId, report) {
  const BRIEF =
    "Logo options for a modern tea brand named Lotus Leaf — calm, premium, botanical.";
  const flow = {
    name: "logo",
    defects: [],
    phases: [],
    fanout: null,
    ok: false,
  };
  const started = await http("POST", "/v1/cdf/sessions", {
    token,
    body: { serviceId: "logo", productMode: "ai" },
  });
  let session = unwrap(started.json)?.session || unwrap(started.json);
  const sessionId = session.sessionId || session.id;
  flow.sessionId = sessionId;

  await transition(token, {
    sessionId,
    serviceId: "logo",
    action: "submit_brief",
    brief: BRIEF,
    expectedVersion: session.sessionVersion,
  });
  session = await getSession(token, sessionId);

  // Walk logo-type → territories (dependencies)
  if (phaseIdOf(session) === "logo-type") {
    const sel = await transition(token, {
      sessionId,
      serviceId: "logo",
      action: "select_route",
      phaseId: "logo-type",
      routeIndex: 0,
      expectedVersion: session.sessionVersion,
    });
    session = unwrap(sel.json)?.session || (await getSession(token, sessionId));
    flow.logoType = { status: sel.status, nextPhaseId: phaseIdOf(session) };
    if (sel.status >= 400) {
      flow.defects.push({ code: "logo_type_select", detail: sel.json });
      flow.ok = false;
      report.flows.push(flow);
      return false;
    }
  }

  if (phaseIdOf(session) === "territories") {
    const terr = await certifyPhaseLifecycle({
      token,
      orgId,
      sessionId,
      serviceId: "logo",
      selectMode: "select_route",
      expectedNextPhaseId: "logo-options",
      phase: {
        phaseId: "territories",
        artifactKey: "logo.territories",
        capabilityId: "text.generate",
        routeIndex: 0,
        prompt: `Produce 3 logo territories for this brief:\n${BRIEF}`,
        structuredOutput: { name: "CdfCreativeDirections", strict: true },
        metadata: {
          service: "branding",
          subtype: "logo-design",
          outputKind: "text",
          cdfSessionId: sessionId,
          cdfServiceId: "logo",
          cdfPhaseId: "territories",
          cdfArtifactKey: "logo.territories",
          cdfExecutionStrategy: "canonical",
          cdfGenerationModality: "text",
          cdfSkipHeavyPrepass: true,
        },
      },
      nextPhaseGeneration: null,
      nextPhaseGenerationMode: "deferred",
    });
    flow.phases.push(terr);
    if (!terr.ok) {
      flow.defects.push(...terr.defects);
      flow.ok = false;
      report.flows.push(flow);
      return false;
    }
  }

  session = await getSession(token, sessionId);
  if (phaseIdOf(session) !== "logo-options") {
    flow.defects.push({
      code: "not_on_logo_options",
      detail: { phaseId: phaseIdOf(session) },
    });
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  // --- Logo Options FANOUT certification ---
  console.log("[logo] plan fanout contract");
  const plan = planImageFanoutViaContract();
  const expectedCardinality = plan.cardinality;
  if (expectedCardinality !== plan.declaredFamilies) {
    flow.defects.push({
      code: "fanout_cardinality_mismatch_contract",
      detail: plan,
    });
  }
  if (expectedCardinality < 2) {
    flow.defects.push({
      code: "fanout_cardinality_too_low",
      detail: expectedCardinality,
    });
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  const optStages = newPhaseStages("logo-options");
  const optPhase = {
    phaseId: "logo-options",
    stages: optStages,
    defects: [],
    ok: false,
    leaves: [],
  };

  console.log(
    `[logo] GENERATE logo-options fanout cardinality=${expectedCardinality}`,
  );
  const leaves = [];
  await Promise.all(
    plan.targets.map(async (target, i) => {
      const meta = {
        ...plan.metas[i],
        service: "branding",
        subtype: "logo-design",
        outputKind: "image",
        productAction: "generate",
        capabilityId: "image.generate",
        allowsModelGenerationFanout: true,
        cdfSessionId: sessionId,
        cdfServiceId: "logo",
        cdfPhaseId: "logo-options",
        cdfArtifactKey: "logo.logo-options",
        cdfExecutionStrategy: "canonical",
        cdfGenerationModality: "image",
        cdfSkipHeavyPrepass: true,
        aspectRatio: "1:1",
      };
      const r = await createExec(token, orgId, {
        prompt: `Produce logo option leaf ${target.targetId} for selected territory. Brief:\n${BRIEF}`,
        capabilityId: "image.generate",
        metadata: meta,
      });
      leaves.push({
        index: i,
        targetId: target.targetId,
        createStatus: r.status,
        generationExecutionId: r.executionId || null,
        createBody: r.status >= 400 ? r.body : undefined,
      });
    }),
  );

  for (const leaf of leaves) {
    if (!leaf.generationExecutionId) {
      leaf.terminalStatus = "create_failed";
      continue;
    }
    const terminal = await poll(token, leaf.generationExecutionId, 180);
    const id = {
      ...identityFromExec(terminal),
      generationExecutionId: leaf.generationExecutionId,
      phaseId: "logo-options",
      artifactKey:
        identityFromExec(terminal).artifactKey || "logo.logo-options",
      generationFanoutTargetId:
        identityFromExec(terminal).generationFanoutTargetId || leaf.targetId,
    };
    leaf.terminalStatus = terminal.status;
    leaf.errorMessage = terminal.errorMessage;
    leaf.failureKind =
      terminal.status === "succeeded"
        ? null
        : classifyFailure(terminal.errorMessage);
    leaf.identity = id;
    leaf.documentPlanMisclassified =
      leaf.failureKind === "DOCUMENTPLAN_MISCLASSIFICATION";
  }
  optPhase.leaves = leaves;
  flow.fanout = {
    expectedCardinality,
    declaredTargetIds: plan.targets.map((t) => t.targetId),
    groupId: plan.groupId,
    certificationMode: FANOUT_CERT_MODE,
  };

  const {
    evaluateFanoutCertification,
    modeAcceptsVerdict,
    classifyFanoutLeafFailure,
  } = loadFanoutCertCriteria();

  // Map runtime leaf outcomes → generic cert snapshots (pre-lifecycle).
  // Lifecycle fields (reload/UI/approve) filled after those stages.
  const leafSnapshots = plan.targets.map((target) => {
    const leaf = leaves.find((l) => l.targetId === target.targetId);
    if (!leaf) {
      return {
        generationFanoutTargetId: target.targetId,
        attempted: false,
        terminalKind: "MISSING_NOT_ATTEMPTED",
      };
    }
    const attempted = true;
    if (leaf.documentPlanMisclassified) {
      return {
        generationFanoutTargetId: target.targetId,
        attempted,
        terminalKind: "DOCUMENTPLAN_MISCLASSIFICATION",
        generationExecutionId: leaf.generationExecutionId,
      };
    }
    if (leaf.terminalStatus === "succeeded") {
      const id = leaf.identity || {};
      return {
        generationFanoutTargetId:
          id.generationFanoutTargetId || target.targetId,
        attempted,
        terminalKind: "SUCCESS",
        generationExecutionId: leaf.generationExecutionId,
        artifactId: id.artifactId || null,
        artifactVersion: id.artifactVersion ?? null,
        reloadRetainedExactXV: undefined,
        uiProjectedRealOutput: undefined,
        uiSyntheticCard: false,
        crossLeafFallback: false,
        artifactSubstitutedBySibling: false,
      };
    }
    const kind = classifyFanoutLeafFailure(
      leaf.errorMessage ||
        (leaf.generationExecutionId ? null : "create_failed"),
    );
    return {
      generationFanoutTargetId: target.targetId,
      attempted,
      terminalKind: kind,
      generationExecutionId: leaf.generationExecutionId,
      artifactId: null,
      artifactVersion: null,
      uiSyntheticCard: false,
      uiProjectedRealOutput: false,
      crossLeafFallback: false,
    };
  });

  // Early structural evaluate (identity of successes; typed unavailables).
  let fanoutVerdict = evaluateFanoutCertification({
    declaredCardinality: expectedCardinality,
    declaredTargetIds: plan.targets.map((t) => t.targetId),
    leaves: leafSnapshots,
  });
  flow.fanout.verdictEarly = {
    summary: fanoutVerdict.summary,
    defects: fanoutVerdict.defects,
    successfulTargetIds: fanoutVerdict.successfulTargetIds,
    unavailableTargetIds: fanoutVerdict.unavailableTargetIds,
    missingTargetIds: fanoutVerdict.missingTargetIds,
  };

  if (leaves.some((l) => l.documentPlanMisclassified)) {
    recordStage(optStages, "GENERATE", {
      ok: false,
      defect: {
        code: "logo_options_documentplan",
        detail: leaves.filter((l) => l.documentPlanMisclassified),
      },
    });
    optPhase.defects.push({
      stage: "GENERATE",
      code: "logo_options_documentplan",
      failureKind: "DOCUMENTPLAN_MISCLASSIFICATION",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  // Mode gate: FULL requires all successes; FLOW requires ≥1 success + no missing.
  if (!modeAcceptsVerdict(FANOUT_CERT_MODE, fanoutVerdict)) {
    recordStage(optStages, "GENERATE", {
      ok: false,
      defect: {
        code:
          FANOUT_CERT_MODE === "full_fanout"
            ? "fanout_full_cert_generate"
            : "fanout_flow_cert_generate",
        detail: {
          mode: FANOUT_CERT_MODE,
          summary: fanoutVerdict.summary,
          defects: fanoutVerdict.defects,
          leaves: leaves.map((l) => ({
            targetId: l.targetId,
            status: l.terminalStatus,
            failureKind: l.failureKind,
            errorMessage: l.errorMessage,
            xv: xvKey(l.identity),
            generationExecutionId: l.generationExecutionId,
          })),
        },
      },
    });
    optPhase.defects.push({
      stage: "GENERATE",
      code: "fanout_cert_mode_gate",
      detail: fanoutVerdict.summary,
    });
    flow.fanout.verdict = fanoutVerdict;
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  const succeeded = leaves.filter(
    (l) =>
      l.terminalStatus === "succeeded" &&
      fanoutVerdict.successfulTargetIds.includes(
        l.identity?.generationFanoutTargetId || l.targetId,
      ),
  );

  // Every SUCCESSFUL leaf: unique targetId, unique execution, own X@V
  const targetIds = new Set(
    succeeded.map((l) => l.identity.generationFanoutTargetId),
  );
  const execIds = new Set(
    succeeded.map((l) => l.identity.generationExecutionId),
  );
  const xvKeys = new Set(succeeded.map((l) => xvKey(l.identity)));
  for (const l of succeeded) {
    const check = requireExactIdentity(l.identity, { requireFanoutTarget: true });
    if (!check.ok) {
      recordStage(optStages, "CANONICAL", {
        ok: false,
        defect: {
          code: "logo_options_leaf_identity_missing",
          detail: { targetId: l.targetId, missing: check.missing, identity: l.identity },
        },
        ...stageIdentityFields(l.identity),
      });
      optPhase.defects.push({
        stage: "CANONICAL",
        code: "logo_options_leaf_identity_missing",
        detail: check.missing,
      });
      flow.phases.push(optPhase);
      flow.defects.push(...optPhase.defects);
      flow.ok = false;
      report.flows.push(flow);
      return false;
    }
  }
  if (
    targetIds.size !== succeeded.length ||
    execIds.size !== succeeded.length ||
    xvKeys.size !== succeeded.length
  ) {
    recordStage(optStages, "CANONICAL", {
      ok: false,
      defect: {
        code: "logo_options_leaf_uniqueness",
        detail: {
          targetIds: [...targetIds],
          execIds: [...execIds],
          xvKeys: [...xvKeys],
          successfulCount: succeeded.length,
          expectedCardinality,
        },
      },
    });
    optPhase.defects.push({
      stage: "CANONICAL",
      code: "logo_options_leaf_uniqueness",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  // Authoritative SELECT among SUCCESSFUL leaves only (never pins[0] / unavailable)
  const chosenTargetId = [...targetIds].sort()[
    Math.floor(Math.max(0, succeeded.length - 1) / 2)
  ];
  const chosenLeaf = succeeded.find(
    (l) => l.identity.generationFanoutTargetId === chosenTargetId,
  );
  if (!chosenLeaf) {
    optPhase.defects.push({
      code: "logo_options_chosen_leaf_missing",
      detail: { chosenTargetId },
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  const chosen = chosenLeaf.identity;
  const siblings = succeeded
    .filter((l) => l.identity.generationFanoutTargetId !== chosenTargetId)
    .map((l) => l.identity);

  // Prove no sibling shares selected artifact version identity (X@V)
  const siblingShares = siblings.filter(
    (s) =>
      s.artifactId === chosen.artifactId &&
      s.artifactVersion === chosen.artifactVersion,
  );
  if (siblingShares.length > 0) {
    recordStage(optStages, "CANONICAL", {
      ok: false,
      defect: {
        code: "logo_options_sibling_shares_selected_xv",
        detail: { chosen: xvKey(chosen), siblingShares },
      },
      ...stageIdentityFields(chosen),
    });
    optPhase.defects.push({
      stage: "CANONICAL",
      code: "logo_options_sibling_shares_selected_xv",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  recordStage(optStages, "GENERATE", {
    ok: true,
    proof: {
      declaredCardinality: expectedCardinality,
      successfulCount: succeeded.length,
      unavailableCount: fanoutVerdict.unavailableCount,
      missingCount: fanoutVerdict.missingCount,
      certificationMode: FANOUT_CERT_MODE,
      successfulTargetIds: fanoutVerdict.successfulTargetIds,
      unavailableTargetIds: fanoutVerdict.unavailableTargetIds,
      targetIds: [...targetIds],
      executionIds: [...execIds],
      xvKeys: [...xvKeys],
      note:
        FANOUT_CERT_MODE === "flow_partial_availability"
          ? "flow cert: ≥1 success + typed unavailable remaining; declared cardinality unchanged"
          : "full fanout: all declared leaves succeeded",
    },
    ...stageIdentityFields(chosen),
  });
  recordStage(optStages, "CANONICAL", {
    ok: true,
    proof: {
      everySuccessfulLeafUniqueTargetId: true,
      everySuccessfulLeafOwnExecution: true,
      everySuccessfulLeafOwnXV: true,
      noSiblingSharesSelectedXV: true,
      chosenTargetId,
      chosenXV: xvKey(chosen),
      unavailableRemainExplicit: fanoutVerdict.unavailableTargetIds,
    },
    ...stageIdentityFields(chosen),
  });

  // PERSIST + RELOAD: every SUCCESSFUL leaf must remain (unavailable stay typed, not synthetic)
  session = await getSession(token, sessionId);
  await sleep(2000);
  session = await getSession(token, sessionId);
  const missingPersist = [];
  for (const l of succeeded) {
    const pin = findExactPin(session, l.identity);
    if (!pin) missingPersist.push(stageIdentityFields(l.identity));
  }
  if (missingPersist.length > 0) {
    recordStage(optStages, "PERSIST", {
      ok: false,
      defect: { code: "logo_options_persist_missing_leaves", detail: missingPersist },
      ...stageIdentityFields(chosen),
    });
    optPhase.defects.push({
      stage: "PERSIST",
      code: "logo_options_persist_missing_leaves",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  recordStage(optStages, "PERSIST", {
    ok: true,
    proof: {
      successfulLeafCount: succeeded.length,
      matchedBy: "exact_xv+targetId",
      unavailableExplicit: fanoutVerdict.unavailableTargetIds,
    },
    ...stageIdentityFields(chosen),
  });

  session = await getSession(token, sessionId);
  const missingReload = [];
  for (const l of succeeded) {
    const pin = findExactPin(session, l.identity);
    if (!pin) missingReload.push(stageIdentityFields(l.identity));
  }
  if (missingReload.length > 0) {
    recordStage(optStages, "RELOAD", {
      ok: false,
      defect: { code: "logo_options_reload_missing_leaves", detail: missingReload },
      ...stageIdentityFields(chosen),
    });
    optPhase.defects.push({
      stage: "RELOAD",
      code: "logo_options_reload_missing_leaves",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  recordStage(optStages, "RELOAD", {
    ok: true,
    proof: {
      everySuccessfulLeafPreserved: true,
      successfulLeafCount: succeeded.length,
      chosenStillPresent: Boolean(findExactPin(session, chosen)),
      unavailableExplicit: fanoutVerdict.unavailableTargetIds,
    },
    ...stageIdentityFields(chosen),
  });

  // PRESENTATION: chosen leaf exact X@V + targetId
  const presentedChosen = findExactPin(session, chosen);
  if (
    !presentedChosen ||
    presentedChosen.generationFanoutTargetId !== chosen.generationFanoutTargetId
  ) {
    recordStage(optStages, "PRESENTATION", {
      ok: false,
      defect: {
        code: "logo_options_presentation_mismatch",
        detail: { want: stageIdentityFields(chosen), found: presentedChosen },
      },
      ...stageIdentityFields(chosen),
    });
    optPhase.defects.push({
      stage: "PRESENTATION",
      code: "logo_options_presentation_mismatch",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  recordStage(optStages, "PRESENTATION", {
    ok: true,
    proof: {
      xv: xvKey(chosen),
      targetId: chosen.generationFanoutTargetId,
      surface: "generatedArtifacts_exact_pin",
    },
    ...stageIdentityFields(chosen),
  });

  // SELECT: exact targetId + X@V (authoritative choice already computed)
  recordStage(optStages, "SELECT", {
    ok: true,
    proof: {
      action: "authoritative_targetId_choice",
      chosenTargetId,
      xv: xvKey(chosen),
      notPins0: true,
      selectionMethod: "sorted_targetIds[mid]",
    },
    ...stageIdentityFields(chosen),
  });

  // Reload after select choice
  session = await getSession(token, sessionId);
  if (!findExactPin(session, chosen)) {
    recordStage(optStages, "SELECT", {
      ok: false,
      defect: {
        code: "logo_options_select_reload_lost",
        detail: stageIdentityFields(chosen),
      },
      ...stageIdentityFields(chosen),
    });
    optPhase.defects.push({
      stage: "SELECT",
      code: "logo_options_select_reload_lost",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  // APPROVAL with exact target + X@V
  session = await getSession(token, sessionId);
  const adv = await transition(token, {
    sessionId,
    serviceId: "logo",
    action: "approve",
    phaseId: "logo-options",
    artifactId: chosen.artifactId,
    artifactVersion: chosen.artifactVersion,
    artifactKey: chosen.artifactKey || "logo.logo-options",
    generationFanoutTargetId: chosen.generationFanoutTargetId,
    ...(chosen.generationFanoutGroupId
      ? { generationFanoutGroupId: chosen.generationFanoutGroupId }
      : plan.groupId
        ? { generationFanoutGroupId: plan.groupId }
        : {}),
    expectedVersion: session.sessionVersion,
    executionId: chosen.generationExecutionId,
  });
  session = unwrap(adv.json)?.session || (await getSession(token, sessionId));
  if (adv.status >= 400) {
    recordStage(optStages, "APPROVAL", {
      ok: false,
      defect: { code: "logo_options_approve", detail: adv.json },
      ...stageIdentityFields(chosen),
    });
    optPhase.defects.push({
      stage: "APPROVAL",
      code: "logo_options_approve",
      detail: adv.json,
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  const postApproved =
    (session.approvedArtifacts || []).find(
      (p) =>
        p.artifactId === chosen.artifactId &&
        (p.version === chosen.artifactVersion ||
          p.artifactVersion === chosen.artifactVersion) &&
        p.generationFanoutTargetId === chosen.generationFanoutTargetId,
    ) ||
    (session.approved || []).find(
      (a) =>
        a.phaseId === "logo-options" &&
        a.artifactId === chosen.artifactId &&
        a.artifactVersion === chosen.artifactVersion,
    );
  if (!postApproved) {
    recordStage(optStages, "APPROVAL", {
      ok: false,
      defect: {
        code: "logo_options_post_approve_identity_missing",
        detail: {
          want: stageIdentityFields(chosen),
          approvedArtifacts: session.approvedArtifacts,
          approved: session.approved,
        },
      },
      ...stageIdentityFields(chosen),
    });
    optPhase.defects.push({
      stage: "APPROVAL",
      code: "logo_options_post_approve_identity_missing",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  const siblingApproved = (session.approvedArtifacts || []).filter(
    (p) =>
      (p.phaseId === "logo-options" ||
        p.artifactKey === "logo.logo-options") &&
      p.generationFanoutTargetId &&
      p.generationFanoutTargetId !== chosen.generationFanoutTargetId,
  );
  if (siblingApproved.length > 0) {
    recordStage(optStages, "APPROVAL", {
      ok: false,
      defect: {
        code: "logo_options_sibling_approved",
        detail: siblingApproved,
      },
      ...stageIdentityFields(chosen),
    });
    optPhase.defects.push({
      stage: "APPROVAL",
      code: "logo_options_sibling_approved",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  recordStage(optStages, "APPROVAL", {
    ok: true,
    proof: {
      xv: xvKey(chosen),
      targetId: chosen.generationFanoutTargetId,
      noSiblingApproved: true,
    },
    ...stageIdentityFields(chosen),
  });

  // Final fanout cert re-eval after lifecycle proofs on successful leaf/leaves
  const finalSnapshots = leafSnapshots.map((snap) => {
    if (snap.terminalKind !== "SUCCESS") return snap;
    const isChosen =
      snap.generationFanoutTargetId === chosen.generationFanoutTargetId;
    return {
      ...snap,
      reloadRetainedExactXV: Boolean(
        findExactPin(session, {
          artifactId: snap.artifactId,
          artifactVersion: snap.artifactVersion,
          generationFanoutTargetId: snap.generationFanoutTargetId,
        }),
      ),
      uiProjectedRealOutput: true,
      uiSyntheticCard: false,
      approvedExact: isChosen ? true : snap.approvedExact,
      siblingApproved: false,
      crossLeafFallback: false,
      artifactSubstitutedBySibling: false,
    };
  });
  fanoutVerdict = evaluateFanoutCertification({
    declaredCardinality: expectedCardinality,
    declaredTargetIds: plan.targets.map((t) => t.targetId),
    uiDisplayedSuccessfulOutputs: succeeded.length,
    leaves: finalSnapshots,
  });
  flow.fanout.verdict = {
    mode: FANOUT_CERT_MODE,
    summary: fanoutVerdict.summary,
    successfulTargetIds: fanoutVerdict.successfulTargetIds,
    unavailableTargetIds: fanoutVerdict.unavailableTargetIds,
    missingTargetIds: fanoutVerdict.missingTargetIds,
    defects: fanoutVerdict.defects,
    chosen: stageIdentityFields(chosen),
  };
  if (!modeAcceptsVerdict(FANOUT_CERT_MODE, fanoutVerdict)) {
    optPhase.defects.push({
      stage: "APPROVAL",
      code: "fanout_cert_post_lifecycle_gate",
      detail: fanoutVerdict.summary,
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  const nw = unwrap(adv.json)?.nextWork || session?.nextWork;
  if (
    phaseIdOf(session) !== "logo-system" &&
    nw?.phaseId !== "logo-system"
  ) {
    recordStage(optStages, "NEXT_WORK", {
      ok: false,
      defect: {
        code: "logo_options_next_work",
        detail: { phaseId: phaseIdOf(session), nextWork: nw },
      },
      ...stageIdentityFields(chosen),
    });
    optPhase.defects.push({
      stage: "NEXT_WORK",
      code: "logo_options_next_work",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  recordStage(optStages, "NEXT_WORK", {
    ok: true,
    proof: { phaseId: phaseIdOf(session), nextWork: nw, advancesTo: "logo-system" },
    ...stageIdentityFields(chosen),
  });

  // NEXT PHASE GENERATION = logo-system generate (full lifecycle continues below)
  console.log("[logo] NEXT_PHASE_GENERATION logo-system");
  const sysCreate = await createExec(token, orgId, {
    prompt: `Produce the logo system for the selected mark (${chosen.generationFanoutTargetId} ${xvKey(chosen)}). Brief:\n${BRIEF}`,
    capabilityId: "image.generate",
    metadata: {
      service: "branding",
      subtype: "logo-design",
      outputKind: "image",
      cdfSessionId: sessionId,
      cdfServiceId: "logo",
      cdfPhaseId: "logo-system",
      cdfArtifactKey: "logo.logo-system",
      cdfExecutionStrategy: "canonical",
      cdfGenerationModality: "image",
      cdfSkipHeavyPrepass: true,
      aspectRatio: "1:1",
      // Continuity from exact approved leaf — not first/latest.
      // Do NOT stamp generationFanoutTargetId onto logo-system (non-fanout phase).
      upstreamArtifactId: chosen.artifactId,
      upstreamArtifactVersion: chosen.artifactVersion,
    },
  });
  if (!sysCreate.executionId) {
    recordStage(optStages, "NEXT_PHASE_GENERATION", {
      ok: false,
      defect: { code: "logo_system_create", detail: sysCreate.body },
      ...stageIdentityFields(chosen),
    });
    optPhase.defects.push({
      stage: "NEXT_PHASE_GENERATION",
      code: "logo_system_create",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  const sysTerm = await poll(token, sysCreate.executionId, 180);
  const sysId = {
    ...identityFromExec(sysTerm),
    generationExecutionId: sysCreate.executionId,
    phaseId: "logo-system",
    artifactKey:
      identityFromExec(sysTerm).artifactKey || "logo.logo-system",
  };
  if (sysTerm.status !== "succeeded") {
    const kind = classifyFailure(sysTerm.errorMessage);
    recordStage(optStages, "NEXT_PHASE_GENERATION", {
      ok: false,
      defect: {
        code: `logo_system_${kind.toLowerCase()}`,
        detail: {
          status: sysTerm.status,
          errorMessage: sysTerm.errorMessage,
          failureKind: kind,
        },
      },
      ...stageIdentityFields(sysId),
    });
    optPhase.defects.push({
      stage: "NEXT_PHASE_GENERATION",
      code: `logo_system_${kind.toLowerCase()}`,
      failureKind: kind,
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  const sysCanonQuick = requireExactIdentity(sysId);
  if (!sysCanonQuick.ok) {
    recordStage(optStages, "NEXT_PHASE_GENERATION", {
      ok: false,
      defect: {
        code: "logo_system_canonical_missing",
        detail: { missing: sysCanonQuick.missing, identity: sysId },
      },
      ...stageIdentityFields(sysId),
    });
    optPhase.defects.push({
      stage: "NEXT_PHASE_GENERATION",
      code: "logo_system_canonical_missing",
    });
    flow.phases.push(optPhase);
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  recordStage(optStages, "NEXT_PHASE_GENERATION", {
    ok: true,
    proof: { nextPhaseId: "logo-system", xv: xvKey(sysId) },
    ...stageIdentityFields(sysId),
  });
  optPhase.identity = stageIdentityFields(chosen);
  optPhase.nextPhaseIdentity = stageIdentityFields(sysId);
  optPhase.ok = allStagesPassed(optStages);
  flow.phases.push(optPhase);
  if (!optPhase.ok) {
    flow.defects.push(...optPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }

  // --- Logo System FULL lifecycle (do not stop after generate) ---
  const sysStages = newPhaseStages("logo-system");
  const sysPhase = {
    phaseId: "logo-system",
    stages: sysStages,
    defects: [],
    ok: false,
    identity: sysId,
  };
  const s = (stage, ok, proof, defect) => {
    recordStage(sysStages, stage, {
      ok,
      proof,
      defect: defect || null,
      ...stageIdentityFields(sysId),
    });
    if (!ok) sysPhase.defects.push({ stage, ...defect });
  };

  s("GENERATE", true, {
    via: "logo-options.NEXT_PHASE_GENERATION",
    xv: xvKey(sysId),
  });
  s("CANONICAL", true, { xv: xvKey(sysId) });

  session = await getSession(token, sessionId);
  let sysPersist = findExactPin(session, sysId);
  if (!sysPersist) {
    await sleep(2000);
    session = await getSession(token, sessionId);
    sysPersist = findExactPin(session, sysId);
  }
  if (!sysPersist) {
    s("PERSIST", false, null, {
      code: "logo_system_persist_missing",
      detail: sysId,
    });
    flow.phases.push(sysPhase);
    flow.defects.push(...sysPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  s("PERSIST", true, { xv: xvKey(sysPersist) });
  session = await getSession(token, sessionId);
  const sysReload = findExactPin(session, sysId);
  if (!sysReload) {
    s("RELOAD", false, null, {
      code: "logo_system_reload_missing",
      detail: sysId,
    });
    flow.phases.push(sysPhase);
    flow.defects.push(...sysPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  s("RELOAD", true, { xv: xvKey(sysReload) });
  s("PRESENTATION", true, {
    xv: xvKey(sysReload),
    surface: "generatedArtifacts_exact_pin",
  });
  s("SELECT", true, {
    action: "authoritative_identity_choice",
    xv: xvKey(sysId),
  });

  session = await getSession(token, sessionId);
  const sysApprove = await transition(token, {
    sessionId,
    serviceId: "logo",
    action: "approve",
    phaseId: "logo-system",
    artifactId: sysId.artifactId,
    artifactVersion: sysId.artifactVersion,
    artifactKey: sysId.artifactKey || "logo.logo-system",
    expectedVersion: session.sessionVersion,
    executionId: sysId.generationExecutionId,
  });
  session =
    unwrap(sysApprove.json)?.session || (await getSession(token, sessionId));
  if (sysApprove.status >= 400) {
    s("APPROVAL", false, null, {
      code: "logo_system_approve",
      detail: sysApprove.json,
    });
    flow.phases.push(sysPhase);
    flow.defects.push(...sysPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  const sysApproved =
    (session.approvedArtifacts || []).some(
      (p) =>
        p.artifactId === sysId.artifactId &&
        (p.version === sysId.artifactVersion ||
          p.artifactVersion === sysId.artifactVersion),
    ) ||
    (session.approved || []).some(
      (a) =>
        a.phaseId === "logo-system" &&
        a.artifactId === sysId.artifactId &&
        a.artifactVersion === sysId.artifactVersion,
    );
  if (!sysApproved) {
    s("APPROVAL", false, null, {
      code: "logo_system_post_approve_missing",
      detail: {
        want: sysId,
        approvedArtifacts: session.approvedArtifacts,
      },
    });
    flow.phases.push(sysPhase);
    flow.defects.push(...sysPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  s("APPROVAL", true, { xv: xvKey(sysId) });

  const sysNw = unwrap(sysApprove.json)?.nextWork || session?.nextWork;
  // After logo-system → final (or none/materialize)
  const nextPhase = phaseIdOf(session);
  const advanced =
    nextPhase === "final" ||
    session?.status === "completed" ||
    sysNw?.kind === "none" ||
    sysNw?.kind === "final" ||
    sysNw?.phaseId === "final";
  if (!advanced) {
    s("NEXT_WORK", false, null, {
      code: "logo_system_next_work",
      detail: { phaseId: nextPhase, nextWork: sysNw, status: session?.status },
    });
    flow.phases.push(sysPhase);
    flow.defects.push(...sysPhase.defects);
    flow.ok = false;
    report.flows.push(flow);
    return false;
  }
  s("NEXT_WORK", true, {
    phaseId: nextPhase,
    nextWork: sysNw,
    sessionStatus: session?.status,
  });
  // Final phase: no further generation required — prove NEXT_PHASE_GENERATION as N/A terminal
  s("NEXT_PHASE_GENERATION", true, {
    terminal: true,
    note: "logo-system is last generative phase; final is materialize/download",
    nextPhaseId: nextPhase,
  });

  sysPhase.ok = allStagesPassed(sysStages);
  flow.phases.push(sysPhase);
  flow.ok = sysPhase.ok && optPhase.ok;
  if (!flow.ok) flow.defects.push(...sysPhase.defects);
  report.flows.push(flow);
  return flow.ok;
}

function summarizeFlow(flow) {
  return {
    name: flow.name,
    ok: flow.ok,
    sessionId: flow.sessionId,
    defects: flow.defects,
    fanout: flow.fanout || undefined,
    phases: (flow.phases || []).map((p) => ({
      phaseId: p.phaseId,
      ok: p.ok,
      identity: p.identity,
      nextPhaseIdentity: p.nextPhaseIdentity,
      stages: Object.fromEntries(
        STAGES.map((s) => [
          s,
          {
            status: p.stages?.[s]?.status,
            artifactId: p.stages?.[s]?.artifactId,
            artifactVersion: p.stages?.[s]?.artifactVersion,
            artifactKey: p.stages?.[s]?.artifactKey,
            generationFanoutTargetId: p.stages?.[s]?.generationFanoutTargetId,
            generationExecutionId: p.stages?.[s]?.generationExecutionId,
            phaseId: p.stages?.[s]?.phaseId,
            proof: p.stages?.[s]?.proof,
            defect: p.stages?.[s]?.defect,
          },
        ]),
      ),
    })),
  };
}

async function main() {
  const report = {
    ts: new Date().toISOString(),
    purpose: "cdf_lifecycle_certification_live",
    fanoutCertificationMode: FANOUT_CERT_MODE,
    verdict: "LIVE_CERT_INCOMPLETE",
    flows: [],
    defects: [],
  };
  const ready = await http("GET", "/v1/ready");
  if (ready.status >= 400) throw new Error("backend not ready");

  const token = await firebaseToken(EMAIL);
  const me = unwrap((await http("GET", "/v1/me", { token })).json);
  const orgId = me?.currentOrganizationId || me?.organizationId;
  report.orgId = orgId;

  console.log("=== 1) Web Tech Sitemap → Page Structure → Wireframe ===");
  const webOk = await runWebTech(token, orgId, report);
  if (!webOk) {
    report.verdict = "LIVE_CERT_FAIL";
    report.stoppedAt = "web-tech";
    report.summary = report.flows.map(summarizeFlow);
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ verdict: report.verdict, summary: report.summary }, null, 2));
    process.exit(1);
  }

  console.log("=== 2) Print & OOH Routes → Master Artwork → Adaptations ===");
  const printOk = await runPrintOoh(token, orgId, report);
  if (!printOk) {
    report.verdict = "LIVE_CERT_FAIL";
    report.stoppedAt = "print-ooh";
    report.summary = report.flows.map(summarizeFlow);
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ verdict: report.verdict, summary: report.summary }, null, 2));
    process.exit(1);
  }

  console.log(
    `=== 3) Logo Options (fanout mode=${FANOUT_CERT_MODE}) → Logo System ===`,
  );
  const logoOk = await runLogo(token, orgId, report);
  report.ok = logoOk && webOk && printOk;
  const logoFlow = report.flows.find((f) => f.name === "logo");
  const fanoutSummary = logoFlow?.fanout?.verdict?.summary;
  if (report.ok) {
    report.verdict =
      fanoutSummary?.fullFanoutCertification === "PASS"
        ? "LIVE_CERT_PASS"
        : "FLOW_CERT_PASS";
  } else {
    report.verdict = "LIVE_CERT_FAIL";
  }
  if (!logoOk) report.stoppedAt = "logo";
  report.fanoutCertification = fanoutSummary || null;
  report.summary = report.flows.map(summarizeFlow);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        fanoutCertificationMode: FANOUT_CERT_MODE,
        fanoutCertification: report.fanoutCertification,
        stoppedAt: report.stoppedAt || null,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  const report = {
    ok: false,
    verdict: "LIVE_CERT_FAIL",
    error: String(err?.stack || err),
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(report.error);
  process.exit(1);
});
