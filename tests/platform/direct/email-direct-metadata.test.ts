/**
 * EmailPlan stamp — unit tests.
 */

import {
  isEmailDirectCreate,
  stampEmailCreateMetadata,
} from "../../../src/platform/direct/email-direct-metadata";

describe("stampEmailCreateMetadata", () => {
  it("detects email service creates", () => {
    expect(isEmailDirectCreate({ service: "email", subtype: "emailers" })).toBe(
      true
    );
    expect(isEmailDirectCreate({ outputKind: "email" })).toBe(true);
    expect(isEmailDirectCreate({ service: "presentations" })).toBe(false);
    expect(isEmailDirectCreate({ outputKind: "image" })).toBe(false);
  });

  it("stamps EmailPlan schema when missing", () => {
    const stamped = stampEmailCreateMetadata({
      service: "email",
      subtype: "emailers",
    });
    expect(stamped.outputKind).toBe("email");
    expect(stamped.deliverableRequired).toBe(true);
    const so = stamped.structuredOutput as {
      name: string;
      schema: { required: string[] };
      strict: boolean;
    };
    expect(so.name).toBe("EmailPlan");
    expect(so.strict).toBe(true);
    expect(so.schema.required).toEqual(
      expect.arrayContaining(["title", "subject", "html", "textFallback"])
    );
  });

  it("is idempotent when schema already present", () => {
    const first = stampEmailCreateMetadata({ service: "email" });
    const second = stampEmailCreateMetadata(first);
    expect(second.structuredOutput).toEqual(first.structuredOutput);
  });
});
