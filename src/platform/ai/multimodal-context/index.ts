export type {
  MultimodalSourceType,
  MultimodalModality,
  MultimodalDeliveryStatus,
  MultimodalAccessKind,
  MultimodalProviderDelivery,
  MultimodalContextItem,
  MultimodalContextBounds,
  MultimodalContext,
  MultimodalInputDescriptor,
  ProviderMultimodalCapabilities,
  MultimodalReferenceRole,
  ReferenceRoleResolutionSource,
  ResolvedCanonicalReferenceRole,
  ImageReferenceAdaptationPlan,
  ProviderReferenceRoleObservability,
} from "./types";

export type { MultimodalProviderProjection } from "./resolve";

export {
  MULTIMODAL_SELECTION_METHOD,
  DEFAULT_MULTIMODAL_BOUNDS,
  DEFAULT_TEXT_PROVIDER_MULTIMODAL_CAPABILITIES,
  XLSX_MIME,
  DOCX_MIME,
  PPTX_MIME,
  PDF_MIME,
  MULTIMODAL_REFERENCE_ROLES,
  isMultimodalReferenceRole,
  resolveMultimodalReferenceRole,
  resolveCanonicalReferenceRoleWithSource,
  roleAllowsStyleReferenceChannel,
  promptGuidanceForReferenceRole,
  planImageReferenceAdaptation,
  buildProviderReferenceRoleObservability,
} from "./types";

export {
  inferMultimodalModality,
  selectMultimodalContext,
  projectMultimodalForProvider,
  summarizeMultimodalForTrace,
} from "./resolve";
