/**
 * Canonical Unagency subscription plan definitions.
 * Absolute source of truth for pricing and entitlements.
 * Razorpay Plan IDs come only from environment mapping — never hard-coded here.
 */

import type { BillingPeriod, PlanCode, PlanMode } from "./plan-codes";
import { PLAN_CODES } from "./plan-codes";

/** null = Not Applicable / Not Included where product uses N/A */
export type CreditEntitlement = number | null;

export type BrandLimit = number | "unlimited";

export type SsoEntitlement = "yes" | "no" | "add_on";

export interface PlanEntitlements {
  credits: CreditEntitlement;
  generationTypes: string;
  brands: BrandLimit;
  users: string;
  projects: "unlimited";
  aiMemory: string;
  humanSupport: boolean;
  qualityControl: string;
  turnaroundTime: string;
  accountManager: boolean;
  creativeTeamSupport: boolean;
  unlimitedRevisions: boolean;
  assetLibrary: string;
  /** Storage limit in GB */
  projectStorageGb: number;
  versionHistory: string;
  sourceFiles: string;
  exportFormats: string;
  commercialUsageRights: boolean;
  usageAnalytics: string;
  monthlyReports: string;
  quarterlyBusinessReview: boolean | string;
  support: string;
  securityPermissions: string;
  ssoEnterpriseSecurity: SsoEntitlement;
}

export interface CanonicalPlanDefinition {
  planCode: PlanCode;
  name: string;
  mode: PlanMode;
  billingPeriod: BillingPeriod;
  /** Amount in INR rupees (not paise) for product display */
  amountInr: number;
  currency: "INR";
  /** Amount in paise for Razorpay alignment checks */
  amountPaise: number;
  active: boolean;
  entitlements: PlanEntitlements;
}

const GB = (n: number) => n;

