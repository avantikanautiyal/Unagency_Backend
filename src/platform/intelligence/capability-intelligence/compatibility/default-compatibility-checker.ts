/**
 * Compatibility checker.
 */

import { success, type Result } from "../../shared/result";
import type { CapabilityDefinitionRecord } from "../contracts/capability";
import type { CapabilityDependencies } from "../contracts/graph";
import type { CapabilityCompatibilityReport } from "../contracts/scoring";
import type { ICompatibilityChecker } from "../interfaces/capability-intelligence";

export class DefaultCompatibilityChecker implements ICompatibilityChecker {
  check(
    capabilities: readonly CapabilityDefinitionRecord[],
    dependencies: CapabilityDependencies
  ): Result<CapabilityCompatibilityReport> {
    const unresolved = new Set(dependencies.unresolved);

    const entries = capabilities.map((cap) => {
      const missing = cap.dependencies.filter((d) => unresolved.has(d));
      const unsupported: string[] = [];
      if (cap.maturity === "deprecated") {
        unsupported.push("deprecated_capability");
      }
      if (cap.qualityExpectations.requireHumanReview && !cap.requiredGovernance.length) {
        unsupported.push("missing_governance_for_human_review");
      }

      const compatible = missing.length === 0 && !unsupported.includes("deprecated_capability");
      return {
        capabilityId: cap.capabilityId,
        compatible,
        missingDependencies: missing,
        unsupportedRequirements: unsupported,
        notes: compatible
          ? "Compatible with current dependency set."
          : `Incompatible: missing=[${missing.join(",")}] unsupported=[${unsupported.join(",")}]`,
      };
    });

    return success({
      entries,
      overallCompatible: entries.every((e) => e.compatible) && unresolved.size === 0,
    });
  }
}
