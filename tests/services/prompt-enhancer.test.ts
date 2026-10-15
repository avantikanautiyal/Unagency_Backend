import { cleanEnhancedText, enhancePrompt } from "../../src/services/prompt-enhancer";

const openAiReply = (text: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
const geminiReply = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  });

function delayed<T>(ms: number, value: () => T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(value()), ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });
}

describe("enhancePrompt", () => {
  const env = { ...process.env };
  let seq = 0;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GEMINI_API_KEY = "g-test";
    delete process.env.OPENAI_ENABLED;
    delete process.env.GEMINI_ENABLED;
  });
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });
  const uniquePrompt = () => `Pitch deck for Vastra silk suits #${(seq += 1)}`;

  it("returns the fast provider's answer", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async () => openAiReply("A polished pitch deck for Vastra."));
    const out = await enhancePrompt({ prompt: uniquePrompt(), brandName: "Vastra" });
    expect(out).toMatchObject({ text: "A polished pitch deck for Vastra.", provider: "openai" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.messages[1].content).toContain("Brand: Vastra");
  });

  it("falls back to Gemini immediately when OpenAI errors", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (url) =>
      String(url).includes("openai")
        ? new Response("{}", { status: 500 })
        : geminiReply("Gemini version."),
    );
    const out = await enhancePrompt({ prompt: uniquePrompt() });
    expect(out).toMatchObject({ text: "Gemini version.", provider: "gemini" });
  });

  it("hedges with Gemini when OpenAI is slow, and the first answer wins", async () => {
    jest.spyOn(global, "fetch").mockImplementation((url, init) =>
      String(url).includes("openai")
        ? delayed(8_000, () => openAiReply("slow"), init?.signal ?? undefined)
        : Promise.resolve(geminiReply("Hedged answer.")),
    );
    const started = Date.now();
    const out = await enhancePrompt({ prompt: uniquePrompt() });
    expect(out.provider).toBe("gemini");
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  it("serves a repeat request from cache", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async () => openAiReply("Cached text."));
    const prompt = uniquePrompt();
    await enhancePrompt({ prompt });
    const again = await enhancePrompt({ prompt });
    expect(again.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("strips labels and quotes models add", () => {
    expect(cleanEnhancedText('Enhanced prompt: "Make it bold."')).toBe("Make it bold.");
    expect(cleanEnhancedText("```\nPlain text\n```")).toBe("Plain text");
  });
});
