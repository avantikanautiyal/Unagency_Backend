/**
 * Variable resolution from context, knowledge, and explicit overrides.
 */

import type { IntelligenceContext } from "../../context/contracts/intelligence-context";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";
import type { PromptVariable } from "../contracts/prompt-models";

export interface VariableResolutionInput {
  readonly context: IntelligenceContext;
  readonly knowledge: KnowledgeSnapshot;
  readonly overrides?: Readonly<Record<string, string>>;
  readonly variables: readonly PromptVariable[];
}

export class VariableResolver {
  resolve(input: VariableResolutionInput): {
    readonly values: Readonly<Record<string, string>>;
    readonly missing: readonly string[];
  } {
    const values: Record<string, string> = {};
    const missing: string[] = [];

    for (const variable of input.variables) {
      const override = input.overrides?.[variable.name];
      if (override !== undefined) {
        values[variable.name] = override;
        continue;
      }

      const fromPath = resolvePath(variable.path, input.context, input.knowledge);
      if (fromPath !== undefined) {
        values[variable.name] = fromPath;
        continue;
      }

      if (variable.defaultValue !== undefined) {
        values[variable.name] = variable.defaultValue;
        continue;
      }

      if (variable.required) {
        missing.push(variable.name);
      } else {
        values[variable.name] = "";
      }
    }

    return { values, missing };
  }

  inject(
    text: string,
    values: Readonly<Record<string, string>>
  ): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_match, name: string) => {
      const key = name.trim();
      return values[key] ?? "";
    });
  }
}

function resolvePath(
  path: string,
  context: IntelligenceContext,
  knowledge: KnowledgeSnapshot
): string | undefined {
  if (path === "knowledge.summary") {
    return knowledge.documents
      .map((doc) => doc.metadata.title ?? doc.content.slice(0, 120))
      .join(" | ");
  }

  if (path === "execution.inputHints") {
    return JSON.stringify(context.execution.inputHints ?? {});
  }

  const parts = path.split(".");
  let current: unknown = {
    platform: context.platform,
    identity: context.identity,
    brand: context.brand,
    capability: context.capability,
    execution: context.execution,
    organization: context.organization,
    workspace: context.workspace,
    user: context.user,
    security: context.security,
    language: context.language,
    locale: context.locale,
  };

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (current === undefined || current === null) {
    return undefined;
  }
  if (typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }
  return JSON.stringify(current);
}
