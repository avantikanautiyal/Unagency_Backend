/**
 * Provider Identity & Trust Platform factory.
 *
 * Purpose: Wire the identity engine with in-memory subsystems via DI.
 * Responsibilities: construct default subsystems; allow overrides.
 * Usage: Primary entry point for constructing the identity platform.
 * Future Extension: Secret managers and durable stores plug in here.
 */

import { randomUUID } from "crypto";
import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
import type { IClock, IIdGenerator } from "../../../core/interfaces";
import type { ProviderTrustLevel } from "../contracts/enums";
import { InMemoryAuditCredentialLogger } from "../auditing/audit-logger";
import {
  EventBusCredentialEventPublisher,
  NoopCredentialEventPublisher,
} from "../auditing/event-publisher";
import { ProviderAuthenticationEngine } from "../authentication/authentication-engine";
import { ProviderAuthorizationEngine } from "../authorization/authorization-engine";
import { InMemoryCredentialStore } from "../credentials/credential-store";
import { ProviderIdentityEngine } from "../engine/provider-identity-engine";
import type { IAuditCredentialLogger } from "../interfaces/audit-logger";
import type { ICredentialEventPublisher } from "../interfaces/event-publisher";
import type { ICredentialStore } from "../interfaces/credential-store";
import type { IProviderIdentityEngine } from "../interfaces/identity-engine";
import type { IRotationEngine } from "../interfaces/rotation-engine";
import type { ISecretProvider } from "../interfaces/secret-provider";
import { CredentialMasker } from "../masking/credential-masker";
import { RotationEngine } from "../rotation/rotation-engine";
import { InMemoryCredentialSessionManager } from "../sessions/session-manager";
import { ProviderTrustEngine } from "../trust/trust-engine";
import type { IProviderAttestationVerifier } from "../trust/trust-engine";
import { CredentialValidator } from "../validation/credential-validator";
import { InMemorySecretProvider } from "../vault/in-memory-secret-provider";

class InlineClock implements IClock {
  constructor(private readonly nowIsoFn: () => string) {}
  now(): Date {
    return new Date(this.nowIsoFn());
  }
  nowIso(): string {
    return this.nowIsoFn();
  }
}

class InlineIdGenerator implements IIdGenerator {
  constructor(private readonly createId: (prefix: string) => string) {}
  generate(prefix?: string): string {
    return this.createId(prefix ?? "id");
  }
}

export interface CreateIdentityPlatformOptions {
  readonly secretProvider?: ISecretProvider;
  readonly minTrustLevel?: ProviderTrustLevel;
  readonly sessionTtlMs?: number;
  readonly attestationVerifier?: IProviderAttestationVerifier;
  readonly clock?: IClock;
  readonly idGenerator?: IIdGenerator;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
  readonly eventBus?: IEventBus;
  readonly eventFactory?: EventFactory;
  readonly events?: ICredentialEventPublisher;
  readonly audit?: IAuditCredentialLogger;
}

export interface ProviderIdentityPlatform {
  readonly engine: IProviderIdentityEngine;
  readonly store: ICredentialStore;
  readonly rotation: IRotationEngine;
  readonly secretProvider: ISecretProvider;
  readonly audit: IAuditCredentialLogger;
}

export function createIdentityPlatform(
  options: CreateIdentityPlatformOptions = {}
): ProviderIdentityPlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const createId =
    options.createId ?? ((prefix: string) => `${prefix}_${randomUUID()}`);

  const clock = options.clock ?? new InlineClock(nowIso);
  const idGenerator = options.idGenerator ?? new InlineIdGenerator(createId);

  const secretProvider = options.secretProvider ?? new InMemorySecretProvider();
  const audit = options.audit ?? new InMemoryAuditCredentialLogger();
  const events: ICredentialEventPublisher =
    options.events ??
    (options.eventBus && options.eventFactory
      ? new EventBusCredentialEventPublisher(
          options.eventBus,
          options.eventFactory
        )
      : new NoopCredentialEventPublisher());

  const store = new InMemoryCredentialStore(
    secretProvider,
    idGenerator,
    clock
  );
  const rotation = new RotationEngine(store, clock, idGenerator);

  const engine = new ProviderIdentityEngine({
    store,
    secretProvider,
    authentication: new ProviderAuthenticationEngine(),
    authorization: new ProviderAuthorizationEngine(),
    trust: new ProviderTrustEngine(
      clock,
      options.minTrustLevel ?? "standard",
      options.attestationVerifier
    ),
    validator: new CredentialValidator(clock),
    sessions: new InMemoryCredentialSessionManager(
      idGenerator,
      clock,
      options.sessionTtlMs
    ),
    masker: new CredentialMasker(),
    audit,
    events,
    clock,
  });

  return { engine, store, rotation, secretProvider, audit };
}
