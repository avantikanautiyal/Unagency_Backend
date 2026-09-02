/**
 * Benchmark catalog — generated from Step 1 service taxonomy.
 * One enabled case per service/subtype; industry variants for material services.
 */

import { enumerateServiceKeys } from "../../../../../os/contracts/output-contracts/composer";
import { defaultServiceOutputContractRegistry } from "../../../../../os/contracts/output-contracts/service-contract-registry";
import { INDUSTRY_OVERLAYS } from "../../../../../os/contracts/output-contracts/industry-overlays";
import { SOCIAL_FORMAT_IDS } from "../../../../../os/contracts/output-contracts/format-overlays";
import type { BenchmarkCase, BenchmarkComplexity, BenchmarkSuite } from "../contracts/benchmark-case";
import { BENCHMARK_SYSTEM_VERSION } from "../contracts/benchmark-case";

const INDUSTRY_BENCHMARK_SERVICES = new Set([
  "website",
  "branding",
  "presentations",
  "social",
  "video",
  "print",
  "ads",
]);

const COMPLEXITY_BRIEF: Record<BenchmarkComplexity, string> = {
  low: "Create a simple, focused deliverable with minimal requirements.",
  medium: "Create a professional deliverable meeting standard industry expectations.",
  high: "Create a premium, complex deliverable with advanced requirements and polish.",
};

function suiteForKind(kind: string): string {
  switch (kind) {
    case "deferred_website":
      return "suite.website";
    case "presentation":
      return "suite.presentation";
    case "document":
      return "suite.document";
    case "image":
    case "image_mockup":
    case "image_3d_mockup":
    case "edited_image":
      return "suite.image";
    case "video":
    case "animation":
      return "suite.video";
    case "email":
      return "suite.email";
    case "text":
      return "suite.content";
    default:
      return "suite.general";
  }
}

function briefForService(
  service: string,
  subtype: string,
  complexity: BenchmarkComplexity,
  industry?: string,
): string {
  const contract = defaultServiceOutputContractRegistry.getContractForServiceKey(
    `${service}/${subtype}`,
  );
  const deliverable = contract?.exampleDeliverable ?? `${service}/${subtype} deliverable`;
  const industryPart = industry ? ` for the ${industry} industry` : "";
  return `${COMPLEXITY_BRIEF[complexity]} Deliverable: ${deliverable}${industryPart}.`;
}

function buildCase(input: {
  service: string;
  subtype: string;
  complexity?: BenchmarkComplexity;
  industry?: string;
  platform?: string;
  format?: string;
  suffix?: string;
}): BenchmarkCase {
  const complexity = input.complexity ?? "medium";
  const contract =
    input.platform || input.format
      ? defaultServiceOutputContractRegistry.getServiceContract(
          input.service,
          input.subtype,
          { platform: input.platform, format: input.format },
        )
      : defaultServiceOutputContractRegistry.getContractForServiceKey(
          `${input.service}/${input.subtype}`,
        );
  const outputKind = contract?.outputKind ?? "dynamic";
  const suffix = input.suffix ?? "";
  const industryPart = input.industry ? `.${input.industry}` : "";
  const formatPart = input.format ? `.fmt.${input.format}` : "";
  const benchmarkId = `bench.${input.service}.${input.subtype}${industryPart}${formatPart}${suffix ? `.${suffix}` : ""}`;

  return Object.freeze({
    benchmarkId,
    version: BENCHMARK_SYSTEM_VERSION,
    suiteId: suiteForKind(outputKind),
    service: input.service,
    subtype: input.subtype,
    outputKind,
    industry: input.industry,
    platform: input.platform,
    format: input.format,
    complexity,
    objective: `Benchmark ${input.service}/${input.subtype}${input.industry ? ` (${input.industry})` : ""}`,
    inputBrief: briefForService(input.service, input.subtype, complexity, input.industry),
    contractReference: Object.freeze({
      serviceKey: `${input.service}/${input.subtype}`,
      contractIdPrefix: `service.${input.service}.${input.subtype}`,
    }),
    expectedConstraints: contract
      ? Object.freeze([...contract.definitionOfDone.mandatoryChecks.slice(0, 5)])
      : undefined,
    evaluationProfile: "full_contract_validation" as const,
    enabled: true,
    metadata: Object.freeze({
      generatedFrom: "service_output_map",
      outputKind,
    }),
  });
}

