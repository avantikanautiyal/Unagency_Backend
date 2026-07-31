/**
 * Production Validation & End-to-End Testing Platform (M9.1).
 *
 * Orchestrates validation, verification, reporting, and production readiness
 * certification by consuming existing Intelligence OS modules only.
 */

export * from "./contracts";
export * from "./interfaces/validation";
export * from "./assertions/assertion-framework";
export * from "./scenarios/end-to-end-scenarios";
export * from "./suites/validation-suites";
export * from "./orchestrator/scenario-runner";
export * from "./orchestrator/validation-orchestrator";
export * from "./failure/failure-simulator";
export * from "./load/load-testing-engine";
export * from "./recovery/recovery-testing-engine";
export * from "./security/security-validation";
export * from "./coverage/coverage-engine";
export * from "./certification/certification-engine";
export * from "./benchmarking/benchmark-collector";
export * from "./health/health-checks";
export * from "./diagnostics/diagnostics";
export * from "./reports/report-writer";
export * from "./reports/write-reports";
export * from "./factories/create-validation-platform";
export * from "./testing";
