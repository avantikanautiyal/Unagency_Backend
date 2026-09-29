/**
 * Logo-only live cert: logo-type → territories → logo-options → logo-system
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const API = "http://127.0.0.1:4000";
const OUT = "/tmp/cdf-logo-boundary-live.json";
const EMAIL =
  process.env.PHASE8_E2E_EMAIL ||
  process.env.SUNFLOWER_E2E_EMAIL ||
  "avantika.mcs22.du@gmail.com";
const BRIEF = "Logo for Lotus Leaf tea — calm, premium, botanical.";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function unwrap(j) {
  return j?.data ?? j?.result ?? j;
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
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseWebApiKey()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const j = await res.json();
  if (!j.idToken) throw new Error(JSON.stringify(j));
  return j.idToken;
}
async function getSession(token, sid) {
  return (
    unwrap((await http("GET", `/v1/cdf/sessions/${sid}`, { token })).json)
      ?.session ||
    unwrap((await http("GET", `/v1/cdf/sessions/${sid}`, { token })).json)
  );
}
async function transition(token, body) {
  return http("POST", "/v1/cdf/transition", { token, body, timeoutMs: 120000 });
}
function phaseIdOf(s) {
  return s?.phaseId || s?.currentPhaseId || null;
}
function pinFromExec(ex) {
  const data =
    ex?.result?.data && typeof ex.result.data === "object"
      ? ex.result.data
      : {};
  const meta =
    ex?.metadata && typeof ex.metadata === "object" ? ex.metadata : {};
  const id =
    typeof data.cdfArtifactId === "string"
      ? data.cdfArtifactId
      : typeof meta.cdfArtifactId === "string"
        ? meta.cdfArtifactId
        : "";
  const verRaw = data.cdfArtifactVersion ?? meta.cdfArtifactVersion;
  const ver =
    typeof verRaw === "number"
      ? verRaw
      : typeof verRaw === "string" && /^\d+$/.test(verRaw)
        ? Number(verRaw)
        : undefined;
  const key =
    typeof data.cdfArtifactKey === "string"
      ? data.cdfArtifactKey
      : typeof meta.cdfArtifactKey === "string"
        ? meta.cdfArtifactKey
        : undefined;
  return { cdfArtifactId: id, cdfArtifactVersion: ver, cdfArtifactKey: key };
}
async function poll(token, eid, max = 150) {
  for (let i = 0; i < max; i++) {
    const ex = unwrap(
      (
        await http("GET", `/v1/executions/${encodeURIComponent(eid)}`, {
          token,
          timeoutMs: 60000,
        })
      ).json,
    );
    const st = String(ex?.status || "");
    if (["succeeded", "failed", "completed", "error", "cancelled"].includes(st))
      return ex;
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

(async () => {
  const report = {
    ts: new Date().toISOString(),
    flow: "logo",
    defects: [],
    steps: [],
  };
  const token = await firebaseToken(EMAIL);
  const me = unwrap((await http("GET", "/v1/me", { token })).json);
  const orgId = me?.currentOrganizationId || me?.organizationId;
  const started = await http("POST", "/v1/cdf/sessions", {
    token,
    body: { serviceId: "logo", productMode: "ai" },
  });
  let session = unwrap(started.json)?.session || unwrap(started.json);
  const sessionId = session.sessionId || session.id;
  report.sessionId = sessionId;
  await transition(token, {
    sessionId,
    serviceId: "logo",
    action: "submit_brief",
    brief: BRIEF,
    expectedVersion: session.sessionVersion,
  });
  session = await getSession(token, sessionId);

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
    report.steps.push({
      phaseId: "logo-type",
      status: sel.status,
      nextPhaseId: phaseIdOf(session),
    });
  }

  console.log("generate territories");
  const terrCreate = await createExec(token, orgId, {
    prompt: `Produce 3 logo territories for this brief:\n${BRIEF}`,
    capabilityId: "text.generate",
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
    structuredOutput: { name: "CdfCreativeDirections", strict: true },
  });
  if (!terrCreate.executionId) {
    report.defects.push({ code: "territories_create", detail: terrCreate.body });
  } else {
    const term = await poll(token, terrCreate.executionId);
    const pin = pinFromExec(term);
    const step = {
      phaseId: "territories",
      executionId: terrCreate.executionId,
      status: term.status,
      pin,
      errorMessage: term.errorMessage,
      documentPlanMisclassified: /DocumentPlan/i.test(
        String(term.errorMessage || ""),
      ),
    };
    session = await getSession(token, sessionId);
    step.reloadHydrated = (session.generatedArtifacts || []).some(
      (p) =>
        p.artifactId === pin.cdfArtifactId &&
        p.version === pin.cdfArtifactVersion,
    );
    if (term.status === "succeeded" && pin.cdfArtifactId?.startsWith("cdfart_")) {
      const sel = await transition(token, {
        sessionId,
        serviceId: "logo",
        action: "select_route",
        phaseId: "territories",
        routeIndex: 0,
        artifactId: pin.cdfArtifactId,
        artifactVersion: pin.cdfArtifactVersion,
        artifactKey: pin.cdfArtifactKey || "logo.territories",
        expectedVersion: session.sessionVersion,
        executionId: terrCreate.executionId,
      });
      session =
        unwrap(sel.json)?.session || (await getSession(token, sessionId));
      step.selectStatus = sel.status;
      step.nextPhaseId = phaseIdOf(session);
      if (sel.status >= 400)
        report.defects.push({ code: "territories_select", detail: sel.json });
    } else
      report.defects.push({ code: "territories_canonical", detail: step });
    report.steps.push(step);
  }

  console.log("generate logo-options");
  session = await getSession(token, sessionId);
  const optCreate = await createExec(token, orgId, {
    prompt: `Produce logo options for the selected territory. Brief:\n${BRIEF}`,
    capabilityId: "image.generate",
    metadata: {
      service: "branding",
      subtype: "logo-design",
      outputKind: "image",
      cdfSessionId: sessionId,
      cdfServiceId: "logo",
      cdfPhaseId: "logo-options",
      cdfArtifactKey: "logo.logo-options",
      cdfExecutionStrategy: "canonical",
      cdfGenerationModality: "image",
      cdfSkipHeavyPrepass: true,
      aspectRatio: "1:1",
    },
  });
  if (!optCreate.executionId) {
    report.defects.push({ code: "options_create", detail: optCreate.body });
  } else {
    const term = await poll(token, optCreate.executionId, 180);
    const pin = pinFromExec(term);
    const step = {
      phaseId: "logo-options",
      executionId: optCreate.executionId,
      status: term.status,
      pin,
      errorMessage: term.errorMessage,
      documentPlanMisclassified: /DocumentPlan/i.test(
        String(term.errorMessage || ""),
      ),
    };
    if (step.documentPlanMisclassified)
      report.defects.push({ code: "options_documentplan", detail: step });
    session = await getSession(token, sessionId);
    const pins = (session.generatedArtifacts || []).filter(
      (p) =>
        p.phaseId === "logo-options" || p.artifactKey === "logo.logo-options",
    );
    step.reloadPinCount = pins.length;
    step.reloadHydrated = pins.length > 0;
    if (term.status === "succeeded" && pins.length > 0) {
      const leaf = pins[0];
      // Visual phases: approve with exact X@V (+ fanout target when present).
      const adv = await transition(token, {
        sessionId,
        serviceId: "logo",
        action: "approve",
        phaseId: "logo-options",
        artifactId: leaf.artifactId,
        artifactVersion: leaf.version,
        artifactKey: leaf.artifactKey || "logo.logo-options",
        ...(leaf.generationFanoutTargetId
          ? { generationFanoutTargetId: leaf.generationFanoutTargetId }
          : {}),
        expectedVersion: session.sessionVersion,
        executionId: leaf.generationExecutionId || optCreate.executionId,
      });
      session =
        unwrap(adv.json)?.session || (await getSession(token, sessionId));
      step.selectStatus = adv.status;
      step.nextPhaseId = phaseIdOf(session);
      step.nextWork = unwrap(adv.json)?.nextWork;
      if (adv.status >= 400)
        report.defects.push({ code: "options_approve", detail: adv.json });
    } else if (term.status !== "succeeded") {
      step.note = "provider soft-fail allowed if no DocumentPlan";
    } else report.defects.push({ code: "options_no_pins", detail: step });
    report.steps.push(step);
  }

  if (phaseIdOf(session) === "logo-system") {
    console.log("generate logo-system");
    const sysCreate = await createExec(token, orgId, {
      prompt: `Produce logo system applications for the selected mark. Brief:\n${BRIEF}`,
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
      },
    });
    const step = { phaseId: "logo-system", executionId: sysCreate.executionId };
    if (!sysCreate.executionId)
      report.defects.push({ code: "system_create", detail: sysCreate.body });
    else {
      const term = await poll(token, sysCreate.executionId, 180);
      step.status = term.status;
      step.pin = pinFromExec(term);
      step.errorMessage = term.errorMessage;
      step.documentPlanMisclassified = /DocumentPlan/i.test(
        String(term.errorMessage || ""),
      );
      if (step.documentPlanMisclassified)
        report.defects.push({ code: "system_documentplan", detail: step });
      session = await getSession(token, sessionId);
      step.reloadHydrated = (session.generatedArtifacts || []).some(
        (p) =>
          p.phaseId === "logo-system" || p.artifactKey === "logo.logo-system",
      );
    }
    report.steps.push(step);
  }

  report.ok = report.defects.length === 0;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        sessionId: report.sessionId,
        defects: report.defects,
        steps: report.steps.map((s) => ({
          phaseId: s.phaseId,
          status: s.status,
          nextPhaseId: s.nextPhaseId,
          reloadHydrated: s.reloadHydrated,
          documentPlanMisclassified: s.documentPlanMisclassified,
          pin: s.pin?.cdfArtifactId,
          selectStatus: s.selectStatus,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(report.ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