let cachedCases: readonly BenchmarkCase[] | undefined;
let cachedSuites: readonly BenchmarkSuite[] | undefined;

export function buildBenchmarkCatalog(): readonly BenchmarkCase[] {
  if (cachedCases) return cachedCases;

  const cases: BenchmarkCase[] = [];

  for (const key of enumerateServiceKeys()) {
    const [service, subtype] = key.split("/");
    if (!service || !subtype) continue;

    cases.push(buildCase({ service, subtype, complexity: "medium" }));

    if (INDUSTRY_BENCHMARK_SERVICES.has(service)) {
      for (const overlayId of Object.keys(INDUSTRY_OVERLAYS)) {
        cases.push(
          buildCase({
            service,
            subtype,
            complexity: "medium",
            industry: overlayId,
          }),
        );
      }
    }

    if (service === "website" || service === "presentations") {
      cases.push(
        buildCase({ service, subtype, complexity: "high", suffix: "complex" }),
      );
    }
  }

  for (const formatId of SOCIAL_FORMAT_IDS) {
    cases.push(
      buildCase({
        service: "social",
        subtype: "content-design",
        format: formatId,
        platform: "instagram",
        complexity: "medium",
      }),
    );
  }

  cachedCases = Object.freeze(cases);
  return cachedCases;
}

export function buildBenchmarkSuites(): readonly BenchmarkSuite[] {
  if (cachedSuites) return cachedSuites;

  const cases = buildBenchmarkCatalog();
  const suiteMap = new Map<string, string[]>();

  for (const c of cases) {
    const ids = suiteMap.get(c.suiteId) ?? [];
    ids.push(c.benchmarkId);
    suiteMap.set(c.suiteId, ids);
  }

  const labels: Record<string, string> = {
    "suite.website": "Website Benchmark Suite",
    "suite.presentation": "Presentation Benchmark Suite",
    "suite.document": "Document Benchmark Suite",
    "suite.image": "Image Benchmark Suite",
    "suite.video": "Video Benchmark Suite",
    "suite.email": "Email Benchmark Suite",
    "suite.content": "Content Benchmark Suite",
    "suite.general": "General Benchmark Suite",
  };

  const kinds: Record<string, string[]> = {
    "suite.website": ["deferred_website"],
    "suite.presentation": ["presentation"],
    "suite.document": ["document"],
    "suite.image": ["image", "image_mockup", "image_3d_mockup", "edited_image"],
    "suite.video": ["video", "animation"],
    "suite.email": ["email"],
    "suite.content": ["text"],
    "suite.general": ["dynamic"],
  };

  cachedSuites = Object.freeze(
    [...suiteMap.entries()].map(([suiteId, caseIds]) =>
      Object.freeze({
        suiteId,
        label: labels[suiteId] ?? suiteId,
        outputKinds: Object.freeze(kinds[suiteId] ?? ["dynamic"]),
        caseIds: Object.freeze(caseIds),
      }),
    ),
  );
  return cachedSuites;
}

export function getBenchmarkCase(benchmarkId: string): BenchmarkCase | undefined {
  return buildBenchmarkCatalog().find((c) => c.benchmarkId === benchmarkId);
}

export function listBenchmarkCases(filter?: {
  suiteId?: string;
  service?: string;
  outputKind?: string;
  industry?: string;
  enabled?: boolean;
}): readonly BenchmarkCase[] {
  let cases = buildBenchmarkCatalog();
  if (filter?.suiteId) cases = cases.filter((c) => c.suiteId === filter.suiteId);
  if (filter?.service) cases = cases.filter((c) => c.service === filter.service);
  if (filter?.outputKind) cases = cases.filter((c) => c.outputKind === filter.outputKind);
  if (filter?.industry) cases = cases.filter((c) => c.industry === filter.industry);
  if (filter?.enabled !== undefined) cases = cases.filter((c) => c.enabled === filter.enabled);
  return cases;
}

export function resetBenchmarkCatalogCache(): void {
  cachedCases = undefined;
  cachedSuites = undefined;
}
