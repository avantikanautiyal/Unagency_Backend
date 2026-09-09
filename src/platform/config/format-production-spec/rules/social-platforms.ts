/**
 * Aggregated social platform production rules (Format Spec pp. 20–27).
 */

import type { ProductionRule } from "../types";
import { FACEBOOK_RULES } from "./facebook";
import { INSTAGRAM_RULES } from "./instagram";
import { LINKEDIN_RULES } from "./linkedin";
import { SERVICE_DEFAULT_RULES } from "./service-defaults";
import { SNAPCHAT_RULES } from "./snapchat";
import { TIKTOK_RULES } from "./tiktok";
import { WHATSAPP_RULES } from "./whatsapp";
import { X_RULES } from "./x";
import { YOUTUBE_RULES } from "./youtube";

export { FACEBOOK_RULES } from "./facebook";
export { INSTAGRAM_RULES } from "./instagram";
export { LINKEDIN_RULES } from "./linkedin";
export { SERVICE_DEFAULT_RULES } from "./service-defaults";
export { SNAPCHAT_RULES } from "./snapchat";
export { TIKTOK_RULES } from "./tiktok";
export { WHATSAPP_RULES } from "./whatsapp";
export { X_RULES } from "./x";
export { YOUTUBE_RULES } from "./youtube";

export const SOCIAL_PLATFORM_RULES: readonly ProductionRule[] = Object.freeze([
  ...INSTAGRAM_RULES,
  ...FACEBOOK_RULES,
  ...LINKEDIN_RULES,
  ...X_RULES,
  ...YOUTUBE_RULES,
  ...TIKTOK_RULES,
  ...SNAPCHAT_RULES,
  ...WHATSAPP_RULES,
]);

export const ALL_PRODUCTION_RULES: readonly ProductionRule[] = Object.freeze([
  ...SOCIAL_PLATFORM_RULES,
  ...SERVICE_DEFAULT_RULES,
]);
