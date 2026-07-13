import { InMemorySdkRegistry } from "../../../../../src/platform/intelligence/providers/sdk/registry/in-memory-sdk-registry";
import {
  createOpenAISdkWrapper,
  createAnthropicSdkWrapper,
} from "../../../../../src/platform/intelligence/providers/sdk/factories/create-placeholder-wrappers";

describe("SDK registry", () => {
  it("registers, resolves, lists, and describes clients", () => {
    const registry = new InMemorySdkRegistry();
    const openai = createOpenAISdkWrapper();

    expect(registry.register(openai).ok).toBe(true);
    expect(registry.list()).toContain("openai");
    expect(registry.resolve("openai").ok).toBe(true);

    const described = registry.describe("openai");
    expect(described.ok).toBe(true);
    if (described.ok) {
      expect(described.value.vendor).toBe("openai");
    }
  });

  it("rejects duplicate registration and unknown resolution", () => {
    const registry = new InMemorySdkRegistry();
    registry.register(createOpenAISdkWrapper());
    expect(registry.register(createOpenAISdkWrapper()).ok).toBe(false);
    expect(registry.resolve("gemini").ok).toBe(false);
  });

  it("removes a registered client", () => {
    const registry = new InMemorySdkRegistry();
    registry.register(createAnthropicSdkWrapper());
    expect(registry.remove("anthropic").ok).toBe(true);
    expect(registry.resolve("anthropic").ok).toBe(false);
  });

  it("validates client descriptors", () => {
    const registry = new InMemorySdkRegistry();
    const client = createOpenAISdkWrapper();
    const validation = registry.validate(client);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.value.valid).toBe(true);
    }
  });
});
