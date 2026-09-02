import { classifyServiceContext } from "../../../src/platform/config/service-context-classifier";

describe("classifyServiceContext megaprompt", () => {
  it("does not misclassify pitch deck as logo when brand block mentions logo", () => {
    const megaprompt = `[Product selection — required deliverable]
Path: presentations/pitch-decks
Deliverable: Presentations · Pitch Decks
Service: Presentations

[Selected brand — required identity]
Brand name: DiVastra
If any wordmark, letters, or logo text appear, they MUST spell "DiVastra" exactly.

[User brief]
Create a presentation that explains the brand and strategy of how are we going to proceed`;

    const result = classifyServiceContext({
      prompt: megaprompt,
      service: "presentations",
      subtype: "pitch-decks",
      productPath: "presentations/pitch-decks",
      deliverableLabel: "Presentations · Pitch Decks",
    });
    expect(result.kind).toBe("match");
    expect(result.detected?.service).toBe("presentations");
  });

  it("matches corporate presentation subtype with generic presentation brief", () => {
    const result = classifyServiceContext({
      prompt:
        "Create a presentation that explains the brand and strategy of how are we going to proceed",
      service: "presentations",
      subtype: "corporate",
      productPath: "presentations/corporate",
      deliverableLabel: "Presentations · Corporate",
    });
    expect(result.kind).toBe("match");
  });
});
