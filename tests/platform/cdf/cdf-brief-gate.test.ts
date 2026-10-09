import {
  classifyCdfBriefTurnLocal,
  decideCdfBriefGate,
  isCdfBriefGateOverride,
  resolveCdfBriefGate,
  type CdfBriefGateResponse,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf-brief-gate";
import {
  evaluateCdfBriefGate,
  resolveCdfBriefGateMode,
} from "../../../src/platform/cdf/brief-gate";

const hold = (turnType: CdfBriefGateResponse["turnType"]): CdfBriefGateResponse => ({
  mode: "enforce",
  decision: "hold",
  turnType,
  confidence: 0.9,
  wouldHold: true,
  source: "llm",
});

describe("CDF brief gate — local classifier", () => {
  it.each([
    "you", "hi", "hiii", "ok", "Thanks!", "hello there", "how are you", "test", "lol",
    "what's up?", "whats up", "how's it going", "what's new", "I'm good", "nothing much",
  ])(
    "treats %p as conversation",
    (text) => {
      expect(classifyCdfBriefTurnLocal(text).kind).toBe("conversation");
    },
  );

  it.each(["???", "...", "👍"])("treats symbol-only %p as conversation", (text) => {
    expect(classifyCdfBriefTurnLocal(text)).toEqual({ kind: "conversation", reason: "no_words" });
  });

  it.each(["Diwali", "logo", "summer sale", "दिवाली ऑफर", "make one"])(
    "sends short non-filler %p to the model check",
    (text) => {
      expect(classifyCdfBriefTurnLocal(text).kind).toBe("check");
    },
  );

  it("passes long messages and attachments straight through as brief", () => {
    expect(classifyCdfBriefTurnLocal("an instagram post for our diwali sale").kind).toBe("brief");
    expect(classifyCdfBriefTurnLocal("hi", { hasAttachment: true }).kind).toBe("brief");
  });

  it("recognises override phrases only as whole messages", () => {
    expect(isCdfBriefGateOverride("Go ahead!")).toBe(true);
    expect(isCdfBriefGateOverride("just do it")).toBe(true);
    expect(isCdfBriefGateOverride("go ahead with a diwali post")).toBe(false);
  });
});

describe("CDF brief gate — decision", () => {
  it("holds only in enforce mode for confident conversational turns", () => {
    expect(decideCdfBriefGate({ mode: "enforce", turnType: "small_talk", confidence: 0.9 })).toEqual({
      decision: "hold",
      wouldHold: true,
    });
    expect(decideCdfBriefGate({ mode: "shadow", turnType: "small_talk", confidence: 0.9 })).toEqual({
      decision: "brief",
      wouldHold: true,
    });
    expect(decideCdfBriefGate({ mode: "enforce", turnType: "small_talk", confidence: 0.4 }).decision).toBe("brief");
    expect(decideCdfBriefGate({ mode: "enforce", turnType: "partial_brief", confidence: 0.99 }).decision).toBe("brief");
    expect(decideCdfBriefGate({ mode: "off", turnType: "unclear", confidence: 1 }).wouldHold).toBe(false);
  });

  it("defaults the server mode to shadow", () => {
    expect(resolveCdfBriefGateMode({})).toBe("shadow");
    expect(resolveCdfBriefGateMode({ CDF_BRIEF_GATE_MODE: "ENFORCE" })).toBe("enforce");
    expect(resolveCdfBriefGateMode({ CDF_BRIEF_GATE_MODE: "off" })).toBe("off");
    expect(resolveCdfBriefGateMode({ CDF_BRIEF_GATE_MODE: "bogus" })).toBe("shadow");
  });
});

describe("CDF brief gate — server evaluation", () => {
  const silence = jest.spyOn(console, "info").mockImplementation(() => undefined);
  afterAll(() => silence.mockRestore());

  it("holds filler locally in enforce mode without calling a model", async () => {
    const run = jest.fn();
    const res = await evaluateCdfBriefGate({
      request: { text: "you" },
      organizationId: "org_1",
      integration: { run } as never,
      mode: "enforce",
    });
    expect(res).toMatchObject({ decision: "hold", turnType: "small_talk", source: "local" });
    expect(run).not.toHaveBeenCalled();
  });

  it("never holds in shadow mode", async () => {
    const res = await evaluateCdfBriefGate({
      request: { text: "you" },
      organizationId: "org_1",
      mode: "shadow",
    });
    expect(res).toMatchObject({ decision: "brief", wouldHold: true });
  });

  it("falls back to brief when the model is unavailable", async () => {
    const res = await evaluateCdfBriefGate({
      request: { text: "Diwali" },
      organizationId: "org_1",
      integration: { run: jest.fn().mockRejectedValue(new Error("down")) } as never,
      mode: "enforce",
    });
    expect(res).toMatchObject({ decision: "brief", source: "llm_unavailable" });
  });

  it("uses the model verdict for short ambiguous text", async () => {
    const run = jest.fn().mockResolvedValue({
      ok: true,
      value: {
        success: true,
        artifacts: {
          runtime: { response: { output: { structured: { turnType: "brief", confidence: 0.95 } } } },
        },
      },
    });
    const res = await evaluateCdfBriefGate({
      request: { text: "Diwali" },
      organizationId: "org_1",
      integration: { run } as never,
      mode: "enforce",
    });
    expect(res).toMatchObject({ decision: "brief", turnType: "brief", source: "llm" });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("CDF brief gate — client resolve", () => {
  it("submits long briefs without a network call", async () => {
    const briefGate = jest.fn();
    const out = await resolveCdfBriefGate({
      briefGate,
      text: "an instagram post for our diwali sale",
    });
    expect(out).toMatchObject({ decision: "brief" });
    expect(briefGate).not.toHaveBeenCalled();
  });

  it("holds with a friendly reply when the server says hold", async () => {
    const out = await resolveCdfBriefGate({
      briefGate: async () => hold("small_talk"),
      text: "you",
      serviceLabel: "Ad Campaign",
    });
    expect(out.decision).toBe("hold");
    if (out.decision === "hold") {
      expect(out.reply).toContain("Ad Campaign");
      expect(out.reply).toContain("go ahead");
    }
  });

  it("fails open on errors, timeouts and a missing endpoint", async () => {
    await expect(
      resolveCdfBriefGate({ briefGate: async () => Promise.reject(new Error("500")), text: "you" }),
    ).resolves.toMatchObject({ decision: "brief", reason: "gate_unavailable" });
    await expect(
      resolveCdfBriefGate({ briefGate: () => new Promise(() => undefined), text: "you", timeoutMs: 20 }),
    ).resolves.toMatchObject({ decision: "brief", reason: "gate_unavailable" });
    await expect(resolveCdfBriefGate({ text: "you" })).resolves.toMatchObject({ decision: "brief" });
  });

  it("submits the held message on override and a repeated message as-is", async () => {
    const briefGate = jest.fn(async () => hold("small_talk"));
    await expect(
      resolveCdfBriefGate({ briefGate, text: "go ahead", heldText: "you" }),
    ).resolves.toEqual({ decision: "brief", briefText: "you", reason: "user_override" });
    await expect(
      resolveCdfBriefGate({ briefGate, text: "You", heldText: "you" }),
    ).resolves.toMatchObject({ decision: "brief", briefText: "You", reason: "user_repeat" });
    expect(briefGate).not.toHaveBeenCalled();
  });
});
