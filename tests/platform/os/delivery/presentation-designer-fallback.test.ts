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

describe("slide designer — parallel parts", () => {
  const saved = { ...process.env };
  const realFetch = global.fetch;
  const bigBrief: SlideDesignBrief = {
    ...brief,
    plan: {
      title: "Acme",
      slides: Array.from({ length: 7 }, (_, i) => ({
        title: `Topic ${i + 2}`,
        layout: "content_bullets",
        bullets: [`Point ${i + 2}`],
      })),
    } as SlideDesignBrief["plan"],
  };
  const userText = (init?: RequestInit) =>
    (JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] }).messages.find(
      (m) => m.role === "user",
    )!.content;
  const systemAnswer =
    "<<<FONTS>>>\nInter\n<<<THEME>>>\n.slide{background:#fff}\n<<<PLAN>>>\n1: cover\n2: split\n" +
    '<<<SLIDE 1>>>\n<section class="slide"><h1>S1</h1></section>\n<<<SLIDE 2>>>\n<section class="slide"><h1>S2</h1></section>';
  const batchAnswer = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => {
      const n = from + i;
      return `<<<SLIDE ${n}>>>\n<section class="slide s${n}"><style>.slide.s${n} h1{color:red}</style><h1>S${n}</h1></section>`;
    }).join("\n");

  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    process.env = { ...saved };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.PRESENTATION_DESIGN_PROVIDERS;
    delete process.env.PRESENTATION_DESIGN_BATCH_SIZE;
    process.env.OPENAI_API_KEY = "sk-test";
  });
  afterEach(() => {
    process.env = saved;
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it("sets the system once, then designs the rest in parallel batches, in order", async () => {
    const asked: string[] = [];
    global.fetch = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const user = userText(init);
      if (user.includes("set up the deck's visual system")) {
        asked.push("system");
        return openAiAnswer(systemAnswer);
      }
      const m = /Design only slides (\d+)–(\d+)/.exec(user)!;
      asked.push(`${m[1]}-${m[2]}`);
      expect(user).toContain("LAYOUT PLAN FOR THE WHOLE DECK");
      expect(user).toContain(".slide{background:#fff}");
      return openAiAnswer(batchAnswer(Number(m[1]), Number(m[2])));
    }) as typeof fetch;
    const deck = await designPresentationSlides(bigBrief, config);
    expect(asked[0]).toBe("system");
    expect(asked.slice(1).sort()).toEqual(["3-5", "6-8"]);
    expect(deck.slides.map((s) => /<h1>(S\d+)<\/h1>/.exec(s)![1])).toEqual(
      ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
    );
    // Batch slide CSS moves into the theme; the markup keeps no <style>.
    expect(deck.slides.some((s) => s.includes("<style"))).toBe(false);
    expect(deck.themeCss).toContain(".slide.s7 h1{color:red}");
    expect(deck.designedBy).toBe("openai");
  });

  it("falls back to one call for the whole deck when a batch cannot be designed", async () => {
    global.fetch = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const user = userText(init);
      if (user.includes("set up the deck's visual system")) return openAiAnswer(systemAnswer);
      if (user.includes("Design only slides")) return openAiAnswer("nothing usable");
      return openAiAnswer(deckText(8));
    }) as typeof fetch;
    const deck = await designPresentationSlides(bigBrief, config);
    expect(deck.slides).toHaveLength(8);
  });

  it("keeps one call when the split is turned off", async () => {
    process.env.PRESENTATION_DESIGN_BATCH_SIZE = "0";
    const fetchMock = jest.fn(async () => openAiAnswer(deckText(8)));
    global.fetch = fetchMock as unknown as typeof fetch;
    await designPresentationSlides(bigBrief, config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
