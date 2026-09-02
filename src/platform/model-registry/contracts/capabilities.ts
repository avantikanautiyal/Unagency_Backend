/**
 * Model capability contracts.
 */

export interface ModelCapability {
  readonly capabilityId: string;
  readonly label: string;
  readonly description?: string;
  readonly supported: boolean;
}

export interface ModelCapabilityFlags {
  readonly streaming: boolean;
  readonly functionCalling: boolean;
  readonly structuredOutput: boolean;
  readonly reasoning: boolean;
  readonly vision: boolean;
  readonly imageGeneration: boolean;
  readonly videoGeneration: boolean;
  readonly audioInput: boolean;
  readonly audioOutput: boolean;
  readonly embeddings: boolean;
}
