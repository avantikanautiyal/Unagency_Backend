import { CancellationEngine } from "../../../../../src/platform/intelligence/providers/runtime/cancellation/cancellation-engine";

describe("CancellationEngine", () => {
  const engine = new CancellationEngine();

  it("creates uncancelled sources", () => {
    const source = engine.createSource();
    expect(source.token.cancelled).toBe(false);
  });

  it("cancels with a reason and notifies listeners", () => {
    const source = engine.createSource();
    let notified: string | undefined = "none";
    source.onCancel((reason) => {
      notified = reason;
    });
    source.cancel("user_abort");
    expect(source.token.cancelled).toBe(true);
    expect(source.token.reason).toBe("user_abort");
    expect(notified).toBe("user_abort");
  });

  it("resolves whenCancelled", async () => {
    const source = engine.createSource();
    const promise = source.whenCancelled();
    source.cancel("stop");
    const result = await promise;
    expect(result.reason).toBe("stop");
  });

  it("propagates cancellation to linked children", () => {
    const parent = engine.createSource();
    const child = engine.createLinkedSource([parent]);
    expect(child.token.cancelled).toBe(false);
    parent.cancel("cascade");
    expect(child.token.cancelled).toBe(true);
    expect(child.token.reason).toBe("cascade");
  });

  it("is idempotent", () => {
    const source = engine.createSource();
    source.cancel("first");
    source.cancel("second");
    expect(source.token.reason).toBe("first");
  });
});
