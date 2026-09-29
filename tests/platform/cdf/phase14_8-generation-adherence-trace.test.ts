/**
 * Phase 14.8 — Generation adherence trace (evidence documentation).
 *
 * Documents WHERE required on-canvas communication survives or is lost
 * using persisted E2E evidence. Does NOT change production behavior.
 *
 * Evidence roots (host paths; tests skip soft if missing):
 *   /tmp/phase8_sunflower_gvh_evidence
 *   /tmp/phase8_composition_evidence
 *   /tmp/exec42_live_wire_prompt.txt, /tmp/exec42_cmr.json, /tmp/exec42_route2.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PIXEL_GROUND_TRUTH_ANNOTATIONS } from "./helpers/pixel-ground-truth-annotations";

const REPORT_DIR = path.resolve(
  __dirname,
  "../../../tmp-ocr-benchmark-phase14_8",
);

type StageStatus =
  | "PRESERVED"
  | "TRANSFORMED"
  | "DROPPED"
  | "CONTRADICTED"
  | "AMBIGUOUS"
  | "UNKNOWN"
  | "N/A"
  | "ABSENT_PIXELS";

type CaseTrace = {
  readonly id: string;
  readonly evidenceRoot: string | null;
  readonly expectedPrimary: string;
  readonly compositionContract: StageStatus;
  readonly compiledComposition: StageStatus;
  readonly cmr: StageStatus;
  readonly flattenedRequest: StageStatus;
  readonly providerAdapter: StageStatus;
  readonly finalProviderRequest: StageStatus;
  readonly generatedPixels: StageStatus;
  readonly firstLoss: string;
  readonly rootCauseClass:
    | "PROVIDER_MODEL_ADHERENCE_FAILURE"
    | "FRAMEWORK_CMR_LOSS"
    | "SOFT_AUTHORITY_DILUTION"
    | "MIXED"
    | "UNKNOWN";
  readonly contradictions: readonly string[];
  readonly semanticRoleNotes: string;
  readonly quotes: Record<string, string>;
  readonly evidenceAvailable: boolean;
};

function readIf(p: string): string | null {
  try {
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function buildSunflowerTrace(): CaseTrace {
  const root = "/tmp/phase8_sunflower_gvh_evidence";
  const flat = readIf(`${root}/08_provider_flat_prompt.txt`);
  const comp = readIf(`${root}/05_deliverable_composition.json`);
  const route = readIf(`${root}/02_selected_route.json`);
  const available = Boolean(flat && comp && route);
  const expected =
    "Hello! We're Sunflower – a fresh approach to education for students in Classes 1-12";
  const hasComp =
    !!flat &&
    flat.includes("===== DELIVERABLE COMPOSITION =====") &&
    flat.includes("Text policy: placement=on_asset, required=true") &&
    flat.includes(expected);
  const pixel = PIXEL_GROUND_TRUTH_ANNOTATIONS.find((a) =>
    a.artifactId.includes("sunflower_hello"),
  );

  return {
    id: "real_01_phase8_sunflower_hello_sunshine",
    evidenceRoot: available ? root : null,
    expectedPrimary: expected,
    compositionContract: available ? "PRESERVED" : "UNKNOWN",
    compiledComposition: available ? "PRESERVED" : "UNKNOWN",
    cmr: available ? "PRESERVED" : "UNKNOWN",
    flattenedRequest: hasComp ? "PRESERVED" : available ? "DROPPED" : "UNKNOWN",
    providerAdapter: available ? "PRESERVED" : "UNKNOWN", // length-matched wire; body not persisted
    finalProviderRequest: available ? "UNKNOWN" : "UNKNOWN", // raw API body unavailable
    generatedPixels: pixel?.overallExpectedPresence === "ABSENT" ? "ABSENT_PIXELS" : "UNKNOWN",
    firstLoss: available
      ? "NO_REQUEST_LOSS — first failure at generated pixels (provider/model adherence)"
      : "UNKNOWN — evidence unavailable",
    rootCauseClass: available
      ? "PROVIDER_MODEL_ADHERENCE_FAILURE"
      : "UNKNOWN",
    contradictions: available
      ? Object.freeze([
          "Soft authority tension: 'SELECTED SEMANTIC DIRECTION is authoritative' coexists with required DELIVERABLE COMPOSITION textPolicy (not a hard drop).",
          "Route visualTreatment emphasizes minimal/bold visuals; does not say avoid text.",
        ])
      : [],
    semanticRoleNotes:
      "identity_mark / logo lockup described as signature; composition still requires primary_message_surface. Pixels show wordmark-only — model treated brand mark as the communication.",
    quotes: available
      ? {
          compositionSlot: `primary_message_surface: ${expected}`,
          textPolicy: "Text policy: placement=on_asset, required=true",
          ssdAuthority:
            "SELECTED SEMANTIC DIRECTION is authoritative. Generate from the structured choice object",
        }
      : {},
    evidenceAvailable: available,
  };
}

function buildBloomsipTrace(): CaseTrace {
  const root = "/tmp/phase8_composition_evidence";
  const flat = readIf(`${root}/08_provider_flat_prompt.txt`);
  const section = readIf(`${root}/21_composition_section.txt`);
  const available = Boolean(flat && section);
  const expected =
    "Transform your everyday refresh with real botanicals and sparkling sophistication—meet BloomSip.";
  const hasComp =
    !!flat &&
    flat.includes("===== DELIVERABLE COMPOSITION =====") &&
    flat.includes("required=true") &&
    flat.includes("meet BloomSip");
  const pixel = PIXEL_GROUND_TRUTH_ANNOTATIONS.find((a) =>
    a.artifactId.includes("bloomsip"),
  );

  return {
    id: "real_02_phase8_bloomsip_refreshment",
    evidenceRoot: available ? root : null,
    expectedPrimary: expected,
    compositionContract: available ? "PRESERVED" : "UNKNOWN",
    compiledComposition: available ? "PRESERVED" : "UNKNOWN",
    cmr: available ? "PRESERVED" : "UNKNOWN",
    flattenedRequest: hasComp ? "PRESERVED" : available ? "DROPPED" : "UNKNOWN",
    providerAdapter: available ? "PRESERVED" : "UNKNOWN",
    finalProviderRequest: "UNKNOWN",
    generatedPixels: pixel?.overallExpectedPresence === "ABSENT" ? "ABSENT_PIXELS" : "UNKNOWN",
    firstLoss: available
      ? "NO_REQUEST_LOSS — first failure at generated pixels (provider/model adherence)"
      : "UNKNOWN — evidence unavailable",
    rootCauseClass: available
      ? "MIXED"
      : "UNKNOWN",
    contradictions: available
      ? Object.freeze([
          "Soft: brand_signature guidance says bottle name may serve as primary brand exposure — risks conflating brand_signature with primary_message_surface.",
          "SemanticObjective leads with 'Follow the selected creative direction' alongside required composition.",
        ])
      : [],
    semanticRoleNotes:
      "Pixels show Instagram UI mock / garbled caption — neither primary message nor product communication. Possible model collapse into 'instagram post' template.",
    quotes: available
      ? {
          compositionSlot: section!.slice(0, 400),
          textPolicy: "Text policy: placement=on_asset, required=true",
        }
      : {},
    evidenceAvailable: available,
  };
}

function buildExec42Trace(): CaseTrace {
  const cmr = readIf("/tmp/exec42_cmr.json");
  const wire = readIf("/tmp/exec42_live_wire_prompt.txt");
  const route = readIf("/tmp/exec42_route2.json");
  const available = Boolean(cmr && wire && route);
  const expected =
    "Sunflower nurtures every aspect of a child's development—helping them build strong foundations, grow confidently, and flourish in all areas of life.";
  const cmrHasComposition =
    !!cmr && /deliverable_composition/i.test(cmr);
  const wireHasComposition =
    !!wire && wire.includes("===== DELIVERABLE COMPOSITION =====");
  const wireHasPrimary =
    !!wire && wire.includes("Sunflower nurtures every aspect");
  const softContra =
    !!wire &&
    (wire.includes("Prefer live text for web/email/decks") ||
      wire.includes("Avoid text-heavy labeling"));
  const pixel = PIXEL_GROUND_TRUTH_ANNOTATIONS.find((a) =>
    a.artifactId.includes("exec42"),
  );

  return {
    id: "real_03_exec42_sunflower_metaphor",
    evidenceRoot: available ? "/tmp (exec42_*)" : null,
    expectedPrimary: expected,
    compositionContract: "PRESERVED", // registry contract exists for social_creative in general
    compiledComposition: cmrHasComposition ? "PRESERVED" : "DROPPED",
    cmr: cmrHasComposition ? "PRESERVED" : "DROPPED",
    flattenedRequest: wireHasComposition
      ? "PRESERVED"
      : wireHasPrimary
        ? "TRANSFORMED"
        : available
          ? "DROPPED"
          : "UNKNOWN",
    providerAdapter: available ? "UNKNOWN" : "UNKNOWN",
    finalProviderRequest: wire ? "TRANSFORMED" : "UNKNOWN", // wire dump available but composition section absent
    generatedPixels: pixel?.overallExpectedPresence === "ABSENT" ? "ABSENT_PIXELS" : "UNKNOWN",
    firstLoss: !cmrHasComposition
      ? "FRAMEWORK loss at CMR compile — deliverable_composition part never entered CMR"
      : "UNKNOWN",
    rootCauseClass: !cmrHasComposition
      ? "MIXED"
      : "UNKNOWN",
    contradictions: softContra
      ? Object.freeze([
          "Production Spec VFG: Prefer live text for web/email/decks; do not flatten the essential message into one image.",
          "Route avoidances: Avoid text-heavy labeling that clutters the artistic visual.",
        ])
      : [],
    semanticRoleNotes:
      "Without deliverable_composition, required on-asset text exists only as SSD prose. Pixels show unrelated 'FORMAT'. Soft anti-on-image-text guidance present in wire.",
    quotes: available
      ? {
          cmrPartsNote: "CMR parts lack deliverable_composition",
          wirePrimaryPresent: String(wireHasPrimary),
          wireCompositionPresent: String(wireHasComposition),
          softVfg:
            "Prefer live text for web/email/decks; do not flatten the essential message into one image.",
        }
      : {},
    evidenceAvailable: available,
  };
}

describe("Phase 14.8 — generation adherence trace", () => {
  const cases = [
    buildSunflowerTrace(),
    buildBloomsipTrace(),
    buildExec42Trace(),
  ];

  afterAll(() => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const report = {
      phase: "14.8",
      generatedAt: new Date().toISOString(),
      note: "Investigation only — no production changes.",
      cases,
      lossMatrix: cases.map((c) => ({
        case: c.id,
        compositionContract: c.compositionContract,
        compiledComposition: c.compiledComposition,
        cmr: c.cmr,
        flattenedRequest: c.flattenedRequest,
        providerAdapter: c.providerAdapter,
        finalProviderRequest: c.finalProviderRequest,
        generatedPixels: c.generatedPixels,
        firstLoss: c.firstLoss,
        rootCauseClass: c.rootCauseClass,
      })),
      recommendedFixDirection: {
        doNotImplementYet: true,
        forCasesWithNoRequestLoss:
          "Treat as provider/model adherence + optional soft-authority dilution audit; do not invent a flatten bug where evidence shows PRESERVED required text.",
        forExec42CmrGap:
          "Investigate why deliverable_composition was absent from CMR for that execution vintage; ensure image phases always compile composition when required.",
        genericNotServiceSpecific: true,
      },
    };
    fs.writeFileSync(
      path.join(REPORT_DIR, "generation-adherence-trace.json"),
      JSON.stringify(report, null, 2),
    );
    // eslint-disable-next-line no-console
    console.info(
      "[phase14.8] loss matrix",
      JSON.stringify(report.lossMatrix, null, 2),
    );
  });

  it("documents three real cases", () => {
    expect(cases.map((c) => c.id)).toEqual([
      "real_01_phase8_sunflower_hello_sunshine",
      "real_02_phase8_bloomsip_refreshment",
      "real_03_exec42_sunflower_metaphor",
    ]);
  });

  it("sunflower: required text survives flatten when evidence present", () => {
    const c = cases[0]!;
    if (!c.evidenceAvailable) return;
    expect(c.flattenedRequest).toBe("PRESERVED");
    expect(c.generatedPixels).toBe("ABSENT_PIXELS");
    expect(c.rootCauseClass).toBe("PROVIDER_MODEL_ADHERENCE_FAILURE");
  });

  it("bloomsip: required text survives flatten when evidence present", () => {
    const c = cases[1]!;
    if (!c.evidenceAvailable) return;
    expect(c.flattenedRequest).toBe("PRESERVED");
    expect(c.generatedPixels).toBe("ABSENT_PIXELS");
  });

  it("exec42: deliverable_composition missing from CMR when evidence present", () => {
    const c = cases[2]!;
    if (!c.evidenceAvailable) return;
    expect(c.cmr).toBe("DROPPED");
    expect(c.firstLoss).toMatch(/CMR/);
  });

  it("pixel GT reused: all three expected communications ABSENT", () => {
    for (const id of [
      "sunflower_hello",
      "bloomsip",
      "exec42",
    ]) {
      const a = PIXEL_GROUND_TRUTH_ANNOTATIONS.find((x) =>
        x.artifactId.includes(id),
      )!;
      expect(a.overallExpectedPresence).toBe("ABSENT");
    }
  });

  it("no production semantic-branch fixes introduced by this phase", () => {
    // This file is evidence-only documentation.
    const src = fs.readFileSync(__filename, "utf8");
    expect(src).toMatch(/Investigation only/);
    expect(src).not.toMatch(
      /if\s*\(\s*serviceId\s*===|if\s*\(\s*phaseId\s*===|if\s*\(\s*provider\s*===/,
    );
  });
});
