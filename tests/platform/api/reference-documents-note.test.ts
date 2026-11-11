/** The client is told what happened to attached non-image files. */

import { referenceDocumentsNote } from "../../../src/platform/api/services/execution-create-dispatch";

describe("referenceDocumentsNote", () => {
  it("says a ZIP was not used as a visual reference", () => {
    expect(
      referenceDocumentsNote({
        referenceDocuments: [{ fileName: "ZESTO - Logo Pack.zip", usedAs: "skipped" }],
      }),
    ).toBe(`"ZESTO - Logo Pack.zip" isn't an image, so it wasn't used as a visual reference.`);
  });

  it("names documents whose text informed the brief", () => {
    expect(
      referenceDocumentsNote({
        referenceDocuments: [
          { fileName: "Brand guidelines.docx", usedAs: "brief_text" },
          { fileName: "Logo Pack.zip", usedAs: "skipped" },
          { fileName: "Deck.pptx", usedAs: "skipped" },
        ],
      }),
    ).toBe(
      `We used the text in "Brand guidelines.docx" as part of the brief. "Logo Pack.zip" and "Deck.pptx" aren't images, so they weren't used as visual references.`,
    );
  });

  it("is silent when no documents were attached", () => {
    expect(referenceDocumentsNote({})).toBeUndefined();
    expect(referenceDocumentsNote(undefined)).toBeUndefined();
  });
});

describe("referenceDocumentsNote — image formats providers reject", () => {
  it("does not call an SVG 'not an image'", () => {
    expect(
      referenceDocumentsNote({
        referenceDocuments: [
          { fileName: "logo.svg", usedAs: "skipped", skipReason: "unsupported_image_format" },
        ],
      }),
    ).toBe(`"logo.svg" is in a format the image models can't read, so it wasn't used as a visual reference. PNG or JPEG works.`);
  });
});
