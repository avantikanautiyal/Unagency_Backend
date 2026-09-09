import mongoose from "mongoose";
import Requirement from "../models/requestProject.model";
import Staff from "../models/staff.model";
import Users from "../models/users.model";

/** Max concurrent non-delivered Human/Hybrid requests per CS agent. */
export const CS_MAX_TASK_CAPACITY = 8;

const DELIVERED_STATUSES = [
  "closed",
  "delivered",
  "completed",
  "approved",
  "cancelled",
  "rejected",
  "done",
] as const;

export function isDeliveredRequirementStatus(status?: string): boolean {
  const value = (status ?? "").toLowerCase().trim();
  if (!value) return false;
  return DELIVERED_STATUSES.some((token) => value.includes(token));
}

export function isHumanHybridCreationMode(mode?: string | null): boolean {
  const normalized = String(mode ?? "")
    .toLowerCase()
    .trim();
  if (
    normalized === "ai" ||
    normalized === "ai_only" ||
    normalized === "ai_creative"
  ) {
    return false;
  }
  return (
    normalized === "human" ||
    normalized === "hybrid" ||
    normalized === "" ||
    !normalized
  );
}

export async function countActiveCsAssignments(
  staffId: mongoose.Types.ObjectId | string
): Promise<number> {
  return Requirement.countDocuments({
    assignedCs: new mongoose.Types.ObjectId(String(staffId)),
    creationMode: { $in: ["human", "hybrid"] },
    status: {
      $not: {
        $regex: DELIVERED_STATUSES.join("|"),
        $options: "i",
      },
    },
  });
}

export type LeastBusyCsAgent = {
  staffId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  activeCount: number;
  loadPct: number;
};

export async function pickLeastBusyCsAgent(): Promise<LeastBusyCsAgent | null> {
  const servicingUsers = await Users.find({
    role: "servicing",
    isActive: { $ne: false },
  })
    .select("_id name")
    .lean();

  if (!servicingUsers.length) return null;

  const staffRows = await Staff.find({
    userId: { $in: servicingUsers.map((user) => user._id) },
    status: { $ne: false },
  })
    .select("_id userId")
    .lean();

  if (!staffRows.length) return null;

  const nameByUserId = new Map(
    servicingUsers.map((user) => [String(user._id), user.name?.trim() || ""])
  );

  const candidates = await Promise.all(
    staffRows.map(async (staff) => {
      const activeCount = await countActiveCsAssignments(staff._id);
      const loadPct = activeCount / CS_MAX_TASK_CAPACITY;
      const userId = staff.userId as mongoose.Types.ObjectId;
      const name = nameByUserId.get(String(userId)) || "";
      return {
        staffId: staff._id as mongoose.Types.ObjectId,
        userId,
        name,
        activeCount,
        loadPct,
      };
    })
  );

  candidates.sort((left, right) => {
    if (left.loadPct !== right.loadPct) return left.loadPct - right.loadPct;
    return left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    });
  });

  return candidates[0] ?? null;
}

export async function assignCsToRequirement(
  requirementId: mongoose.Types.ObjectId | string
): Promise<LeastBusyCsAgent | null> {
  const picked = await pickLeastBusyCsAgent();
  if (!picked) return null;

  await Requirement.findByIdAndUpdate(requirementId, {
    $set: { assignedCs: picked.staffId },
  });

  return picked;
}

/**
 * CS may service a customer if they are the org relationship manager
 * OR they hold at least one human/hybrid requirement for that customer.
 * Admin / superadmin always allowed.
 */
export async function servicingCanAccessCustomer(input: {
  staffId: unknown;
  customerId: string;
  role?: string;
}): Promise<boolean> {
  const role = String(input.role ?? "")
    .toLowerCase()
    .trim();
  if (role === "superadmin" || role === "admin") return true;
  if (!input.staffId || !input.customerId) return false;
  if (!mongoose.isValidObjectId(String(input.customerId))) return false;

  const staffObjectId = new mongoose.Types.ObjectId(String(input.staffId));
  const customerObjectId = new mongoose.Types.ObjectId(input.customerId);

  const linkedCustomer = await Users.exists({
    _id: customerObjectId,
    relationship_manager: staffObjectId,
  });
  if (linkedCustomer) return true;

  const assignedRequirement = await Requirement.exists({
    userId: customerObjectId,
    assignedCs: staffObjectId,
    creationMode: { $in: ["human", "hybrid"] },
  });
  return Boolean(assignedRequirement);
}
