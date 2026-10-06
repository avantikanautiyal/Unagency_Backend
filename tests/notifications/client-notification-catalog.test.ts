import {
  CLIENT_NOTIFICATION_CATALOG,
  renderTemplate,
} from "../../src/notifications/client-notification-catalog";

describe("client notification catalogue", () => {
  it("contains every row from the approved 30-page client document", () => {
    expect(Object.keys(CLIENT_NOTIFICATION_CATALOG)).toHaveLength(179);
  });

  it("has complete copy and delivery metadata for every event", () => {
    for (const [eventKey, item] of Object.entries(CLIENT_NOTIFICATION_CATALOG)) {
      expect(eventKey).toMatch(/^[A-Z0-9_]+$/);
      expect(item.trigger).not.toBe("");
      expect(item.title).not.toBe("");
      expect(item.body).not.toBe("");
      expect(item.primaryCta).not.toBe("");
      expect(item.section).not.toBe("");
      expect(item.channels.length).toBeGreaterThan(0);
    }
  });

  it("renders known placeholders and preserves unknown placeholders", () => {
    expect(
      renderTemplate("[Project Name] is ready for [Name] in [Workspace].", {
        "Project Name": "Launch",
        Name: "Ava",
      })
    ).toBe("Launch is ready for Ava in [Workspace].");
  });
});

