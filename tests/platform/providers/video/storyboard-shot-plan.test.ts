import { PNG } from "pngjs";
import {
  buildMusicPrompt,
  detectPanels,
  musicCueFromAudio,
  parseScriptScenes,
  voiceStyleFromAudio,
  voiceoverFromAudio,
} from "../../../../src/platform/providers/video/common/storyboard-shot-plan";
import { wrapOverlayText } from "../../../../src/platform/providers/video/common/video-soundtrack";
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

describe("storyboard frames drive the shot plan", () => {
  it("orders session storyboard frames by creation and keeps the latest version", () => {
    const { storyboardFramesFromSession } = jest.requireActual(
      "../../../../src/platform/providers/video/common/storyboard-video-submission",
    );
    const frames = storyboardFramesFromSession({
      generatedArtifacts: [
        { artifactId: "a", version: 1, phaseId: "storyboard", generationExecutionId: "exec_1_1792617169864" },
        { artifactId: "c", version: 1, phaseId: "storyboard", generationExecutionId: "exec_3_1792617185902" },
        { artifactId: "b", version: 1, phaseId: "storyboard", generationExecutionId: "exec_2_1792617185557" },
        { artifactId: "b", version: 2, phaseId: "storyboard", generationExecutionId: "exec_9_1792617999999" },
        { artifactId: "v", version: 1, phaseId: "style-preview", generationExecutionId: "exec_4_1792617999000" },
      ],
    });
    expect(frames).toEqual([
      { artifactId: "a", artifactVersion: 1 },
      { artifactId: "b", artifactVersion: 2 },
      { artifactId: "c", artifactVersion: 1 },
    ]);
  });

  it("puts the client change request in every shot and allows the end card on the last", () => {
    const { buildShotPrompt } = jest.requireActual(
      "../../../../src/platform/providers/video/common/storyboard-shot-plan",
    );
    const scene = { index: 3, title: "END", startSec: 8, endSec: 10, visual: "Logo settles." };
    const last = buildShotPrompt(scene, "x".repeat(2000), 3, { changeRequest: "must end with the logo", isLast: true });
    expect(last).toContain("Client change request (must follow): must end with the logo");
    expect(last).toContain("keep any logo or end-card text");
    expect(last).not.toContain("No added text");
    const mid = buildShotPrompt({ ...scene, index: 1 }, "", 3);
    expect(mid).toContain("No added text");
  });
});

describe("direct video shot planner", () => {
  const { parsePlannedShots } = jest.requireActual(
    "../../../../src/platform/providers/video/common/direct-video-shot-planner",
  );
  it("parses fenced JSON and caps to the requested count", () => {
    const raw = '```json\n{"shots":[{"title":"A","visual":"one"},{"title":"B","visual":"two"},{"title":"C","visual":"three"}]}\n```';
    expect(parsePlannedShots(raw, 2)).toEqual([
      { title: "A", visual: "one" },
      { title: "B", visual: "two" },
    ]);
  });
  it("rejects plans with fewer than two usable shots", () => {
    expect(parsePlannedShots('{"shots":[{"title":"A","visual":""},{"visual":"ok"}]}', 4)).toBeNull();
    expect(parsePlannedShots("not json", 4)).toBeNull();
  });
});

describe("script audio + on-screen text", () => {
  const script = `# Meet Cosmo
**Tone:** upbeat

## SCENE 1: MEET COSMO
**Duration:** 0:00 - 0:05
### VISUAL
Cosmo materializes.
### AUDIO
Upbeat electronic music intro. Voiceover (warm, clear, confident): "Meet Cosmo — your AI automation partner."
### ON-SCREEN TEXT
"Meet Your AI Automation Partner" ---

## SCENE 2: POWER
**Duration:** 0:05 - 0:10
### VISUAL
Robot gestures.
### AUDIO
Music: driving synth beat
VO: We automate your business strategy.
### ON-SCREEN TEXT
None
`;

  it("keeps each scene's audio and cleaned on-screen text", () => {
    const [one, two] = parseScriptScenes(script);
    expect(one!.visual).toBe("Cosmo materializes.");
    expect(one!.onScreenText).toBe("Meet Your AI Automation Partner");
    expect(two!.onScreenText).toBeUndefined();
    expect(two!.audio).toBe("Music: driving synth beat VO: We automate your business strategy.");
  });

  it("speaks only the voiceover words, never the music notes", () => {
    const [one, two] = parseScriptScenes(script);
    expect(voiceoverFromAudio(one!.audio)).toBe("Meet Cosmo — your AI automation partner.");
    expect(voiceoverFromAudio(two!.audio)).toBe("We automate your business strategy.");
    expect(voiceStyleFromAudio(one!.audio)).toBe("warm, clear, confident");
    expect(musicCueFromAudio(one!.audio)).toBe("Upbeat electronic music intro.");
    expect(musicCueFromAudio(two!.audio)).toBe("Music: driving synth beat");
    expect(voiceoverFromAudio("Ambient hum only.")).toBe("");
  });

  it("builds an instrumental music brief from the cues", () => {
    const prompt = buildMusicPrompt({ scenes: parseScriptScenes(script), tone: "upbeat", totalSec: 10 });
    expect(prompt).toContain("No vocals");
    expect(prompt).toContain("Upbeat electronic music intro. → Music: driving synth beat");
    expect(prompt).not.toContain("automate");
  });

  it("wraps overlay copy to at most three lines", () => {
    expect(wrapOverlayText("one two three four", 9)).toEqual(["one two", "three", "four"]);
    expect(wrapOverlayText("a b c d e f g h", 1)).toEqual(["a", "b", "c…"]);
  });
});
