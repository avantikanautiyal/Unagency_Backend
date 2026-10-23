import {
  designPresentationSlides,
  designerProviders,
  slideDesignerAvailable,
  type SlideDesignBrief,
} from "../../../../src/platform/os/delivery/presentation-html/slide-designer";

const brief: SlideDesignBrief = {
  plan: {
    title: "Acme",
    slides: [{ title: "Where we are", layout: "content_bullets", bullets: ["62% of revenue from two partners"] }],
  } as SlideDesignBrief["plan"],
  hasLogo: false,
  imageSlots: [],
};

const deckText = (slides: number) =>
  `<<<FONTS>>>\nInter\n<<<THEME>>>\n.slide{background:#fff}\n` +
  Array.from({ length: slides }, (_, i) => `<<<SLIDE ${i + 1}>>>\n<section class="slide"><h1>S${i + 1}</h1></section>`).join("\n");

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", { status: 200 });
const openAiAnswer = (text: string) =>
  sse([{ choices: [{ delta: { content: text } }] }, { choices: [{ delta: {}, finish_reason: "stop" }] }]);
const geminiAnswer = (text: string) =>
  sse([{ candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text }] }, finishReason: "STOP" }] }]);

const config = { model: "claude-opus-5-5", effort: "high" as const, timeoutMs: 10_000 };

describe("slide designer provider fallback", () => {
  const saved = { ...process.env };
  const realFetch = global.fetch;
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env = { ...saved };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.PRESENTATION_DESIGN_PROVIDERS;
    delete process.env.PRESENTATION_RENDERER;
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GEMINI_API_KEY = "g-test";
    delete process.env.OPENAI_ENABLED;
    delete process.env.GEMINI_ENABLED;
  });
  afterEach(() => {
    process.env = saved;
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it("orders Claude → GPT → Gemini and drops providers without a key", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    expect(designerProviders()).toEqual(["anthropic", "openai", "gemini"]);
    delete process.env.OPENAI_API_KEY;
    expect(designerProviders()).toEqual(["anthropic", "gemini"]);
    process.env.PRESENTATION_DESIGN_PROVIDERS = "gemini,anthropic";
    expect(designerProviders()).toEqual(["gemini", "anthropic"]);
  });

  it("stays available when Claude is not configured but another provider is", () => {
    expect(slideDesignerAvailable()).toBe(true);
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    expect(slideDesignerAvailable()).toBe(false);
  });

  it("moves to Gemini when GPT fails, and skips Gemini's thinking text", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u.includes("openai") ? "openai" : "gemini");
      return u.includes("openai")
        ? new Response('{"error":{"message":"insufficient_quota"}}', { status: 429 })
        : geminiAnswer(deckText(2));
    }) as typeof fetch;
    const deck = await designPresentationSlides(brief, config);
    expect(calls).toEqual(["openai", "gemini"]);
    expect(deck.designedBy).toBe("gemini");
    expect(deck.slides).toHaveLength(2);
    expect(deck.themeCss).not.toContain("thinking");
  });

  it("treats an unusable answer (wrong slide count) as a failure and tries the next provider", async () => {
    global.fetch = jest.fn(async (url: string | URL | Request) =>
      String(url).includes("openai") ? openAiAnswer(deckText(1)) : geminiAnswer(deckText(2)),
    ) as typeof fetch;
    const deck = await designPresentationSlides(brief, config);
    expect(deck.designedBy).toBe("gemini");
  });

  it("uses GPT when it answers well", async () => {
    global.fetch = jest.fn(async () => openAiAnswer(deckText(2))) as typeof fetch;
    const deck = await designPresentationSlides(brief, config);
    expect(deck.designedBy).toBe("openai");
  });

  it("reports every provider's failure when all of them fail", async () => {
    global.fetch = jest.fn(async () => new Response("down", { status: 503 })) as typeof fetch;
    await expect(designPresentationSlides(brief, config)).rejects.toThrow(/openai: HTTP 503.*gemini: HTTP 503/);
  });
});
