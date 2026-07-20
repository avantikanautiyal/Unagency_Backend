import { InMemoryPlaybookRepository } from "../../../../src/platform/intelligence/task-intelligence/repositories/in-memory-playbook-repository";
import { DEFAULT_PLAYBOOKS } from "../../../../src/platform/intelligence/task-intelligence/templates/playbook-seed";

describe("Client Playbook Library", () => {
  it("lists versioned playbooks", () => {
    const repo = new InMemoryPlaybookRepository();
    const list = repo.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.length).toBe(DEFAULT_PLAYBOOKS.length);
    expect(list.value[0].version).toBe("1.0.0");
  });

  it("matches retail product launch playbook", () => {
    const repo = new InMemoryPlaybookRepository();
    const match = repo.match("Launch a new sneaker collection", "retail");
    expect(match.ok).toBe(true);
    if (!match.ok) return;
    expect(match.value?.name).toBe("Retail Product Launch");
    expect(match.value?.tasks.length).toBeGreaterThanOrEqual(13);
  });

  it("matches real estate playbook by keywords", () => {
    const repo = new InMemoryPlaybookRepository();
    const match = repo.match("Create property listing brochure for downtown apartment");
    expect(match.ok).toBe(true);
    if (!match.ok) return;
    expect(match.value?.industry).toBe("real_estate");
  });
});
