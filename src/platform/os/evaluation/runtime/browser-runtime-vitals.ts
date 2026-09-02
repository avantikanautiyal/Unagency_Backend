/**
 * Priority 4.1 — Web Vitals collection via PerformanceObserver in isolated browser context.
 */

export type WebVitalsReading = {
  readonly lcpMs: number | null;
  readonly clsScore: number | null;
  readonly inpMs: number | null;
  readonly lcpMeasured: boolean;
  readonly clsMeasured: boolean;
  readonly inpMeasured: boolean;
  readonly evidence: readonly string[];
};

/** Installed via page.evaluateOnNewDocument before setContent. */
export const WEB_VITALS_OBSERVER_INIT_SCRIPT = `
(() => {
  const store = {
    lcpMs: null,
    clsScore: 0,
    inpMs: null,
    lcpSupported: false,
    clsSupported: false,
    inpSupported: false,
    inpEntries: 0,
  };
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last && typeof last.startTime === "number") {
        store.lcpMs = last.startTime;
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    store.lcpSupported = true;
  } catch (_) {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput && typeof entry.value === "number") {
          store.clsScore += entry.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
    store.clsSupported = true;
  } catch (_) {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (typeof entry.duration === "number" && entry.duration > 0) {
          store.inpMs = entry.duration;
          store.inpEntries += 1;
        }
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    store.inpSupported = true;
  } catch (_) {}
  window.__unagencyWebVitals = store;
})()
`;

export type WebVitalsStore = {
  readonly lcpMs: number | null;
  readonly clsScore: number;
  readonly inpMs: number | null;
  readonly lcpSupported: boolean;
  readonly clsSupported: boolean;
  readonly inpSupported: boolean;
  readonly inpEntries: number;
};

export function parseWebVitalsStore(raw: unknown): WebVitalsStore {
  const s = (raw ?? {}) as Partial<WebVitalsStore>;
  return Object.freeze({
    lcpMs: typeof s.lcpMs === "number" ? s.lcpMs : null,
    clsScore: typeof s.clsScore === "number" ? s.clsScore : 0,
    inpMs: typeof s.inpMs === "number" ? s.inpMs : null,
    lcpSupported: s.lcpSupported === true,
    clsSupported: s.clsSupported === true,
    inpSupported: s.inpSupported === true,
    inpEntries: typeof s.inpEntries === "number" ? s.inpEntries : 0,
  });
}

export function buildWebVitalsReadings(store: WebVitalsStore): WebVitalsReading {
  const evidence: string[] = [];
  let lcpMeasured = false;
  let clsMeasured = false;
  let inpMeasured = false;

  if (store.lcpSupported && store.lcpMs != null && store.lcpMs > 0) {
    lcpMeasured = true;
    evidence.push(`LCP measured via PerformanceObserver: ${Math.round(store.lcpMs)}ms`);
  } else if (store.lcpSupported) {
    evidence.push("LCP observer supported but no paint entry recorded — NOT_AUTOMATED");
  } else {
    evidence.push("LCP PerformanceObserver unavailable in this runtime — NOT_AUTOMATED");
  }

  if (store.clsSupported) {
    clsMeasured = true;
    evidence.push(`CLS measured via PerformanceObserver: ${store.clsScore.toFixed(4)}`);
  } else {
    evidence.push("CLS PerformanceObserver unavailable — NOT_AUTOMATED");
  }

  if (store.inpSupported && store.inpEntries > 0 && store.inpMs != null) {
    inpMeasured = true;
    evidence.push(`INP measured via PerformanceObserver: ${Math.round(store.inpMs)}ms`);
  } else if (store.inpSupported) {
    evidence.push("INP observer supported but no user interaction occurred — NOT_AUTOMATED");
  } else {
    evidence.push("INP PerformanceObserver unavailable — NOT_AUTOMATED");
  }

  return Object.freeze({
    lcpMs: lcpMeasured ? store.lcpMs : null,
    clsScore: clsMeasured ? store.clsScore : null,
    inpMs: inpMeasured ? store.inpMs : null,
    lcpMeasured,
    clsMeasured,
    inpMeasured,
    evidence: Object.freeze(evidence),
  });
}
