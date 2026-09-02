/** Shared browser runtime evaluator identity (Step 14B / Priority 4.1). */
export const BROWSER_RUNTIME_EVALUATOR_ID = "browser_runtime_evaluator" as const;
export const BROWSER_RUNTIME_EVALUATOR_VERSION = "p4.1.1" as const;

export const DESKTOP_VIEWPORT = Object.freeze({ name: "desktop" as const, width: 1280, height: 800 });
export const MOBILE_VIEWPORT = Object.freeze({ name: "mobile" as const, width: 390, height: 844 });
