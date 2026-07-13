import type { DataClassification } from "../contracts/security-context";
import type { IDataClassifier } from "../interfaces/security";

/**
 * M0 classifier using simple keyword heuristics.
 * Not a production PII detector.
 */
export class DefaultDataClassifier implements IDataClassifier {
  private readonly defaultClassification: DataClassification;

  constructor(defaultClassification: DataClassification = "internal") {
    this.defaultClassification = defaultClassification;
  }

  classify(contentHint: string): DataClassification {
    const lower = contentHint.toLowerCase();
    if (
      lower.includes("ssn") ||
      lower.includes("passport") ||
      lower.includes("email") ||
      lower.includes("phone")
    ) {
      return "pii";
    }
    if (lower.includes("secret") || lower.includes("credential")) {
      return "restricted";
    }
    if (lower.includes("confidential")) {
      return "confidential";
    }
    return this.defaultClassification;
  }

  redact(value: string, classification: DataClassification): string {
    if (classification === "public" || classification === "internal") {
      return value;
    }
    if (value.length <= 4) {
      return "****";
    }
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
}
