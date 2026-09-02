/**
 * Step 4B — Benchmark validity model.
 * Task → required capability → execution interface → output form → contract → validation.
 */

import type { BenchmarkCase } from "./benchmark-case";
import type { BenchmarkExecutionInterface } from "./benchmark-execution-profile";
import { resolveBenchmarkCapability } from "./benchmark-capability-resolver";

export type BenchmarkValidationMethod =
  | "output_contract_validation"
  | "artifact_inspection"
  | "build_test_execution"
  | "runtime_validation"
  | "async_job_polling";

export type BenchmarkIntent =
  | "model_quality"
  | "control_text"
  | "control_structured"
  | "control_artifact"
  | "control_tool_enabled"
  | "execution_pipeline";

export type BenchmarkValiditySpec = {
  readonly task: string;
  readonly requiredCapabilityId: string;
  readonly requiredModality: string;
  readonly requiresStructuredOutput: boolean;
  readonly requiredExecutionInterfaces: readonly BenchmarkExecutionInterface[];
  readonly expectedOutputForm: string;
  readonly contractOutputKind: string;
  readonly validationMethods: readonly BenchmarkValidationMethod[];
  readonly intent: BenchmarkIntent;
  /** True only when executor + contract align for pure cross-model quality comparison. */
  readonly validForPureModelComparison: boolean;
  readonly architectureNote: string;
};

const TEXT_OUTPUT_FORM = "Plain or structured text suitable for Step 2 text/schema validation";
const WEB_PROJECT_FORM =
  "WebProject JSON (routes, files, build metadata) — OS materializes deferred_website artifact";
const PRESENTATION_FORM =
  "PresentationRoutes JSON (slides, export metadata) — OS materializes presentation artifact";
const DOCUMENT_FORM = "Structured document JSON (sections/plan) validated against document contract";
const IMAGE_FORM = "Binary image artifact via image.generate provider dispatch";
const VIDEO_FORM = "Async video job + polled artifact via video.generate";

function interfacesForOutputKind(kind: string): readonly BenchmarkExecutionInterface[] {
  const k = kind.toLowerCase();
  if (k === "deferred_website") {
    return Object.freeze([
      "text_prompt",
      "structured_output_mode",
      "artifact_creation",
      "build_execution",
      "runtime_execution",
    ]);
  }
  if (k === "presentation") {
    return Object.freeze([
      "text_prompt",
      "structured_output_mode",
      "artifact_creation",
    ]);
  }
  if (k === "document" || k === "email") {
    return Object.freeze(["text_prompt", "structured_output_mode"]);
  }
  if (k === "image" || k === "image_mockup" || k === "image_3d_mockup") {
    return Object.freeze(["image_generation", "artifact_creation"]);
  }
  if (k === "edited_image") {
    return Object.freeze(["image_editing", "artifact_creation"]);
  }
  if (k === "video" || k === "animation") {
    return Object.freeze(["video_generation_async", "artifact_creation"]);
  }
  if (k === "audio") {
    return Object.freeze(["audio_generation", "artifact_creation"]);
  }
  return Object.freeze(["text_prompt"]);
}

function expectedOutputFormForKind(kind: string): string {
  const k = kind.toLowerCase();
  if (k === "deferred_website") return WEB_PROJECT_FORM;
  if (k === "presentation") return PRESENTATION_FORM;
  if (k === "document") return DOCUMENT_FORM;
  if (k === "email") return "Structured email JSON (subject/body/sections)";
  if (k === "image" || k === "image_mockup" || k === "image_3d_mockup" || k === "edited_image") {
    return IMAGE_FORM;
  }
  if (k === "video" || k === "animation") return VIDEO_FORM;
  if (k === "audio") return "Audio artifact via audio.synthesize";
  return TEXT_OUTPUT_FORM;
}

function validationMethodsForKind(kind: string): readonly BenchmarkValidationMethod[] {
  const k = kind.toLowerCase();
  if (k === "deferred_website") {
    return Object.freeze([
      "output_contract_validation",
      "artifact_inspection",
      "build_test_execution",
      "runtime_validation",
    ]);
  }
  if (k === "presentation") {
    return Object.freeze(["output_contract_validation", "artifact_inspection"]);
  }
  if (k === "video" || k === "animation") {
    return Object.freeze(["output_contract_validation", "async_job_polling", "artifact_inspection"]);
  }
  if (k === "image" || k === "image_mockup" || k === "image_3d_mockup" || k === "edited_image") {
    return Object.freeze(["output_contract_validation", "artifact_inspection"]);
  }
  return Object.freeze(["output_contract_validation"]);
}

