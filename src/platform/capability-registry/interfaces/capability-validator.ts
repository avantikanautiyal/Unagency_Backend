/**
 * Capability validator port.
 *
 * Purpose: Validate capability definitions before registration.
 * Responsibilities: Required fields, version, schemas, policies, constraints.
 * Usage: Called by CapabilityRegistry.register/replace.
 * Future Extension: Pluggable validation rules.
 */

import type { Result } from "../../core/result";
import type { CapabilityDefinition } from "../contracts/capability-definition";

export interface ICapabilityValidator {
  validate(capability: CapabilityDefinition): Result<CapabilityDefinition>;
}