export const PLAN_CATALOG: Record<PlanCode, CanonicalPlanDefinition> = {
  UNAGENCY_AI_MONTHLY: {
    planCode: "UNAGENCY_AI_MONTHLY",
    name: "Unagency AI Monthly",
    mode: "AI",
    billingPeriod: "monthly",
    amountInr: 5_000,
    currency: "INR",
    amountPaise: 5_000_00,
    active: true,
    entitlements: {
      credits: 3_000,
      generationTypes: "All Types",
      brands: 10,
      users: "Team",
      projects: "unlimited",
      aiMemory: "Basic Memory",
      humanSupport: false,
      qualityControl: "AI Powered",
      turnaroundTime: "Not Included",
      accountManager: false,
      creativeTeamSupport: false,
      unlimitedRevisions: false,
      assetLibrary: "Basic",
      projectStorageGb: GB(25),
      versionHistory: "Basic",
      sourceFiles: "Not Included",
      exportFormats: "Standard Formats",
      commercialUsageRights: true,
      usageAnalytics: "Basic Analytics",
      monthlyReports: "Not Included",
      quarterlyBusinessReview: false,
      support: "Standard Support",
      securityPermissions: "Basic",
      ssoEnterpriseSecurity: "yes",
    },
  },
  UNAGENCY_HYBRID_MONTHLY: {
    planCode: "UNAGENCY_HYBRID_MONTHLY",
    name: "Unagency Hybrid Monthly",
    mode: "HYBRID",
    billingPeriod: "monthly",
    amountInr: 20_000,
    currency: "INR",
    amountPaise: 20_000_00,
    active: true,
    entitlements: {
      credits: 7_000,
      generationTypes: "All Types",
      brands: 10,
      users: "Team",
      projects: "unlimited",
      aiMemory: "Brand Memory",
      humanSupport: true,
      qualityControl: "AI + Human QC",
      turnaroundTime: "Standard SLA",
      accountManager: true,
      creativeTeamSupport: true,
      unlimitedRevisions: false,
      assetLibrary: "Basic",
      projectStorageGb: GB(25),
      versionHistory: "Basic",
      sourceFiles: "Selected Files",
      exportFormats: "Standard Formats",
      commercialUsageRights: true,
      usageAnalytics: "Basic",
      monthlyReports: "Automated Reports",
      quarterlyBusinessReview: false,
      support: "Standard Support",
      securityPermissions: "Basic",
      ssoEnterpriseSecurity: "yes",
    },
  },
  UNAGENCY_HUMAN_MONTHLY: {
    planCode: "UNAGENCY_HUMAN_MONTHLY",
    name: "Unagency Human Monthly",
    mode: "HUMAN",
    billingPeriod: "monthly",
    amountInr: 50_000,
    currency: "INR",
    amountPaise: 50_000_00,
    active: true,
    entitlements: {
      credits: null,
      generationTypes: "Not Applicable",
      brands: 10,
      users: "Team",
      projects: "unlimited",
      aiMemory: "Not Included",
      humanSupport: true,
      qualityControl: "Human QC",
      turnaroundTime: "Standard SLA",
      accountManager: true,
      creativeTeamSupport: true,
      unlimitedRevisions: true,
      assetLibrary: "Basic",
      projectStorageGb: GB(25),
      versionHistory: "Basic",
      sourceFiles: "Selected Files",
      exportFormats: "Standard Formats",
      commercialUsageRights: true,
      usageAnalytics: "Not Included",
      monthlyReports: "Not Included",
      quarterlyBusinessReview: true,
      support: "Standard Support",
      securityPermissions: "Basic",
      ssoEnterpriseSecurity: "yes",
    },
  },
  UNAGENCY_AI_ANNUAL: {
    planCode: "UNAGENCY_AI_ANNUAL",
    name: "Unagency AI Annual",
    mode: "AI",
    billingPeriod: "annual",
    amountInr: 50_000,
    currency: "INR",
    amountPaise: 50_000_00,
    active: true,
    entitlements: {
      credits: 50_000,
      generationTypes: "All Types",
      brands: 10,
      users: "Team Access",
      projects: "unlimited",
      aiMemory: "Advanced Brand Memory",
      humanSupport: false,
      qualityControl: "AI Powered",
      turnaroundTime: "Not Included",
      accountManager: false,
      creativeTeamSupport: false,
      unlimitedRevisions: true,
      assetLibrary: "Advanced",
      projectStorageGb: GB(100),
      versionHistory: "Extended",
      sourceFiles: "Not Included",
      exportFormats: "All Formats",
      commercialUsageRights: true,
      usageAnalytics: "Advanced Analytics",
      monthlyReports: "Not Included",
      quarterlyBusinessReview: false,
      support: "Priority Support",
      securityPermissions: "Advanced",
      ssoEnterpriseSecurity: "add_on",
    },
  },
  UNAGENCY_HYBRID_ANNUAL: {
    planCode: "UNAGENCY_HYBRID_ANNUAL",
    name: "Unagency Hybrid Annual",
    mode: "HYBRID",
    billingPeriod: "annual",
    amountInr: 2_00_000,
    currency: "INR",
    amountPaise: 2_00_000_00,
    active: true,
    entitlements: {
      credits: 100_000,
      generationTypes: "All Types",
      brands: 10,
      users: "Team Access",
      projects: "unlimited",
      aiMemory: "Advanced Brand Memory",
      humanSupport: true,
      qualityControl: "AI + Senior Human QC",
      turnaroundTime: "Priority SLA",
      accountManager: true,
      creativeTeamSupport: true,
      unlimitedRevisions: true,
      assetLibrary: "Advanced",
      projectStorageGb: GB(100),
      versionHistory: "Extended",
      sourceFiles: "Complete Source Files",
      exportFormats: "All Formats",
      commercialUsageRights: true,
      usageAnalytics: "Advanced",
      monthlyReports: "Human Reviewed Reports",
      quarterlyBusinessReview: true,
      support: "Priority Support",
      securityPermissions: "Advanced",
      ssoEnterpriseSecurity: "add_on",
    },
  },
  UNAGENCY_HUMAN_ANNUAL: {
    planCode: "UNAGENCY_HUMAN_ANNUAL",
    name: "Unagency Human Annual",
    mode: "HUMAN",
    billingPeriod: "annual",
    amountInr: 5_00_000,
    currency: "INR",
    amountPaise: 5_00_000_00,
    active: true,
    entitlements: {
      credits: null,
      generationTypes: "Not Applicable",
      brands: 10,
      users: "Team Access",
      projects: "unlimited",
      aiMemory: "Not Included",
      humanSupport: true,
      qualityControl: "Senior Human QC",
      turnaroundTime: "Priority SLA",
      accountManager: true,
      creativeTeamSupport: false,
      unlimitedRevisions: true,
      assetLibrary: "Advanced",
      projectStorageGb: GB(100),
      versionHistory: "Extended",
      sourceFiles: "Complete Source Files",
      exportFormats: "All Formats",
      commercialUsageRights: true,
      usageAnalytics: "Not Included",
      monthlyReports: "Not Included",
      quarterlyBusinessReview: false,
      support: "Priority Support",
      securityPermissions: "Advanced",
      ssoEnterpriseSecurity: "add_on",
    },
  },
};

