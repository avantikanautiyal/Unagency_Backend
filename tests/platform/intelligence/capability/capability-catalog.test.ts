import { CapabilityRegistry } from "../../../../src/platform/intelligence/capability-registry/implementations/capability-registry";
import { CapabilityCatalog } from "../../../../src/platform/intelligence/capability-catalog/implementations/capability-catalog";
import { asCapabilityId } from "../../../../src/platform/intelligence/shared/identifiers";
import { buildSampleCapability } from "./helpers";

describe("CapabilityCatalog", () => {
  let registry: CapabilityRegistry;
  let catalog: CapabilityCatalog;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    catalog = new CapabilityCatalog(registry);

    registry.register(
      buildSampleCapability({
        id: "analyzeBrief",
        category: "requirements",
        tags: ["brief", "featured"],
      })
    );
    registry.register(
      buildSampleCapability({
        id: "summarize",
        name: "summarize",
        category: "content",
        tags: ["summary"],
        version: "1.0.0",
      })
    );
  });

  it("finds by id and category", async () => {
    const byId = await catalog.findById(asCapabilityId("analyzeBrief"));
    expect(byId.ok).toBe(true);

    const byCategory = await catalog.findByCategory("content");
    expect(byCategory.ok).toBe(true);
    if (byCategory.ok) {
      expect(byCategory.value).toHaveLength(1);
    }
  });

  it("searches and filters", async () => {
    const search = await catalog.search("brief");
    expect(search.ok).toBe(true);
    if (search.ok) {
      expect(search.value.length).toBeGreaterThan(0);
    }

    const filtered = await catalog.filter({ tags: ["summary"] });
    expect(filtered.ok).toBe(true);
    if (filtered.ok) {
      expect(filtered.value[0]?.name).toBe("summarize");
    }
  });

  it("lists categories and tags", async () => {
    const categories = await catalog.categories();
    const tags = await catalog.tags();
    expect(categories.ok).toBe(true);
    expect(tags.ok).toBe(true);
    if (categories.ok) {
      expect(categories.value).toEqual(
        expect.arrayContaining(["content", "requirements"])
      );
    }
  });

  it("returns recent and featured", async () => {
    const recent = await catalog.recent(1);
    expect(recent.ok).toBe(true);

    const featured = await catalog.featured();
    expect(featured.ok).toBe(true);
    if (featured.ok) {
      expect(featured.value.some((c) => String(c.id) === "analyzeBrief")).toBe(
        true
      );
    }
  });

  it("does not own data — reflects registry mutations", async () => {
    registry.unregister(asCapabilityId("summarize"));
    const list = await catalog.list();
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
    }
  });
});
