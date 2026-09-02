/**
 * Track A Phase A0 — holdout case + rollout snapshot tests.
 */

import {
  HOLDOUT_CASES_V0,
  getHoldoutCase,
  holdoutFixtureSlots,
} from "../../../../src/platform/os/creative/holdout-cases";
import {
  captureContinuityRolloutSnapshot,
  RECOMMENDED_DEV_SHADOW_ROLLOUT,
} from "../../../../src/platform/os/creative/continuity-rollout-status";
import {
  CREATIVE_TERRITORIES_V0,
  emptyJobObject,
  TERRITORY_LABELS,
} from "../../../../src/platform/os/creative/job-object";

describe("Holdout cases v0", () => {
  it("defines 10 cases aligned with BASELINE_THIN_v1", () => {
    expect(HOLDOUT_CASES_V0).toHaveLength(10);
    expect(HOLDOUT_CASES_V0.map((c) => c.id)).toEqual([
      "H01",
      "H02",
      "H03",
      "H04",
      "H05",
      "H06",
      "H07",
      "H08",
      "H09",
      "H10",
    ]);
  });

  it("H06 expects ASK when logo slot missing", () => {
    const h06 = getHoldoutCase("H06");
    expect(h06?.continuityExpect).toBe("ASK");
    expect(holdoutFixtureSlots("northstar_no_logo")).not.toContain("logo");
  });

  it("northstar_full fixture includes logo and productHero", () => {
    const slots = holdoutFixtureSlots("northstar_full");
    expect(slots).toContain("logo");
    expect(slots).toContain("productHero");
  });
});

describe("Continuity rollout snapshot", () => {
  it("defaults all layers off without env", () => {
    const snap = captureContinuityRolloutSnapshot({});
    for (const row of Object.values(snap.layers)) {
      expect(row.rollout).toBe("off");
      expect(row.affectsGeneration).toBe(false);
    }
  });

  it("reads shadow env for context bind", () => {
    const snap = captureContinuityRolloutSnapshot({
      CONTINUITY_CONTEXT_BIND: "shadow",
    });
    expect(snap.layers.ContextBinder?.rollout).toBe("shadow");
    expect(snap.layers.ContextBinder?.affectsGeneration).toBe(false);
  });

  it("exposes recommended dev shadow block", () => {
    expect(RECOMMENDED_DEV_SHADOW_ROLLOUT.CONTINUITY_APPROVE_PROMOTE).toBe(
      "shadow"
    );
    expect(RECOMMENDED_DEV_SHADOW_ROLLOUT.CONTINUITY_BRIEF_ASSIST).toBe("off");
  });
});

describe("B0 Job Object contracts", () => {
  it("emptyJobObject preserves user brief", () => {
    const job = emptyJobObject({ userBrief: "  launch post  " });
    expect(job.userBrief).toBe("launch post");
    expect(job.understoodBrief).toBe("launch post");
    expect(job.schemaVersion).toBe("v0");
  });

  it("defines iconic / distinctive / elevated territories", () => {
    expect(CREATIVE_TERRITORIES_V0).toHaveLength(3);
    expect(TERRITORY_LABELS.iconic).toMatch(/Iconic/i);
  });
});
