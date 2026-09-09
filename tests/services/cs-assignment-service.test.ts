import {
  CS_MAX_TASK_CAPACITY,
  isDeliveredRequirementStatus,
  isHumanHybridCreationMode,
} from "../../src/services/cs-assignment-service";

describe("cs-assignment-service", () => {
  it("uses capacity of 8 for CS load", () => {
    expect(CS_MAX_TASK_CAPACITY).toBe(8);
  });

  it("detects delivered requirement statuses", () => {
    expect(isDeliveredRequirementStatus("closed")).toBe(true);
    expect(isDeliveredRequirementStatus("Delivered")).toBe(true);
    expect(isDeliveredRequirementStatus("completed")).toBe(true);
    expect(isDeliveredRequirementStatus("approved")).toBe(true);
    expect(isDeliveredRequirementStatus("raised")).toBe(false);
    expect(isDeliveredRequirementStatus("in_progress")).toBe(false);
  });

  it("treats human and hybrid as CS-serviced modes", () => {
    expect(isHumanHybridCreationMode("human")).toBe(true);
    expect(isHumanHybridCreationMode("hybrid")).toBe(true);
    expect(isHumanHybridCreationMode("ai")).toBe(false);
    expect(isHumanHybridCreationMode("ai_creative")).toBe(false);
  });
});
