import { normalizeSchemaForOpenAiStrict } from "../../../src/platform/providers/tools/structured/structured-output-execution";

describe("refinement question schema strictness", () => {
  it("normalizes nested option objects for OpenAI strict json_schema", () => {
    const raw = {
      type: "object",
      properties: {
        questionId: { type: "string" },
        dimension: { type: "string" },
        question: { type: "string" },
        selectionType: { type: "string" },
        required: { type: "boolean" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              optionId: { type: "string" },
              label: { type: "string" },
              value: { type: "string" },
              refinementSignal: { type: "string" },
            },
          },
        },
      },
      required: ["questionId", "dimension", "question", "selectionType", "options"],
    };
    const normalized = normalizeSchemaForOpenAiStrict(raw);
    expect(normalized.additionalProperties).toBe(false);
    expect(normalized.required).toEqual(
      expect.arrayContaining([
        "questionId",
        "dimension",
        "question",
        "selectionType",
        "required",
        "options",
      ])
    );
    const items = (normalized.properties as Record<string, unknown>).options as {
      items: Record<string, unknown>;
    };
    expect(items.items.additionalProperties).toBe(false);
    expect(items.items.required).toEqual(
      expect.arrayContaining(["optionId", "label", "value", "refinementSignal"])
    );
  });
});
