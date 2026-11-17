import mongoose from "mongoose";
import Brands from "../models/brand.model";
import { dispatchClientNotification } from "./client-notification-service";

/**
 * AI / Hybrid projects are created when the brief is submitted (CDF
 * submit_brief). Sends "Project created" then the mode's "brief submitted",
 * in that order. Never throws.
 */
export async function notifyCreativeProjectCreated(input: {
  projectId: string;
  userId: string;
  title?: string;
  creationMode: string;
  brandId?: string;
}): Promise<void> {
  try {
    if (!mongoose.isValidObjectId(input.userId)) return;
    let brandName = "your workspace";
    if (input.brandId && mongoose.isValidObjectId(input.brandId)) {
      const brand = await Brands.findById(input.brandId)
        .select("name isGeneric")
        .lean<{ name?: string; isGeneric?: boolean }>();
      if (brand?.name && !brand.isGeneric) brandName = brand.name;
    }
    const projectName = input.title?.trim() || "Your project";
    const open = { action: `/progress?projectId=${encodeURIComponent(input.projectId)}` };
    const base = {
      userId: input.userId,
      primaryAction: open,
      entityType: "project",
      entityId: input.projectId,
    };

    await dispatchClientNotification({
      ...base,
      eventKey: "PROJECT_CREATED",
      variables: { "Project Name": projectName, "Brand Name": brandName },
      dedupeKey: `created:${input.projectId}`,
    });
    await dispatchClientNotification({
      ...base,
      eventKey: input.creationMode === "hybrid" ? "HYBRID_BRIEF_SUBMITTED" : "AI_BRIEF_SUBMITTED",
      dedupeKey: `brief:${input.projectId}`,
      channels: ["in_app", "push"],
    });
  } catch (err) {
    console.error("[notifications] project created notification failed", err);
  }
}
