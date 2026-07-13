/**
 * Prompt Compiler immutable contracts.
 * Provider-independent prompt compilation models.
 */

import type { CapabilityId } from "../../shared/identifiers";
import type { IntelligenceContext } from "../../context/contracts/intelligence-context";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";

export type PromptNodeKind =
  | "document"
  | "section"
  | "text"
  | "variable"
  | "constraint"
  | "asset"
  | "knowledge_ref";

export type PromptSectionRole =
  | "system"
  | "identity"
  | "brand"
  | "capability"
  | "knowledge"
  | "instructions"
  | "user"
  | "output";

export interface PromptVariable {
  readonly name: string;
  readonly path: string;
  readonly required: boolean;
  readonly defaultValue?: string;
  readonly description?: string;
}

export interface PromptConstraint {
  readonly id: string;
  readonly kind: "max_tokens" | "required_section" | "required_variable" | "max_sections" | "custom";
  readonly value?: string | number | boolean;
  readonly message?: string;
}

export interface PromptAsset {
  readonly id: string;
  readonly kind: "text" | "reference" | "style";
  readonly content?: string;
  readonly uri?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface PromptNode {
  readonly id: string;
  readonly kind: PromptNodeKind;
  readonly role?: PromptSectionRole;
  readonly text?: string;
  readonly variableName?: string;
  readonly children?: readonly PromptNode[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface PromptSection {
  readonly id: string;
  readonly role: PromptSectionRole;
  readonly title?: string;
  readonly nodes: readonly PromptNode[];
  readonly order: number;
}

export interface PromptAST {
  readonly root: PromptNode;
  readonly sections: readonly PromptSection[];
  readonly variables: readonly PromptVariable[];
  readonly constraints: readonly PromptConstraint[];
}

export interface PromptDocument {
  readonly id: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly ast: PromptAST;
  readonly assets: readonly PromptAsset[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface PromptTemplate {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly capabilityId?: CapabilityId | string;
  readonly body: string;
  readonly variables: readonly PromptVariable[];
  readonly constraints: readonly PromptConstraint[];
  readonly sections?: readonly PromptSectionRole[];
  readonly isActive: boolean;
}

export interface PromptVersion {
  readonly templateId: string;
  readonly version: string;
  readonly createdAt: string;
  readonly changelog?: string;
  readonly isStable: boolean;
}

export interface PromptCompilationRequest {
  readonly templateId: string;
  readonly templateVersion?: string;
  readonly context: IntelligenceContext;
  readonly knowledge: KnowledgeSnapshot;
  readonly variables?: Readonly<Record<string, string>>;
  readonly assets?: readonly PromptAsset[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/**
 * Provider-independent compiled prompt.
 * Renderers may later adapt this to vendor formats.
 */
export interface CompiledPrompt {
  readonly compilationId: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly document: PromptDocument;
  readonly messages: readonly CompiledPromptMessage[];
  readonly resolvedVariables: Readonly<Record<string, string>>;
  readonly constraints: readonly PromptConstraint[];
  readonly checksum: string;
  readonly compiledAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CompiledPromptMessage {
  readonly role: PromptSectionRole;
  readonly content: string;
  readonly order: number;
}

export interface PromptCompilationResult {
  readonly compiled: CompiledPrompt;
  readonly warnings: readonly string[];
}
