/**
 * Provider Negotiation Platform factory.
 *
 * Purpose: Wire the negotiation engine with its negotiators via DI.
 * Responsibilities: Construct default negotiators from injected platform ports.
 * Usage: Primary entry point for constructing the negotiation engine.
 * Future Extension: Alternative negotiator strategies plug in here.
 */

import { randomUUID } from "crypto";
import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
import type { ICapabilityRegistry } from "../../../capability-registry/interfaces/capability-registry";
import type { IProviderCapabilityMatrix } from "../../capability-matrix/interfaces/provider-capability-matrix";
import type { IProviderHealthStore } from "../../health/provider-health";
import type { IProviderIdentityEngine } from "../../identity/interfaces/identity-engine";
import type { IProviderRegistry } from "../../registry/provider-registry";
import { BudgetNegotiator } from "../budgeting/budget-negotiator";
import { CapabilityNegotiator } from "../capability/capability-negotiator";
import { ConstraintNegotiator } from "../constraints/constraint-negotiator";
import type { NegotiationProfile } from "../contracts/negotiation-result";
import {
  EventBusNegotiationEventPublisher,
  NoopNegotiationEventPublisher,
} from "../engine/event-publisher";
import { IdentityNegotiator } from "../engine/identity-negotiator";
import { ProviderNegotiationEngine } from "../engine/negotiation-engine";
import { FeatureNegotiator } from "../features/feature-negotiator";
import type { INegotiationEventPublisher } from "../interfaces/negotiation-engine";
import type { IProviderNegotiationEngine } from "../interfaces/negotiation-engine";
import type { IPolicyProvider } from "../interfaces/policy-provider";
import { ModelNegotiator } from "../model/model-negotiator";
import { DefaultPolicyProvider } from "../policies/default-policy-provider";
import { PolicyNegotiator } from "../policies/policy-negotiator";
import { ProviderNegotiator } from "../provider/provider-negotiator";
import { QualityNegotiator } from "../quality/quality-negotiator";
import { RegionalNegotiator } from "../regional/regional-negotiator";

export const DEFAULT_NEGOTIATION_PROFILE: NegotiationProfile = {
  allowExperimentalCapabilities: false,
  allowDegradedProviders: true,
  requireHealthyProvider: false,
  requireIdentityValidation: false,
  minConfidence: 0,
};

export interface CreateNegotiationEngineOptions {
  readonly capabilityRegistry: ICapabilityRegistry;
  readonly providerRegistry: IProviderRegistry;
  readonly capabilityMatrix: IProviderCapabilityMatrix;
  readonly healthStore?: IProviderHealthStore;
  readonly identityEngine?: IProviderIdentityEngine;
  readonly policyProvider?: IPolicyProvider;
  readonly profile?: Partial<NegotiationProfile>;
  readonly eventBus?: IEventBus;
  readonly eventFactory?: EventFactory;
  readonly events?: INegotiationEventPublisher;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export function createNegotiationEngine(
  options: CreateNegotiationEngineOptions
): IProviderNegotiationEngine {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const createId =
    options.createId ?? ((prefix: string) => `${prefix}_${randomUUID()}`);

  const profile: NegotiationProfile = {
    ...DEFAULT_NEGOTIATION_PROFILE,
    ...options.profile,
  };

  const policyProvider = options.policyProvider ?? new DefaultPolicyProvider();

  const events: INegotiationEventPublisher =
    options.events ??
    (options.eventBus && options.eventFactory
      ? new EventBusNegotiationEventPublisher(
          options.eventBus,
          options.eventFactory
        )
      : new NoopNegotiationEventPublisher());

  return new ProviderNegotiationEngine({
    capability: new CapabilityNegotiator(options.capabilityRegistry, profile),
    provider: new ProviderNegotiator(
      options.providerRegistry,
      options.capabilityRegistry,
      profile,
      options.healthStore
    ),
    model: new ModelNegotiator(options.capabilityMatrix),
    feature: new FeatureNegotiator(),
    constraint: new ConstraintNegotiator(
      options.providerRegistry,
      options.capabilityRegistry
    ),
    policy: new PolicyNegotiator(policyProvider, options.capabilityRegistry),
    regional: new RegionalNegotiator(
      options.providerRegistry,
      options.capabilityRegistry,
      profile
    ),
    quality: new QualityNegotiator(options.capabilityRegistry),
    budget: new BudgetNegotiator(options.capabilityRegistry),
    identity: new IdentityNegotiator(options.identityEngine),
    profile,
    events,
    nowIso,
    createId,
  });
}
