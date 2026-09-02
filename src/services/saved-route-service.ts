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
  subtitle?: string;
  intent?: string;
  capabilityId?: string;
  artifactId?: string;
  executionId?: string;
  sourceRouteId?: string;
  mediaKind?: string;
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
    subtitle: doc.subtitle,
    intent: doc.intent,
    capabilityId: doc.capabilityId,
    artifactId: doc.artifactId,
    executionId: doc.executionId,
    sourceRouteId: doc.sourceRouteId,
    mediaKind: doc.mediaKind,
    pinned: Boolean(doc.pinned),
    favorite: Boolean(doc.favorite),
    lastUsedAt: doc.lastUsedAt?.toISOString(),
    createdAt: doc.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

function optionalTrim(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class SavedRouteService {
  async list(input: {
    userId: string;
    organizationId?: string;
    favoritesOnly?: boolean;
    executionId?: string;
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
    if (input.executionId) filter.executionId = input.executionId;
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
    subtitle?: string;
    intent?: string;
    capabilityId?: string;
    artifactId?: string;
    executionId?: string;
    sourceRouteId?: string;
    mediaKind?: string;
    pinned?: boolean;
    favorite?: boolean;
    /** Product brand to compound preferences into (optional). */
    brandId?: string;
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

    const sourceRouteId = optionalTrim(input.sourceRouteId);
    const payload = {
      title,
      prompt,
      subtitle: optionalTrim(input.subtitle),
      intent: optionalTrim(input.intent),
      capabilityId: optionalTrim(input.capabilityId),
      artifactId: optionalTrim(input.artifactId),
      executionId: optionalTrim(input.executionId),
      sourceRouteId,
      mediaKind: optionalTrim(input.mediaKind),
      pinned: Boolean(input.pinned),
      favorite: Boolean(input.favorite),
      lastUsedAt: new Date(),
    };

    // Upsert by sourceRouteId so re-saving the same carousel card does not
    // create duplicate "Route N of M" entries.
    if (sourceRouteId) {
      const existing = await SavedRoutes.findOne({
        userId: new mongoose.Types.ObjectId(input.userId),
        sourceRouteId,
      });
      if (existing) {
        existing.title = payload.title;
        existing.prompt = payload.prompt;
        if (payload.subtitle !== undefined) existing.subtitle = payload.subtitle;
        if (payload.intent !== undefined) existing.intent = payload.intent;
        if (payload.capabilityId !== undefined) {
          existing.capabilityId = payload.capabilityId;
        }
        if (payload.artifactId !== undefined) {
          existing.artifactId = payload.artifactId;
        }
        if (payload.executionId !== undefined) {
          existing.executionId = payload.executionId;
        }
        if (payload.mediaKind !== undefined) {
          existing.mediaKind = payload.mediaKind;
        }
        existing.pinned = payload.pinned;
        existing.favorite = payload.favorite;
        existing.lastUsedAt = payload.lastUsedAt;
        await existing.save();
        return toDto(existing);
      }
    }

    const doc = await SavedRoutes.create({
      userId: new mongoose.Types.ObjectId(input.userId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      ...payload,
    });
    const result = toDto(doc);
    return result;
  }

  async update(input: {
    userId: string;
    routeId: string;
    patch: Partial<{
      title: string;
      prompt: string;
      subtitle: string;
      artifactId: string;
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
    if (input.patch.subtitle != null)
      doc.subtitle = String(input.patch.subtitle).trim();
    if (input.patch.artifactId != null)
      doc.artifactId = String(input.patch.artifactId).trim();
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
