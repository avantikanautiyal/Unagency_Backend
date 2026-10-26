import {
  approvedDesignFidelityApplies,
  dispatchWithApprovedDesignFidelity,
  parseFidelityDifferences,
} from "../../../../src/platform/providers/image/common/approved-design-fidelity";
import { describeReferenceImages } from "../../../../src/platform/providers/image/common/vendor-image-protocol";

const flatMeta = { service: "packaging", cdfPhaseId: "complete-pack" };
const angleMeta = {
  service: "packaging",
  cdfPhaseId: "3d-direction",
  cdfPackAngle: "Back",
  cdfRefineSource: true,
};

const approved3d = {
  url: "data:image/png;base64,QVBQUk9WRUQ=",
  mimeType: "image/png",
  relationshipLabel: "user_selected_generation_reference",
};

function request(metadata: Record<string, unknown>, assets: unknown[] = [approved3d]) {
  return {
    requestId: "r1",
    capabilityId: "image.generate",
    providerId: "provider.google",
    payload: { prompt: "Make the flat pack", text: "Make the flat pack", input: "Make the flat pack", assets },
    metadata,
    context: { executionId: "exec_1" },
  } as never;
}

function rendered(tag: string) {
  return {
    ok: true as const,
    value: {
      output: { outputs: [{ type: "image", mimeType: "image/png", base64: Buffer.from(tag).toString("base64") }] },
    },
  } as never;
}

function visionReplies(...replies: string[]) {
  const queue = [...replies];
  return jest.fn(async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: queue.shift() ?? "{}" }] } }] }),
  }));
}

describe("approved-design fidelity scope", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("checks the packaging 2D pack and pack angles only", () => {
    expect(approvedDesignFidelityApplies(flatMeta)).toBe(true);
    expect(approvedDesignFidelityApplies(angleMeta)).toBe(true);
    expect(approvedDesignFidelityApplies({ service: "packaging", cdfPhaseId: "3d-direction" })).toBe(false);
    expect(approvedDesignFidelityApplies({ service: "social-media", cdfPhaseId: "complete-pack" })).toBe(false);
  });

  it("never checks a user refine of the 2D pack — the requested change must stand", () => {
    expect(approvedDesignFidelityApplies({ ...flatMeta, refinePrompt: "Move claims to the back" })).toBe(false);
    expect(approvedDesignFidelityApplies({ ...flatMeta, cdfRefineSource: true })).toBe(false);
  });

  it("skips the corrective redraw itself and honours the kill switch", () => {
    expect(approvedDesignFidelityApplies({ ...flatMeta, cdfFidelityCorrection: true })).toBe(false);
    process.env.CDF_FIDELITY_CHECK = "off";
    expect(approvedDesignFidelityApplies(flatMeta)).toBe(false);
  });

  it("parses differences JSON", () => {
    expect(parseFidelityDifferences('{"differences":[]}')).toEqual([]);
    expect(parseFidelityDifferences('```json\n{"differences":["Front: swap lines"]}\n```')).toEqual([
      "Front: swap lines",
    ]);
    expect(parseFidelityDifferences("nope")).toBeNull();
  });
});

describe("dispatchWithApprovedDesignFidelity", () => {
  const env = { ...process.env };
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test";
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(() => {
    process.env = { ...env };
    global.fetch = realFetch;
  });

  it("keeps a render that matches the approved design (one generation)", async () => {
    global.fetch = visionReplies('{"differences":[]}') as never;
    const dispatch = jest.fn(async () => rendered("first"));
    const result = await dispatchWithApprovedDesignFidelity(request(flatMeta), dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(rendered("first"));
  });

  it("redraws once with the exact differences when the render drifts", async () => {
    const diff = 'Front panel: put "DiVastra" above "Sarees & Ethnic Wear" at the bottom';
    global.fetch = visionReplies(JSON.stringify({ differences: [diff] }), '{"differences":[]}') as never;
    const dispatch = jest
      .fn()
      .mockResolvedValueOnce(rendered("first"))
      .mockResolvedValueOnce(rendered("second"));
    const result = await dispatchWithApprovedDesignFidelity(request(flatMeta), dispatch);
    expect(dispatch).toHaveBeenCalledTimes(2);
    const corrected = dispatch.mock.calls[1][0] as { payload: { prompt: string }; metadata: Record<string, unknown> };
    expect(corrected.payload.prompt).toContain("FIDELITY CORRECTION");
    expect(corrected.payload.prompt).toContain(diff);
    expect(corrected.metadata.cdfFidelityCorrection).toBe(true);
    expect(result).toEqual(rendered("second"));
  });

  it("keeps the first render when the redraw is judged further off", async () => {
    global.fetch = visionReplies('{"differences":["a"]}', '{"differences":["a","b"]}') as never;
    const dispatch = jest
      .fn()
      .mockResolvedValueOnce(rendered("first"))
      .mockResolvedValueOnce(rendered("second"));
    const result = await dispatchWithApprovedDesignFidelity(request(angleMeta), dispatch);
    expect(result).toEqual(rendered("first"));
  });

  it("fails open: no approved reference or an unusable check keeps the first render", async () => {
    global.fetch = visionReplies("not json") as never;
    const dispatch = jest.fn(async () => rendered("first"));
    await dispatchWithApprovedDesignFidelity(request(flatMeta), dispatch);
    await dispatchWithApprovedDesignFidelity(request(flatMeta, []), dispatch);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});

describe("pack angles take panel artwork from the approved flat sheet", () => {
  it("new-viewpoint guidance names the 3D for shape and the 2D sheet for every panel", () => {
    const text = describeReferenceImages([approved3d as never], { refinement: true, newViewpoint: true });
    expect(text).toContain("NEW VIEWPOINT");
    expect(text).toContain("approved flat 2D pack sheet, panel by panel");
    expect(text).not.toContain("REFINEMENT:");
  });
});
