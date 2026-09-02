import {
  isPresentationDirectCreate,
  stampPresentationCreateMetadata,
} from "../../../src/platform/direct/presentation-direct-metadata";
import { parseToolRequestMetadata } from "../../../src/platform/providers/tools/composition/tool-runtime-platform";

describe("presentation direct metadata", () => {
  it("detects pitch-deck creates from service slug", () => {
    expect(
      isPresentationDirectCreate({
        service: "presentations",
        subtype: "pitch-decks",
      })
    ).toBe(true);
    expect(
      isPresentationDirectCreate({
        service: "presentations",
        subtype: "gifs",
      })
    ).toBe(false);
  });

  it("stamps schema when metadata only has service + subtype", () => {
    const stamped = stampPresentationCreateMetadata({
      service: "presentations",
      subtype: "pitch-decks",
      productAction: "direct_passthrough",
    });
    expect(stamped.outputKind).toBe("presentation");
    expect(stamped.presentationExpandMode).toBe("full");
    expect(stamped.deliverableRequired).toBe(true);
    expect(
      (stamped.structuredOutput as { name?: string }).name
    ).toBe("PresentationRouteConcepts");
    expect(
      (stamped.structuredOutput as { schema?: object }).schema
    ).toBeTruthy();
  });

  it("does not treat performance-ads image creates as presentation", () => {
    expect(
      isPresentationDirectCreate({
        service: "ads",
        subtype: "performance-ads",
        outputKind: "image",
      })
    ).toBe(false);
  });

  it("replaces empty client schema stubs with server PresentationRouteConcepts schema", () => {
    const stamped = stampPresentationCreateMetadata({
      service: "presentations",
      subtype: "pitch-decks",
      outputKind: "presentation",
      structuredOutput: {
        name: "PresentationRouteConcepts",
        schema: {},
        strict: true,
      },
    });
    const schema = (stamped.structuredOutput as { schema?: Record<string, unknown> })
      .schema;
    expect(schema?.properties).toBeTruthy();
    expect((schema?.properties as Record<string, unknown>)?.concepts).toBeTruthy();
    const { structuredOutput } = parseToolRequestMetadata(stamped);
    expect(structuredOutput?.name).toBe("PresentationRouteConcepts");
    expect(structuredOutput?.schema).toBeTruthy();
  });
});
