/**
 * Compliance, security, and privacy assessment contracts.
 */

import type { ComplianceFramework, PrivacyClassification } from "./enums";

export interface ComplianceCheck {
  readonly checkId: string;
  readonly framework: ComplianceFramework;
  readonly passed: boolean;
  readonly requirement: string;
  readonly finding?: string;
}

export interface ComplianceAssessment {
  readonly assessmentId: string;
  readonly checks: readonly ComplianceCheck[];
  readonly compliant: boolean;
  readonly frameworks: readonly ComplianceFramework[];
  readonly rationale: string;
}

export interface SecurityCheck {
  readonly checkId: string;
  readonly area: string;
  readonly passed: boolean;
  readonly description: string;
}

export interface SecurityAssessment {
  readonly assessmentId: string;
  readonly checks: readonly SecurityCheck[];
  readonly secure: boolean;
  readonly rationale: string;
}

export interface PrivacyFinding {
  readonly findingId: string;
  readonly classification: PrivacyClassification;
  readonly description: string;
  readonly mitigation: string;
}

export interface PrivacyAssessment {
  readonly assessmentId: string;
  readonly findings: readonly PrivacyFinding[];
  readonly piiExposure: boolean;
  readonly regionRestrictions: readonly string[];
  readonly dataResidency: string;
  readonly rationale: string;
}
