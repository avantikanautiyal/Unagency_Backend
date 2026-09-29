/**
 * Controlled LIVE certification: Web Tech → Landing Page website completion.
 * Verifies materialization → websiteCanonicalCompletion → preview URL →
 * presentation eligibility → governance (no RETRY) → reload durability.
 *
 * Does NOT fake preview URLs. Does NOT convert art_webexport → cdfart.
 */
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

const ROOT = path.join(__dirname);
process.chdir(ROOT);
require("dotenv").config({ path: path.join(ROOT, ".env") });

const API = "http://127.0.0.1:4000";
const OUT = "/tmp/cdf-webtech-landing-live-cert.json";
const LOG = "/tmp/cdf-webtech-landing-live-backend.log";
const EMAIL =
  process.env.PHASE8_E2E_EMAIL ||
  process.env.SUNFLOWER_E2E_EMAIL ||
  "avantika.mcs22.du@gmail.com";

const BRIEF =
  "Corporate landing page for a premium retail tea brand. Home, About, Products, Contact. Clean editorial aesthetic, strong hero CTA, brand colours.";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function unwrap(json) {
  return json?.data != null ? json.data : json?.result != null ? json.result : json;
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
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 800) };
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
  if (!j.idToken) {
    throw new Error(`Custom token exchange failed: ${JSON.stringify(j)}`);
  }
  return j.idToken;
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
    await sleep(3000);
  }
  return { status: "timeout", executionId: eid };
}

function pinFromExec(ex) {
  const data = ex?.result?.data && typeof ex.result.data === "object"
    ? ex.result.data
    : {};
  const meta = ex?.metadata && typeof ex.metadata === "object" ? ex.metadata : {};
  const cdfArtifactId =
    typeof data.cdfArtifactId === "string"
      ? data.cdfArtifactId
      : typeof meta.cdfArtifactId === "string"
        ? meta.cdfArtifactId
        : undefined;
  const cdfArtifactVersion =
    typeof data.cdfArtifactVersion === "number"
      ? data.cdfArtifactVersion
      : typeof meta.cdfArtifactVersion === "number"
        ? meta.cdfArtifactVersion
        : undefined;
  const cdfArtifactKey =
    typeof data.cdfArtifactKey === "string"
      ? data.cdfArtifactKey
      : typeof meta.cdfArtifactKey === "string"
        ? meta.cdfArtifactKey
        : undefined;
  return { cdfArtifactId, cdfArtifactVersion, cdfArtifactKey, data, meta };
}

async function getSession(token, sid) {
  const r = await http("GET", `/v1/cdf/sessions/${encodeURIComponent(sid)}`, {
    token,
  });
  return unwrap(r.json)?.session || unwrap(r.json);
}

async function transition(token, body) {
  return http("POST", "/v1/cdf/transition", { token, body, timeoutMs: 120000 });
}

async function createPhaseExec(token, orgId, input) {
  const {
    sessionId,
    phaseId,
    artifactKey,
    modality,
    capabilityId,
    structuredName,
    prompt,
    extraMeta = {},
  } = input;
  const body = {
    prompt,
    capabilityId,
    organizationId: orgId,
    metadata: {
      service: "website",
      subtype: "landing-page",
      outputMapService: "website",
      cdfSessionId: sessionId,
      cdfServiceId: "web-tech",
      cdfPhaseId: phaseId,
      cdfArtifactKey: artifactKey,
      cdfExecutionStrategy: "canonical",
      cdfGenerationModality: modality,
      cdfSkipHeavyPrepass: true,
      websiteUserBrief: BRIEF,
      ...extraMeta,
    },
    ...(structuredName
      ? {
          structuredOutput: {
            name: structuredName,
            strict: true,
          },
        }
      : {}),
  };
  const r = await http("POST", "/v1/executions", {
    token,
    body,
    timeoutMs: 180000,
  });
  const ex = unwrap(r.json);
  const eid = ex?.executionId || ex?.id;
  return { createStatus: r.status, createBody: r.json, executionId: eid, ex };
}

async function approvePhase(token, session, phaseId, pin) {
  const r = await transition(token, {
    sessionId: session.sessionId || session.id,
    serviceId: "web-tech",
    action: "approve",
    phaseId,
    artifactId: pin.cdfArtifactId,
    artifactVersion: pin.cdfArtifactVersion,
    artifactKey: pin.cdfArtifactKey || `web-tech.${phaseId}`,
    expectedVersion: session.sessionVersion,
  });
  return { status: r.status, body: unwrap(r.json), raw: r.json };
}

