/**
 * Saved prompt routes (M10.12).
 */

import mongoose from "mongoose";
import SavedRoutes, { type ISavedRoute } from "../models/savedRoute.model";
import { ApiError } from "../utils/apiError";
import { resolveCustomerOrganizationId } from "./product-asset-service";

export type SavedRouteDto = {
  id: string;
  userId: string;
  organizationId: string;
  title: string;
  prompt: string;
  intent?: string;
  capabilityId?: string;
  pinned: boolean;
  favorite: boolean;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
};

function toDto(doc: ISavedRoute): SavedRouteDto {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    organizationId: doc.organizationId.toString(),
    title: doc.title,
    prompt: doc.prompt,
    intent: doc.intent,
    capabilityId: doc.capabilityId,
    pinned: Boolean(doc.pinned),
    favorite: Boolean(doc.favorite),
    lastUsedAt: doc.lastUsedAt?.toISOString(),
    createdAt: doc.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

export class SavedRouteService {
  async list(input: {
    userId: string;
    organizationId?: string;
    favoritesOnly?: boolean;
  }): Promise<SavedRouteDto[]> {
    const organizationId = await resolveCustomerOrganizationId(
      input.userId,
      input.organizationId
    );
    const filter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(input.userId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
    };
    if (input.favoritesOnly) filter.favorite = true;
    const docs = await SavedRoutes.find(filter)
      .sort({ pinned: -1, lastUsedAt: -1, updatedAt: -1 })
      .limit(100);
    return docs.map(toDto);
  }

  async create(input: {
    userId: string;
    organizationId?: string;
    title: string;
    prompt: string;
    intent?: string;
    capabilityId?: string;
    pinned?: boolean;
    favorite?: boolean;
  }): Promise<SavedRouteDto> {
    const organizationId = await resolveCustomerOrganizationId(
      input.userId,
      input.organizationId
    );
    const title = String(input.title ?? "").trim();
    const prompt = String(input.prompt ?? "").trim();
    if (!title || !prompt) {
      throw new ApiError("title and prompt are required", 400);
    }
    const doc = await SavedRoutes.create({
      userId: new mongoose.Types.ObjectId(input.userId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      title,
      prompt,
      intent: input.intent,
      capabilityId: input.capabilityId,
      pinned: Boolean(input.pinned),
      favorite: Boolean(input.favorite),
      lastUsedAt: new Date(),
    });
    return toDto(doc);
  }

  async update(input: {
    userId: string;
    routeId: string;
    patch: Partial<{
      title: string;
      prompt: string;
      pinned: boolean;
      favorite: boolean;
      touch: boolean;
    }>;
  }): Promise<SavedRouteDto> {
    const doc = await SavedRoutes.findOne({
      _id: input.routeId,
      userId: input.userId,
    });
    if (!doc) throw new ApiError("Saved route not found", 404);
    if (input.patch.title != null) doc.title = String(input.patch.title).trim();
    if (input.patch.prompt != null)
      doc.prompt = String(input.patch.prompt).trim();
    if (input.patch.pinned != null) doc.pinned = Boolean(input.patch.pinned);
    if (input.patch.favorite != null)
      doc.favorite = Boolean(input.patch.favorite);
    if (input.patch.touch) doc.lastUsedAt = new Date();
    await doc.save();
    return toDto(doc);
  }

  async remove(input: {
    userId: string;
    routeId: string;
  }): Promise<{ deleted: true; id: string }> {
    const doc = await SavedRoutes.findOneAndDelete({
      _id: input.routeId,
      userId: input.userId,
    });
    if (!doc) throw new ApiError("Saved route not found", 404);
    return { deleted: true, id: doc._id.toString() };
  }
}

export const savedRouteService = new SavedRouteService();
