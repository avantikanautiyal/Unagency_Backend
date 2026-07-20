/**
 * Billing, credits, marketplace, analytics, audit, settings.
 */

import type {
  MarketplaceAssetKind,
  PlanTier,
  SubscriptionStatus,
} from "./enums";

export interface Plan {
  readonly planId: string;
  readonly tier: PlanTier;
  readonly name: string;
  readonly monthlyCredits: number;
  readonly priceUsd: number;
}

export interface Subscription {
  readonly subscriptionId: string;
  readonly organizationId: string;
  readonly planId: string;
  readonly status: SubscriptionStatus;
  readonly startedAt: string;
  readonly renewsAt?: string;
  readonly cancelledAt?: string;
}

export interface CreditLedgerEntry {
  readonly entryId: string;
  readonly organizationId: string;
  readonly delta: number;
  readonly balanceAfter: number;
  readonly reason: string;
  readonly referenceId?: string;
  readonly createdAt: string;
}

export interface Invoice {
  readonly invoiceId: string;
  readonly organizationId: string;
  readonly amountUsd: number;
  readonly currency: "USD";
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: "draft" | "open" | "paid" | "void";
  readonly createdAt: string;
}

export interface Transaction {
  readonly transactionId: string;
  readonly organizationId: string;
  readonly invoiceId?: string;
  readonly amountUsd: number;
  readonly kind: "charge" | "credit" | "refund" | "adjustment";
  readonly createdAt: string;
  /** No payment gateway — metadata only. */
  readonly gateway: "none";
}

export interface MarketplaceListing {
  readonly listingId: string;
  readonly kind: MarketplaceAssetKind;
  readonly name: string;
  readonly description: string;
  readonly organizationId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly published: boolean;
  readonly createdAt: string;
}

export interface Automation {
  readonly automationId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly trigger: string;
  readonly workflowId?: string;
  readonly enabled: boolean;
  readonly createdAt: string;
}

export interface IntegrationConnection {
  readonly integrationId: string;
  readonly organizationId: string;
  readonly provider: string;
  readonly status: "connected" | "disconnected";
  readonly createdAt: string;
}

export interface BusinessAnalyticsSnapshot {
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly campaignsActive: number;
  readonly executionsTotal: number;
  readonly executionsSucceeded: number;
  readonly creditsUsed: number;
  readonly spendUsd: number;
  readonly capturedAt: string;
}

export interface AuditLogEntry {
  readonly auditId: string;
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly at: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface OrganizationSettings {
  readonly organizationId: string;
  readonly timezone: string;
  readonly locale: string;
  readonly features: Readonly<Record<string, boolean>>;
  readonly updatedAt: string;
}

export interface SearchHit {
  readonly entityType: string;
  readonly entityId: string;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
}
