/**
 * Strategy profile seeds by pipeline family.
 */

export const PIPELINE_JUDGE_SEEDS = {
  marketing: [
    "marketing",
    "creative",
    "brand",
    "grammar",
    "accessibility",
    "social_media",
    "safety",
    "human",
  ],
  software: [
    "architecture",
    "security",
    "performance",
    "testing",
    "maintainability",
    "code_quality",
    "safety",
    "human",
  ],
  healthcare: [
    "medical",
    "factual",
    "compliance",
    "safety",
    "hallucination",
    "policy",
    "human",
  ],
  legal: ["legal", "policy", "compliance", "factual", "safety", "human"],
  finance: ["finance", "factual", "compliance", "safety", "human"],
  research: ["research", "factual", "reasoning", "hallucination", "grammar", "human"],
  media: [
    "image_quality",
    "video_quality",
    "audio_quality",
    "creative",
    "accessibility",
    "safety",
    "human",
  ],
  general: [
    "instruction",
    "brand",
    "policy",
    "grammar",
    "safety",
    "factual",
    "hallucination",
    "human",
  ],
} as const;
