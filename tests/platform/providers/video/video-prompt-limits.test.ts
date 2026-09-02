import {
  isProviderFetchableImageUrl,
  truncateVideoPrompt,
} from "../../../../src/platform/providers/video/common/video-prompt-limits";

describe("video-prompt-limits", () => {
  it("truncates Kling prompts to 2500 characters", () => {
    const long = "A".repeat(3000);
    const out = truncateVideoPrompt(long, "kling");
    expect(out.length).toBeLessThanOrEqual(2500);
    expect(out.endsWith("…")).toBe(true);
  });

  it("leaves short prompts unchanged", () => {
    const prompt = "Short ad video prompt.";
    expect(truncateVideoPrompt(prompt, "kling")).toBe(prompt);
  });

  it("detects provider-fetchable image URLs", () => {
    expect(isProviderFetchableImageUrl("https://cdn.example/logo.png")).toBe(true);
    expect(isProviderFetchableImageUrl("data:image/png;base64,abc")).toBe(false);
  });
});
