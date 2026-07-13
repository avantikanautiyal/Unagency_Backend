/**
 * Policy contract catalog (architecture only).
 */

export type PolicyKind =
  | "provider"
  | "capability"
  | "execution"
  | "retry"
  | "timeout"
  | "cost"
  | "evaluation"
  | "security"
  | "quota";

export interface PolicyDescriptor {
  readonly kind: PolicyKind;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
}
