import { Router } from "express";
import { VerifyRole } from "../middlewares/verifyUser.middleware";
import {
  cancelVoiceTranscription,
  productAssetUpload,
  transcribeVoicePrompt,
} from "../controllers/voice.controller";

const router = Router();

router.post(
  "/transcribe",
  VerifyRole(["customer"]),
  productAssetUpload.single("file"),
  transcribeVoicePrompt
);

router.post(
  "/transcribe/cancel",
  VerifyRole(["customer"]),
  cancelVoiceTranscription
);

export default router;