function presentationEligibility(ex) {
  const data = ex?.result?.data || {};
  const meta = ex?.metadata || {};
  return (
    data.presentationEligibility ||
    meta.presentationEligibility ||
    null
  );
}

function governanceAction(ex) {
  // Prefer extras if present on poll payload
  const extras = ex?.extras || ex?.governance || null;
  if (extras?.action) return extras.action;
  if (extras?.governance?.action) return extras.governance.action;
  return null;
}

async function fetchArtifactContent(token, artifactId) {
  // Product path: Bearer → GET /artifacts/:id/media → signedUrl (?token=) → HTML body.
  // Do not send Firebase Bearer as ?token= on /content (that is the media delivery token).
  const media = await http(
    "GET",
    `/v1/artifacts/${encodeURIComponent(artifactId)}/media`,
    { token, timeoutMs: 60000 },
  );
  const mediaBody = media.json?.data || media.json || {};
  const signedUrl =
    typeof mediaBody.signedUrl === "string"
      ? mediaBody.signedUrl
      : typeof mediaBody.mediaUrl === "string"
        ? mediaBody.mediaUrl
        : null;
  if (media.status !== 200 || !signedUrl) {
    return {
      status: media.status,
      mediaStatus: media.status,
      signedUrl: null,
      contentType: mediaBody.contentType || null,
      bytes: 0,
      looksHtml: false,
      previewSnippet: null,
      error: media.json || media.text?.slice?.(0, 400) || "media_url_missing",
    };
  }
  // signedUrl may be absolute or relative /v1/artifacts/.../content?token=...
  const contentPath = signedUrl.startsWith("http")
    ? signedUrl
    : signedUrl.startsWith("/")
      ? signedUrl
      : `/${signedUrl}`;
  let contentStatus;
  let contentText;
  let contentType;
  if (contentPath.startsWith("http")) {
    const r = await fetch(contentPath, { method: "GET" });
    contentStatus = r.status;
    contentText = await r.text();
    contentType = r.headers.get("content-type");
  } else {
    // Relative: strip API host prefix if present; use raw fetch without Bearer
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const r = await fetch(`${API}${contentPath}`, {
        method: "GET",
        signal: ctrl.signal,
      });
      contentStatus = r.status;
      contentText = await r.text();
      contentType = r.headers.get("content-type");
    } finally {
      clearTimeout(t);
    }
  }
  return {
    status: contentStatus,
    mediaStatus: media.status,
    signedUrl: signedUrl.slice(0, 120) + (signedUrl.length > 120 ? "…" : ""),
    contentType: contentType || null,
    bytes: typeof contentText === "string" ? contentText.length : 0,
    looksHtml:
      typeof contentText === "string" &&
      (/<!doctype html/i.test(contentText) || /<html[\s>]/i.test(contentText)),
    previewSnippet:
      typeof contentText === "string"
        ? contentText.slice(0, 200).replace(/\s+/g, " ")
        : null,
  };
}

