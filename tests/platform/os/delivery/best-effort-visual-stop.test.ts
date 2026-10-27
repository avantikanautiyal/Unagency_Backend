import { generateBestEffortVisualImage } from "../../../../src/platform/os/delivery/best-effort-visual-image";

describe("slide photo stop signal", () => {
  it("starts no provider attempt once the deck has stopped waiting", async () => {
    const resolve = jest.fn();
    const resolveAvailable = jest.fn();
    const controller = new AbortController();
    controller.abort();
    const out = await generateBestEffortVisualImage({
      prompt: "team at work",
      signal: controller.signal,
      deps: { imageRouter: { resolve }, registry: { resolveAvailable } } as never,
    });
    expect(out).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
    expect(resolveAvailable).not.toHaveBeenCalled();
  });
});
