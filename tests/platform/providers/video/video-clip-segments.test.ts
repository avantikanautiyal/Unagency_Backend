import {
  planVideoClipSegments,
  wireDurationForVideoSegment,
  DEFAULT_VIDEO_TARGET_DURATION_SEC,
} from "../../../../src/platform/providers/video/common/video-clip-segments";

describe("video-clip-segments", () => {
  it("plans two 10s clips for a 20s product target", () => {
    const plan = planVideoClipSegments({ targetDurationSec: 20 });
    expect(plan.segmentCount).toBe(2);
    expect(plan.segmentDurationSec).toBe(10);
    expect(plan.segments).toEqual([
      { index: 0, durationSec: 10 },
      { index: 1, durationSec: 10 },
    ]);
    expect(wireDurationForVideoSegment({ targetDurationSec: 20, segmentIndex: 0 })).toBe(
      10,
    );
    expect(wireDurationForVideoSegment({ targetDurationSec: 20, segmentIndex: 1 })).toBe(
      10,
    );
  });

  it("defaults product target to 20s", () => {
    expect(DEFAULT_VIDEO_TARGET_DURATION_SEC).toBe(20);
  });
});
