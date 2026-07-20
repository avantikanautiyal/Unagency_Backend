/**
 * StoreSecret input builder.
 */

import type { StoreSecretInput } from "../contracts/secret";
import type { SecretType } from "../contracts/enums";

export class StoreSecretInputBuilder {
  private name = "";
  private type: SecretType = "third_party_api_key";
  private value = "";
  private labels?: Record<string, string>;
  private expiresAt?: string;
  private tenantId?: string;
  private actor?: string;
  private reason?: string;

  static create(): StoreSecretInputBuilder {
    return new StoreSecretInputBuilder();
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withType(type: SecretType): this {
    this.type = type;
    return this;
  }

  withValue(value: string): this {
    this.value = value;
    return this;
  }

  withLabels(labels: Record<string, string>): this {
    this.labels = labels;
    return this;
  }

  withExpiresAt(iso: string): this {
    this.expiresAt = iso;
    return this;
  }

  withTenantId(id: string): this {
    this.tenantId = id;
    return this;
  }

  withActor(actor: string): this {
    this.actor = actor;
    return this;
  }

  withReason(reason: string): this {
    this.reason = reason;
    return this;
  }

  build(): StoreSecretInput {
    return {
      name: this.name,
      type: this.type,
      value: this.value,
      labels: this.labels,
      expiresAt: this.expiresAt,
      tenantId: this.tenantId,
      actor: this.actor,
      reason: this.reason,
    };
  }
}
