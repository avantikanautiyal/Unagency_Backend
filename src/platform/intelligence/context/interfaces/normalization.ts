import type { IntelligenceContext } from "../contracts/intelligence-context";

export interface IContextNormalizer {
  normalize(context: IntelligenceContext): IntelligenceContext;
}
