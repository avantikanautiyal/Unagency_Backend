/**
 * Voice prompt / STT HTTP controllers (M10.15).
 */

import { Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import { RequestUser } from "../types/user";
import { productAssetUpload } from "./product-assets.controller";
import { voicePromptService } from "../services/voice-prompt-service";

export { productAssetUpload };

function orgIdFromUser(req: RequestUser): string {
  const org = req.user?.organization as { _id?: { toString(): string } } | null;
  const id = org?._id?.toString();
  if (!id) throw new ApiError("No organisation found for user", 400);
  return id;
}

/** POST /voice/transcribe — multipart `file` or JSON `{ assetId }` */
export const transcribeVoicePrompt = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const userId = String(req.user!.userId);
    const organizationId =
      (req.body?.organizationId as string | undefined) || orgIdFromUser(req);
    const workspaceId = req.body?.workspaceId as string | undefined;
    const language = req.body?.language as string | undefined;
    const signal = (req as { signal?: AbortSignal }).signal;

    if (req.file) {
      const data = await voicePromptService.uploadAndTranscribe({
        userId,
        organizationId,
        workspaceId,
        filename: req.file.originalname || "voice-prompt.m4a",
        mimeType: req.file.mimetype,
        bytes: req.file.buffer,
        language,
        signal,
      });
      return new ApiResponse(200, data, "Transcript ready");
    }

    const assetId = req.body?.assetId as string | undefined;
    if (!assetId?.trim()) {
      throw new ApiError("file or assetId is required", 400);
    }

    const data = await voicePromptService.transcribeAsset({
      userId,
      organizationId,
      workspaceId,
      assetId: assetId.trim(),
      language,
      signal,
    });
    return new ApiResponse(200, data, "Transcript ready");
  }
);

/** POST /voice/transcribe/cancel — cancel in-flight STT execution */
export const cancelVoiceTranscription = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const organizationId =
      (req.body?.organizationId as string | undefined) || orgIdFromUser(req);
    const executionId = String(req.body?.executionId ?? "").trim();
    if (!executionId) throw new ApiError("executionId is required", 400);
    const data = await voicePromptService.cancel({
      organizationId,
      workspaceId: req.body?.workspaceId as string | undefined,
      executionId,
    });
    return new ApiResponse(200, data, "Transcription cancelled");
  }
);
