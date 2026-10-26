/**
 * Presentation's Final step was removed (Oct 2026): a session saved on it
 * resumes completed on Full Deck, whose preview downloads the designed deck.
 */

import { normalizeCdfSession } from "../../../src/platform/cdf/state-machine/normalize";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

function session(overrides: Partial<CdfSessionState>): CdfSessionState {
  return {
    sessionId: "cdf_deck",
    serviceId: "presentation",
    status: "active",
    // Runtime indexes (contract-only `select` excluded): Final was 5.
    phaseIndex: 5,
    phaseId: "final",
    approved: [],
    selected: [],
    masters: {},
    ...overrides,
  } as CdfSessionState;
}

describe("presentation sessions saved on the removed Final step", () => {
  it("resume completed on Full Deck", () => {
    const next = normalizeCdfSession(session({}));
    expect(next.phaseId).toBe("full-deck");
    expect(next.phaseIndex).toBe(4);
    expect(next.status).toBe("completed");
  });

  it("leave sessions on existing steps untouched", () => {
    const next = normalizeCdfSession(session({ phaseIndex: 4, phaseId: "full-deck" }));
    expect(next.phaseId).toBe("full-deck");
    expect(next.status).toBe("active");
  });

  it("leave other services' Final step untouched", () => {
    const next = normalizeCdfSession(
      session({ serviceId: "print-ooh", phaseIndex: 3, phaseId: "final" }),
    );
    expect(next.phaseId).toBe("final");
    expect(next.phaseIndex).toBe(3);
    expect(next.status).toBe("active");
  });
});
