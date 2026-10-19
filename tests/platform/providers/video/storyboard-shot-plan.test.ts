import { PNG } from "pngjs";
import {
  detectPanels,
  parseScriptScenes,
} from "../../../../src/platform/providers/video/common/storyboard-shot-plan";
import { prepareStoryboardVideoSubmission } from "../../../../src/platform/providers/video/common/storyboard-video-submission";

const DURATION_SCRIPT = `# COSMO
**Duration:** 60 seconds

## SCENE 1: THE SIGNAL
**Duration:** 0:00 - 0:08 (8 seconds)

### VISUAL
Deep space. Cosmo floats.

### AUDIO
- Hum

---

## SCENE 2: AI PLANET
**Duration:** 0:08 - 0:18 (10 seconds)

### VISUAL
Cosmo zooms toward a glowing planet.

### ANIMATION NOTES
- Smooth

## SCENE 3: FINALE
**Duration:** 0:54 - 1:00 (6 seconds)

### VISUAL
Wide shot of the constellation.
`;

describe("parseScriptScenes", () => {
  it("reads timings from a Duration line under the heading (m:ss)", () => {
    const scenes = parseScriptScenes(DURATION_SCRIPT);
    expect(scenes.map((s) => [s.index, s.title, s.startSec, s.endSec])).toEqual([
      [1, "THE SIGNAL", 0, 8],
      [2, "AI PLANET", 8, 18],
      [3, "FINALE", 54, 60],
    ]);
    expect(scenes[0]!.visual).toBe("Deep space. Cosmo floats.");
    expect(scenes[1]!.visual).toBe("Cosmo zooms toward a glowing planet.");
  });

  it("still reads timings inside the heading", () => {
    const scenes = parseScriptScenes(
      "### SCENE 1: OPEN (0-3 seconds)\nVISUAL: a\n### SCENE 2: END (3-6 seconds)\nVISUAL: b",
    );
    expect(scenes.map((s) => [s.startSec, s.endSec])).toEqual([[0, 3], [3, 6]]);
  });
});

/** Dark sheet, 2×2 panels with thin light frame borders and dark interiors. */
function darkFramedSheet(): PNG {
  const W = 800;
  const H = 480;
  const png = new PNG({ width: W, height: H });
  const set = (x: number, y: number, rgb: [number, number, number]) => {
    const i = (y * W + x) * 4;
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [10, 20, 45]);
  const frames = [
    { x: 40, y: 40, w: 330, h: 170 },
    { x: 430, y: 40, w: 330, h: 170 },
    { x: 40, y: 270, w: 330, h: 170 },
    { x: 430, y: 270, w: 330, h: 170 },
  ];
  for (const f of frames) {
    // A bright blob inside each frame so rows read as content.
    for (let y = f.y + 40; y < f.y + 120; y++) for (let x = f.x + 60; x < f.x + 200; x++) set(x, y, [200, 210, 230]);
    for (let t = 0; t < 2; t++) {
      for (let x = f.x; x <= f.x + f.w; x++) {
        set(x, f.y + t, [120, 200, 240]);
        set(x, f.y + f.h - t, [120, 200, 240]);
      }
      for (let y = f.y; y <= f.y + f.h; y++) {
        set(f.x + t, y, [120, 200, 240]);
        set(f.x + f.w - t, y, [120, 200, 240]);
      }
    }
  }
  return png;
}

describe("detectPanels", () => {
  it("splits a dark sheet of framed panels into one box per frame, in reading order", () => {
    const boxes = detectPanels(darkFramedSheet());
    expect(boxes).toHaveLength(4);
    const centres = boxes.map((b) => [Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2)]);
    expect(centres[0]![0]).toBeLessThan(400);
    expect(centres[1]![0]).toBeGreaterThan(400);
    expect(centres[0]![1]).toBeLessThan(240);
    expect(centres[2]![1]).toBeGreaterThan(240);
    for (const b of boxes) {
      expect(b.w).toBeLessThan(340);
      expect(b.h).toBeLessThan(180);
    }
  });
});

describe("prepareStoryboardVideoSubmission", () => {
  it("never uses an unsplittable storyboard sheet as the opening frame", async () => {
    const sheet = {
      url: "data:image/png;base64,AAAA",
      relationshipLabel: "cdf_upstream_visual_artifact",
    };
    const reference = { url: "https://cdn.example.com/ref.png", role: "subject_reference" };
    const out = await prepareStoryboardVideoSubmission({
      prompt: "x",
      metadata: { canonicalModelRequest: { script: DURATION_SCRIPT } },
      assets: [sheet, reference],
      executionId: "exec_1",
      organizationId: "org_1",
    });
    expect(out?.assets).toEqual([reference]);
    expect(out?.payload.videoSegmentCount).toBe(3);
  });
});

describe("approved storyboard frames → shots", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { frameIndexForShot } = require("../../../../src/platform/providers/video/common/storyboard-video-submission");
  const scene = (index: number) => ({ index, title: "", startSec: 0, endSec: 5, visual: "" });
  const refs = [
    { artifactId: "cdfart_a", artifactVersion: 1, scene: 1 },
    { artifactId: "cdfart_b", artifactVersion: 1, scene: 2 },
    { artifactId: "cdfart_c", artifactVersion: 1, scene: 4 },
  ];

  it("opens each shot on the frame of its own scene", () => {
    expect(frameIndexForShot(scene(1), 0, 4, refs)).toBe(0);
    expect(frameIndexForShot(scene(2), 1, 4, refs)).toBe(1);
    expect(frameIndexForShot(scene(4), 3, 4, refs)).toBe(2);
  });

  it("leaves a scene without a frame on the previous shot's last frame", () => {
    expect(frameIndexForShot(scene(3), 2, 4, refs)).toBe(-1);
  });

  it("falls back to order when frames carry no scene numbers and counts match", () => {
    const plain = refs.map(({ artifactId, artifactVersion }) => ({ artifactId, artifactVersion }));
    expect(frameIndexForShot(scene(9), 2, 3, plain)).toBe(2);
  });
});

describe("shot prompts", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildShotPrompt } = require("../../../../src/platform/providers/video/common/storyboard-shot-plan");
  it("asks for one continuous take with characters identical to the opening frame", () => {
    const prompt = buildShotPrompt(
      { index: 2, title: "AI PLANET", startSec: 5, endSec: 10, visual: "Cosmo zooms toward a glowing planet." },
      "Cosmo: round white robot.",
      6,
    );
    expect(prompt).toContain("Shot 2 of 6 — AI PLANET.");
    expect(prompt).toContain("Action and camera: Cosmo zooms toward a glowing planet.");
    expect(prompt).toMatch(/one continuous take — no cuts/);
    expect(prompt).toMatch(/Characters stay identical to the opening frame/);
    expect(prompt).toContain("Style: Cosmo: round white robot.");
  });
});