export function getCanonicalPlan(planCode: PlanCode): CanonicalPlanDefinition {
  return PLAN_CATALOG[planCode];
}

export function listCanonicalPlans(
  billingPeriod?: BillingPeriod
): CanonicalPlanDefinition[] {
  return PLAN_CODES.map((code) => PLAN_CATALOG[code]).filter(
    (p) => p.active && (!billingPeriod || p.billingPeriod === billingPeriod)
  );
}

/** Comparison-table rows for pricing UI — values come only from catalog. */
export const FEATURE_MATRIX_ROWS: {
  key: keyof PlanEntitlements;
  label: string;
  format: (value: PlanEntitlements[keyof PlanEntitlements]) => string;
}[] = [
  {
    key: "credits",
    label: "Credits",
    format: (v) => (v == null ? "Not Applicable" : `${v} Credits`),
  },
  {
    key: "generationTypes",
    label: "Type of Generations",
    format: (v) => String(v),
  },
  {
    key: "brands",
    label: "Brands",
    format: (v) => (v === "unlimited" ? "Unlimited Brands" : String(v)),
  },
  { key: "users", label: "Users", format: (v) => String(v) },
  {
    key: "projects",
    label: "Projects",
    format: () => "Unlimited",
  },
  { key: "aiMemory", label: "AI Memory", format: (v) => String(v) },
  {
    key: "humanSupport",
    label: "Human Support",
    format: (v) => (v ? "Yes" : "No"),
  },
  {
    key: "qualityControl",
    label: "Quality Control",
    format: (v) => String(v),
  },
  {
    key: "turnaroundTime",
    label: "Turnaround Time",
    format: (v) => String(v),
  },
  {
    key: "accountManager",
    label: "Account Manager",
    format: (v) => (v ? "Yes" : "No"),
  },
  {
    key: "creativeTeamSupport",
    label: "Creative Team Support",
    format: (v) => (v ? "Yes" : "No"),
  },
  {
    key: "unlimitedRevisions",
    label: "Unlimited Revisions",
    format: (v) => (v ? "Yes" : "No"),
  },
  { key: "assetLibrary", label: "Asset Library", format: (v) => String(v) },
  {
    key: "projectStorageGb",
    label: "Project Storage",
    format: (v) => `${v} GB`,
  },
  {
    key: "versionHistory",
    label: "Version History",
    format: (v) => String(v),
  },
  { key: "sourceFiles", label: "Source Files", format: (v) => String(v) },
  {
    key: "exportFormats",
    label: "Export Formats",
    format: (v) => String(v),
  },
  {
    key: "commercialUsageRights",
    label: "Commercial Usage Rights",
    format: (v) => (v ? "Yes" : "No"),
  },
  {
    key: "usageAnalytics",
    label: "Usage Analytics",
    format: (v) => String(v),
  },
  {
    key: "monthlyReports",
    label: "Monthly Reports",
    format: (v) => String(v),
  },
  {
    key: "quarterlyBusinessReview",
    label: "Quarterly Business Review",
    format: (v) => (v === true ? "Yes" : v === false ? "No" : String(v)),
  },
  { key: "support", label: "Support", format: (v) => String(v) },
  {
    key: "securityPermissions",
    label: "Security & Permissions",
    format: (v) => String(v),
  },
  {
    key: "ssoEnterpriseSecurity",
    label: "SSO / Enterprise Security",
    format: (v) =>
      v === "yes" ? "Yes" : v === "no" ? "No" : v === "add_on" ? "Add-on" : String(v),
  },
];
