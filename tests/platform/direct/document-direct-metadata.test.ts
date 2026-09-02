import {
  isDocumentDirectCreate,
  stampDocumentCreateMetadata,
} from "../../../src/platform/direct/document-direct-metadata";

describe("document-direct-metadata", () => {
  it("detects print brochure creates", () => {
    expect(
      isDocumentDirectCreate({
        service: "print",
        subtype: "brochures",
      })
    ).toBe(true);
  });

  it("does not treat pitch decks as documents", () => {
    expect(
      isDocumentDirectCreate({
        service: "presentations",
        subtype: "pitch-decks",
      })
    ).toBe(false);
  });

  it("stamps DocumentPlan schema on brochure metadata", () => {
    const stamped = stampDocumentCreateMetadata({
      service: "print",
      subtype: "brochures",
      outputKind: "document",
    });
    expect(stamped.outputKind).toBe("document");
    expect(stamped.deliverableRequired).toBe(true);
    const so = stamped.structuredOutput as { name?: string; schema?: unknown };
    expect(so.name).toBe("DocumentPlan");
    expect(so.schema).toBeTruthy();
    const props = (so.schema as { properties?: Record<string, unknown> })
      .properties;
    expect(props).toHaveProperty("sections");
  });

  it("preserves an existing DocumentPlan schema", () => {
    const existing = {
      name: "DocumentPlan",
      schema: {
        type: "object",
        properties: { title: {}, summary: {}, sections: {} },
      },
      strict: true,
    };
    const stamped = stampDocumentCreateMetadata({
      service: "print",
      subtype: "leaflets",
      structuredOutput: existing,
    });
    expect(stamped.structuredOutput).toEqual(existing);
  });
});
