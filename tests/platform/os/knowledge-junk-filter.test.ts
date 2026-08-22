import { isJunkKnowledgeChunkText } from "../../../src/services/knowledge-document-index-service";

describe("isJunkKnowledgeChunkText", () => {
  it("rejects OS megaprompt execution learning noise", () => {
    expect(
      isJunkKnowledgeChunkText(
        "User prompt: [Knowledge status=EMPTY] [Brand name=DiVastra tone=modern"
      )
    ).toBe(true);
  });

  it("rejects structured brief blocks", () => {
    expect(
      isJunkKnowledgeChunkText("[Structured Brief — authoritative]\nintent=presentation")
    ).toBe(true);
  });

  it("allows plain business facts", () => {
    expect(
      isJunkKnowledgeChunkText("DiVastra — ethnic wear for modern women. Brand colors: white, beige, peach.")
    ).toBe(false);
  });
});
