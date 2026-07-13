/**
 * Deterministic mock capability handlers for platform integration tests.
 * No provider calls.
 */

export type MockCapabilityHandler = (
  input: Readonly<Record<string, unknown>>
) => Readonly<Record<string, unknown>>;

export const MOCK_CAPABILITY_IDS = [
  "echo",
  "uppercase",
  "summarize_mock",
  "translate_mock",
] as const;

export type MockCapabilityId = (typeof MOCK_CAPABILITY_IDS)[number];

export const mockCapabilityHandlers: Record<
  MockCapabilityId,
  MockCapabilityHandler
> = {
  echo: (input) => ({
    message: String(input.message ?? ""),
  }),
  uppercase: (input) => ({
    text: String(input.text ?? "").toUpperCase(),
  }),
  summarize_mock: (_input) => ({
    summary: "Mock summary.",
  }),
  translate_mock: (input) => {
    const text = String(input.text ?? "");
    const language = String(input.language ?? "");
    if (text === "Hello" && language === "fr") {
      return { translation: "Bonjour (mock)" };
    }
    return { translation: `${text} (mock)` };
  },
};

export function applyMockCapabilityOutput(
  capabilityId: string,
  input: Readonly<Record<string, unknown>>,
  fallbackOutput?: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  const handler = mockCapabilityHandlers[capabilityId as MockCapabilityId];
  if (handler) {
    return handler(input);
  }
  return fallbackOutput ?? { placeholder: true };
}