async function main() {
  const report = {
    purpose: "webtech_landing_page_live_website_completion_cert",
    startedAt: new Date().toISOString(),
    brief: BRIEF,
    phases: [],
    website: null,
    reload: null,
    checks: {},
    verdict: "INCOMPLETE",
    defects: [],
  };

  const fail = (code, detail) => {
    report.defects.push({ code, detail });
    console.error("*** DEFECT", code, detail);
  };

  console.log("Restarting backend with latest code…");
  await killBackend();
  startBackend();
  if (!(await waitReady())) throw new Error("backend not ready");

  const token = await firebaseToken(EMAIL);
  const me = unwrap((await http("GET", "/v1/me", { token })).json);
  const orgId = me?.currentOrganizationId || me?.organizationId;
  report.orgId = orgId;
  report.email = EMAIL;

  // --- Start CDF session ---
  const started = await http("POST", "/v1/cdf/sessions", {
    token,
    body: { serviceId: "web-tech", productMode: "ai" },
  });
  let session = unwrap(started.json)?.session || unwrap(started.json);
  if (!session?.sessionId && !session?.id) {
    throw new Error(`CDF start failed: ${JSON.stringify(started.json)}`);
  }
  const sessionId = session.sessionId || session.id;
  report.sessionId = sessionId;

  // Submit brief
  const briefed = await transition(token, {
    sessionId,
    serviceId: "web-tech",
    action: "submit_brief",
    brief: BRIEF,
    expectedVersion: session.sessionVersion,
  });
  session = unwrap(briefed.json)?.session || (await getSession(token, sessionId));
  report.briefSubmit = { status: briefed.status, phase: session?.currentPhaseId };

  const PHASES = [
    {
      phaseId: "sitemap",
      artifactKey: "web-tech.sitemap",
      modality: "structured",
      capabilityId: "text.generate",
      structuredName: "CdfWebsiteSitemap",
      prompt: `Produce the website sitemap for this brief:\n${BRIEF}`,
    },
    {
      phaseId: "page-structure",
      artifactKey: "web-tech.page-structure",
      modality: "structured",
      capabilityId: "text.generate",
      structuredName: "CdfWebsitePageStructure",
      prompt: `Produce the homepage page structure for this brief:\n${BRIEF}`,
    },
    {
      phaseId: "wireframe",
      artifactKey: "web-tech.wireframe",
      modality: "structured",
      capabilityId: "text.generate",
      structuredName: "CdfWebsiteWireframe",
      prompt: `Produce the wireframe direction for this brief:\n${BRIEF}`,
    },
    {
      phaseId: "ui-routes",
      artifactKey: "web-tech.ui-routes",
      modality: "text",
      capabilityId: "text.generate",
      structuredName: "CdfCreativeDirections",
      prompt: `Produce 3 UI direction options for this brief:\n${BRIEF}`,
    },
  ];

  for (const phase of PHASES) {
    console.log(`\n=== PHASE ${phase.phaseId} ===`);
    session = await getSession(token, sessionId);
    const created = await createPhaseExec(token, orgId, {
      sessionId,
      ...phase,
    });
    if (!created.executionId) {
      fail(`phase_${phase.phaseId}_create`, created.createBody);
      report.phases.push({ ...phase, ...created, terminalStatus: "create_failed" });
      break;
    }
    const terminal = await poll(token, created.executionId);
    const pin = pinFromExec(terminal);
    const entry = {
      phaseId: phase.phaseId,
      executionId: created.executionId,
      createStatus: created.createStatus,
      terminalStatus: terminal.status,
      errorMessage: terminal.errorMessage,
      cdfArtifactId: pin.cdfArtifactId,
      cdfArtifactVersion: pin.cdfArtifactVersion,
      cdfArtifactKey: pin.cdfArtifactKey,
      artWebexportPromotedToCdfart: Boolean(
        pin.cdfArtifactId && String(pin.cdfArtifactId).startsWith("art_webexport"),
      ),
    };
    if (terminal.status !== "succeeded" || !pin.cdfArtifactId?.startsWith("cdfart_")) {
      fail(`phase_${phase.phaseId}_completion`, {
        status: terminal.status,
        error: terminal.errorMessage,
        pin,
      });
      report.phases.push(entry);
      break;
    }

    // Approve / select
    session = await getSession(token, sessionId);
    let adv;
    if (phase.phaseId === "ui-routes") {
      adv = await transition(token, {
        sessionId,
        serviceId: "web-tech",
        action: "select_route",
        phaseId: phase.phaseId,
        routeIndex: 0,
        artifactId: pin.cdfArtifactId,
        artifactVersion: pin.cdfArtifactVersion,
        artifactKey: pin.cdfArtifactKey,
        expectedVersion: session.sessionVersion,
      });
    } else {
      adv = await approvePhase(token, session, phase.phaseId, pin);
    }
    entry.advanceStatus = adv.status;
    entry.advanceOk = adv.status < 400;
    if (!entry.advanceOk) {
      fail(`phase_${phase.phaseId}_advance`, adv.raw || adv.body);
    }
    report.phases.push(entry);
    console.log(JSON.stringify(entry, null, 2));
  }

  // Homepage visual (studio handoff gate)
  if (report.defects.length === 0) {
    console.log("\n=== PHASE homepage (visual) ===");
    session = await getSession(token, sessionId);
    const home = await createPhaseExec(token, orgId, {
      sessionId,
      phaseId: "homepage",
      artifactKey: "web-tech.homepage",
      modality: "image",
      capabilityId: "image.generate",
      prompt: `Homepage hero visual for: ${BRIEF}`,
      extraMeta: {
        brandName: "Premium Tea Co",
        aspectRatio: "16:9",
      },
    });
    const homeTerm = home.executionId
      ? await poll(token, home.executionId, 150)
      : { status: "create_failed" };
    const homePin = pinFromExec(homeTerm);
    const homeEntry = {
      phaseId: "homepage",
      executionId: home.executionId,
      createStatus: home.createStatus,
      terminalStatus: homeTerm.status,
      errorMessage: homeTerm.errorMessage,
      cdfArtifactId: homePin.cdfArtifactId,
      cdfArtifactVersion: homePin.cdfArtifactVersion,
      artifactIds: homeTerm.artifactIds || [],
    };
    if (
      homeTerm.status === "succeeded" &&
      homePin.cdfArtifactId?.startsWith("cdfart_")
    ) {
      session = await getSession(token, sessionId);
      const adv = await approvePhase(token, session, "homepage", homePin);
      homeEntry.advanceStatus = adv.status;
      homeEntry.advanceOk = adv.status < 400;
      if (!homeEntry.advanceOk) {
        fail("homepage_advance", adv.raw || adv.body);
      }
    } else {
      // Homepage visual may warn; still attempt website if provider media exists.
      homeEntry.note =
        "Homepage did not establish cdfart — continuing to website product path if possible";
      if (homeTerm.status !== "succeeded") {
        fail("homepage_completion", {
          status: homeTerm.status,
          error: homeTerm.errorMessage,
        });
      }
    }
    report.phases.push(homeEntry);
    console.log(JSON.stringify(homeEntry, null, 2));
  }

  // --- Product website / landing-page materialization (the live failure path) ---
  console.log("\n=== WEBSITE landing-page materialization ===");
  const websiteCreate = await http("POST", "/v1/executions", {
    token,
    timeoutMs: 180000,
    body: {
      prompt: BRIEF,
      capabilityId: "text.generate",
      organizationId: orgId,
      metadata: {
        service: "website",
        subtype: "landing-page",
        outputKind: "deferred_website",
        industry: "Retail & E-commerce",
        websiteUserBrief: BRIEF,
        preferredWebStack: "html-static",
        webStack: "html-static",
        preferredStack: "html-static",
        brandName: "Premium Tea Co",
        // Continuity from CDF session without forcing image canonical on website.
        cdfSessionId: sessionId,
        cdfServiceId: "web-tech",
      },
      structuredOutput: {
        name: "WebsiteRoutes",
        strict: true,
      },
    },
  });
  const wEx = unwrap(websiteCreate.json);
  const websiteEid = wEx?.executionId || wEx?.id;
  if (!websiteEid) {
    fail("website_create", websiteCreate.json);
  }
  const websiteTerm = websiteEid
    ? await poll(token, websiteEid, 180)
    : { status: "create_failed" };

  // Fetch extras for governance
  let extras = null;
  try {
    const er = await http(
      "GET",
      `/v1/executions/${encodeURIComponent(websiteEid)}/extras`,
      { token, timeoutMs: 30000 },
    );
    extras = unwrap(er.json);
  } catch {}

  const wPin = pinFromExec(websiteTerm);
  const data = wPin.data || {};
  const meta = wPin.meta || {};
  const artifactIds = Array.isArray(websiteTerm.artifactIds)
    ? websiteTerm.artifactIds
    : [];
  const htmlArtifactId =
    typeof data.htmlArtifactId === "string" ? data.htmlArtifactId : null;
  const projectArtifactId =
    typeof data.projectArtifactId === "string" ? data.projectArtifactId : null;
  const websiteCanonicalCompletionEstablished =
    data.websiteCanonicalCompletionEstablished === true ||
    meta.websiteCanonicalCompletionEstablished === true;
  const websitePreviewRepresentation =
    data.websitePreviewRepresentation ||
    meta.websitePreviewRepresentation ||
    null;
  const elig = presentationEligibility(websiteTerm);
  const gov =
    extras?.governance?.action ||
    extras?.governance?.legacyAction ||
    governanceAction(websiteTerm);

  let previewProbe = null;
  if (htmlArtifactId) {
    previewProbe = await fetchArtifactContent(token, htmlArtifactId);
  }

  report.website = {
    executionId: websiteEid,
    createStatus: websiteCreate.status,
    terminalStatus: websiteTerm.status,
    errorMessage: websiteTerm.errorMessage,
    artifactIds,
    projectArtifactId,
    htmlArtifactId,
    websiteCanonicalCompletionEstablished,
    websitePreviewRepresentation,
    websitePreviewArtifactId:
      data.websitePreviewArtifactId || meta.websitePreviewArtifactId || null,
    cdfArtifactId: wPin.cdfArtifactId || null,
    artWebexportFalselyAsCdfart: Boolean(
      wPin.cdfArtifactId && String(wPin.cdfArtifactId).startsWith("art_webexport"),
    ),
    presentationEligibility: elig,
    governanceAction: gov,
    extrasGovernance: extras?.governance || null,
    previewProbe,
    exportKind: data.exportKind || null,
  };
  console.log(JSON.stringify(report.website, null, 2));

  // --- Reload durability: restart backend, re-fetch ---
  console.log("\n=== RELOAD: restart backend and re-resolve preview ===");
  await killBackend();
  startBackend();
  if (!(await waitReady())) throw new Error("backend not ready after restart");
  const token2 = await firebaseToken(EMAIL);
  const reloaded = websiteEid
    ? unwrap(
        (
          await http("GET", `/v1/executions/${encodeURIComponent(websiteEid)}`, {
            token: token2,
          })
        ).json,
      )
    : null;
  const rData = reloaded?.result?.data || {};
  const rMeta = reloaded?.metadata || {};
  const rHtml =
    typeof rData.htmlArtifactId === "string"
      ? rData.htmlArtifactId
      : typeof rMeta.htmlArtifactId === "string"
        ? rMeta.htmlArtifactId
        : null;
  let reloadPreview = null;
  if (rHtml) {
    reloadPreview = await fetchArtifactContent(token2, rHtml);
  }
  report.reload = {
    executionId: websiteEid,
    status: reloaded?.status,
    websiteCanonicalCompletionEstablished:
      rData.websiteCanonicalCompletionEstablished === true ||
      rMeta.websiteCanonicalCompletionEstablished === true,
    htmlArtifactId: rHtml,
    projectArtifactId: rData.projectArtifactId || rMeta.projectArtifactId || null,
    websitePreviewRepresentation:
      rData.websitePreviewRepresentation ||
      rMeta.websitePreviewRepresentation ||
      null,
    presentationEligibility:
      rData.presentationEligibility || rMeta.presentationEligibility || null,
    previewProbe: reloadPreview,
  };
  console.log(JSON.stringify(report.reload, null, 2));

  // --- Checks ---
  const web = report.website;
  const checks = {
    websiteSucceeded: web?.terminalStatus === "succeeded",
    materializationArtifacts:
      Array.isArray(web?.artifactIds) &&
      web.artifactIds.some((id) => /webexport/i.test(String(id))),
    websiteCanonicalCompletionEstablished:
      web?.websiteCanonicalCompletionEstablished === true,
    projectArtifactIdReal:
      typeof web?.projectArtifactId === "string" &&
      web.projectArtifactId.startsWith("art_webexport"),
    htmlArtifactIdReal:
      typeof web?.htmlArtifactId === "string" &&
      web.htmlArtifactId.startsWith("art_webexport"),
    noArtAsCdfart: web?.artWebexportFalselyAsCdfart !== true,
    previewRepresentationHtml: web?.websitePreviewRepresentation === "html_artifact",
    previewUrlResolvable:
      web?.previewProbe?.status === 200 && web?.previewProbe?.looksHtml === true,
    presentationAvailable:
      web?.presentationEligibility?.status === "AVAILABLE" ||
      web?.presentationEligibility?.status === "AVAILABLE_WITH_WARNINGS",
    governanceNotRetry: web?.governanceAction !== "RETRY",
    reloadPreviewResolvable:
      report.reload?.previewProbe?.status === 200 &&
      report.reload?.previewProbe?.looksHtml === true,
    reloadCompletionEstablished:
      report.reload?.websiteCanonicalCompletionEstablished === true,
  };
  report.checks = checks;

  const required = [
    "websiteSucceeded",
    "materializationArtifacts",
    "websiteCanonicalCompletionEstablished",
    "projectArtifactIdReal",
    "htmlArtifactIdReal",
    "noArtAsCdfart",
    "previewRepresentationHtml",
    "previewUrlResolvable",
    "presentationAvailable",
    "governanceNotRetry",
    "reloadPreviewResolvable",
    "reloadCompletionEstablished",
  ];
  for (const k of required) {
    if (!checks[k]) fail(`check_${k}`, { value: checks[k], website: web });
  }

  report.verdict =
    report.defects.length === 0 ? "LIVE_CERT_PASS" : "LIVE_CERT_FAIL";
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("\n=== VERDICT ===");
  console.log(report.verdict);
  console.log("Report:", OUT);
  console.log(JSON.stringify({ checks, defects: report.defects }, null, 2));
  process.exit(report.verdict === "LIVE_CERT_PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      { verdict: "LIVE_CERT_ERROR", error: String(e?.stack || e) },
      null,
      2,
    ),
  );
  process.exit(1);
});