function architectureNoteForKind(kind: string): string {
  const k = kind.toLowerCase();
  if (k === "deferred_website") {
    return (
      "Production: model produces WebProject structured plan → website-generation/OS materializes " +
      "html/zip. Step 5 benchmark_os_executor routes through DirectExecution + website-export-materializer. " +
      "Runtime validation remains NOT_AUTOMATED when executor lacks runtime_execution interface."
    );
  }
  if (k === "presentation") {
    return (
      "Production: model produces PresentationRoutes JSON → presentation-generation materializes " +
      "slides/export. Step 5 benchmark_os_executor routes through DirectExecution + document-export-materializer."
    );
  }
  if (k === "document" || k === "email") {
    return (
      "Model produces structured JSON via structured_output_mode; Step 5 OS executor materializes " +
      "document/email artifacts through document-export-materializer when execution profile supports artifact_creation."
    );
  }
  if (k === "image" || k === "image_mockup" || k === "image_3d_mockup" || k === "edited_image") {
    return "Requires image-capable provider dispatch (image.generate/image.edit), not text.generate.";
  }
  if (k === "video" || k === "animation") {
    return "Requires async video.generate job polling; sync benchmark executor cannot complete video artifact path.";
  }
  return "Text output benchmark — executor text_prompt is sufficient for fair text model comparison.";
}

function intentForKind(kind: string): BenchmarkIntent {
  const k = kind.toLowerCase();
  if (k === "text" || k === "email") return "control_text";
  if (k === "document") return "control_structured";
  if (k === "deferred_website" || k === "presentation") return "execution_pipeline";
  if (k.includes("image")) return "control_artifact";
  if (k === "video" || k === "animation") return "control_artifact";
  return "model_quality";
}

function validForPureModelComparison(
  kind: string,
  requiredInterfaces: readonly BenchmarkExecutionInterface[],
): boolean {
  const k = kind.toLowerCase();
  // Text-native deliverables without artifact OS pipeline
  if (k === "text") return true;
  if (k === "social" || (k === "document" && requiredInterfaces.length <= 2)) {
    // social copywriting etc. — text output
    return k !== "deferred_website" && k !== "presentation";
  }
  // Pure text social/content benchmarks
  if (
    ![
      "deferred_website",
      "presentation",
      "image",
      "image_mockup",
      "image_3d_mockup",
      "edited_image",
      "video",
      "animation",
      "audio",
    ].includes(k)
  ) {
    // dynamic and general text kinds
    if (k === "document" || k === "email") return false; // needs structured_output_mode
    return true;
  }
  return false;
}

export function resolveBenchmarkValidity(
  benchmarkCase: BenchmarkCase,
): BenchmarkValiditySpec {
  const resolved = resolveBenchmarkCapability(benchmarkCase);
  const kind = benchmarkCase.outputKind.toLowerCase();
  const requiredExecutionInterfaces = interfacesForOutputKind(kind);

  // Social copywriting and similar text benchmarks
  const isTextNative =
    kind === "text" ||
    (resolved.modality === "text" &&
      !["deferred_website", "presentation", "document", "email"].includes(kind));

  const validForComparison =
    isTextNative ||
    (kind === "document"
      ? false
      : validForPureModelComparison(kind, requiredExecutionInterfaces));

  return Object.freeze({
    task: benchmarkCase.objective,
    requiredCapabilityId: resolved.capabilityId,
    requiredModality: resolved.modality,
    requiresStructuredOutput: resolved.requiresStructuredOutput,
    requiredExecutionInterfaces,
    expectedOutputForm: expectedOutputFormForKind(kind),
    contractOutputKind: benchmarkCase.outputKind,
    validationMethods: validationMethodsForKind(kind),
    intent:
      benchmarkCase.benchmarkId.startsWith("bench.social.") && kind !== "image"
        ? "control_text"
        : intentForKind(kind),
    validForPureModelComparison:
      kind === "deferred_website" || kind === "presentation" || kind === "video" || kind === "animation"
        ? false
        : kind.includes("image")
          ? false
          : kind === "document" || kind === "email"
            ? false
            : isTextNative || benchmarkCase.service === "social",
    architectureNote: architectureNoteForKind(kind),
  });
}
