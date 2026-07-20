/**
 * Judge registry — plugins including existing core judges (not duplicated).
 */

import { failure, success, type Result } from "../../shared/result";
import { EvaluationValidationError } from "../errors";
import type { IJudge } from "../interfaces/evaluation-ports";
import type { JudgeKind } from "../contracts/evaluation-models";
import type { IJudgeRegistry, JudgePluginDescriptor } from "../interfaces/dynamic-evaluation-ports";
import { InstructionJudge } from "../judges/instruction-judge";
import { BrandJudge } from "../judges/brand-judge";
import { PolicyJudge } from "../judges/policy-judge";
import { SchemaJudge } from "../judges/schema-judge";
import { GrammarJudge } from "../judges/grammar-judge";
import { SafetyJudge } from "../judges/safety-judge";
import { FactualJudge } from "../judges/factual-judge";
import { HallucinationJudge } from "../judges/hallucination-judge";
import { HumanJudge } from "../judges/human-judge";
import {
  AccessibilityJudgePlugin,
  ArchitectureJudgePlugin,
  AudioQualityJudgePlugin,
  CodeQualityJudgePlugin,
  ComplianceJudgePlugin,
  CreativeJudgePlugin,
  FinanceJudgePlugin,
  ImageQualityJudgePlugin,
  LegalJudgePlugin,
  MaintainabilityJudgePlugin,
  MarketingJudgePlugin,
  MedicalJudgePlugin,
  PerformanceJudgePlugin,
  ReasoningJudgePlugin,
  ResearchJudgePlugin,
  SecurityJudgePlugin,
  SeoJudgePlugin,
  SocialMediaJudgePlugin,
  TestingJudgePlugin,
  UxJudgePlugin,
  VideoQualityJudgePlugin,
} from "./plugins";

export class DefaultJudgeRegistry implements IJudgeRegistry {
  private readonly descriptors = new Map<JudgeKind, JudgePluginDescriptor>();
  private readonly judges = new Map<JudgeKind, IJudge>();

  register(descriptor: JudgePluginDescriptor, judge: IJudge): Result<void> {
    if (descriptor.kind !== judge.kind) {
      return failure(
        new EvaluationValidationError(
          `descriptor kind ${descriptor.kind} != judge kind ${judge.kind}`
        )
      );
    }
    this.descriptors.set(descriptor.kind, descriptor);
    this.judges.set(descriptor.kind, judge);
    return success(undefined);
  }

  get(kind: JudgeKind): Result<IJudge | undefined> {
    return success(this.judges.get(kind));
  }

  getDescriptor(kind: JudgeKind): Result<JudgePluginDescriptor | undefined> {
    return success(this.descriptors.get(kind));
  }

  list(): Result<readonly JudgePluginDescriptor[]> {
    return success([...this.descriptors.values()]);
  }

  listJudges(): Result<readonly IJudge[]> {
    return success([...this.judges.values()]);
  }

  resolve(kinds: readonly JudgeKind[]): Result<readonly IJudge[]> {
    const out: IJudge[] = [];
    for (const kind of kinds) {
      const judge = this.judges.get(kind);
      if (!judge) {
        return failure(new EvaluationValidationError(`judge not registered: ${kind}`));
      }
      out.push(judge);
    }
    return success(out);
  }
}

function desc(
  kind: JudgeKind,
  displayName: string,
  domains: readonly string[],
  industries: readonly string[],
  tags: readonly string[],
  description: string
): JudgePluginDescriptor {
  return {
    pluginId: `plugin_${kind}`,
    kind,
    displayName,
    domains: [...domains],
    industries: [...industries],
    tags: [...tags],
    description,
  };
}

export function createDefaultJudgeRegistry(): DefaultJudgeRegistry {
  const registry = new DefaultJudgeRegistry();

  const core: Array<[JudgePluginDescriptor, IJudge]> = [
    [desc("instruction", "Instruction Judge", ["general"], ["*"], ["core"], "Instruction adherence"), new InstructionJudge()],
    [desc("brand", "Brand Judge", ["marketing", "design"], ["retail", "saas"], ["core", "brand"], "Brand alignment"), new BrandJudge()],
    [desc("policy", "Policy Judge", ["general"], ["*"], ["core", "policy"], "Policy compliance"), new PolicyJudge()],
    [desc("schema", "Schema Judge", ["software"], ["*"], ["core"], "Schema validity"), new SchemaJudge()],
    [desc("grammar", "Grammar Judge", ["marketing", "content"], ["*"], ["core"], "Grammar quality"), new GrammarJudge()],
    [desc("safety", "Safety Judge", ["general"], ["*"], ["core", "safety"], "Safety checks"), new SafetyJudge()],
    [desc("factual", "Fact Judge", ["research", "healthcare"], ["*"], ["core"], "Factual accuracy"), new FactualJudge()],
    [desc("hallucination", "Hallucination Judge", ["general"], ["*"], ["core"], "Hallucination risk"), new HallucinationJudge()],
    [desc("human", "Human Judge", ["general"], ["*"], ["core", "human"], "Human review signal"), new HumanJudge()],
  ];

  const plugins: Array<[JudgePluginDescriptor, IJudge]> = [
    [desc("marketing", "Marketing Judge", ["marketing"], ["retail", "saas"], ["marketing"], "Marketing effectiveness"), new MarketingJudgePlugin()],
    [desc("creative", "Creative Judge", ["marketing", "design"], ["retail"], ["creative"], "Creative quality"), new CreativeJudgePlugin()],
    [desc("social_media", "Social Media Judge", ["marketing"], ["retail", "saas"], ["social"], "Social fitness"), new SocialMediaJudgePlugin()],
    [desc("seo", "SEO Judge", ["marketing"], ["*"], ["seo"], "SEO quality"), new SeoJudgePlugin()],
    [desc("accessibility", "Accessibility Judge", ["design", "marketing"], ["*"], ["a11y"], "Accessibility"), new AccessibilityJudgePlugin()],
    [desc("architecture", "Architecture Judge", ["software"], ["tech"], ["architecture"], "Software architecture"), new ArchitectureJudgePlugin()],
    [desc("security", "Security Judge", ["software"], ["tech", "healthcare"], ["security"], "Security posture"), new SecurityJudgePlugin()],
    [desc("performance", "Performance Judge", ["software"], ["tech"], ["performance"], "Performance"), new PerformanceJudgePlugin()],
    [desc("code_quality", "Code Quality Judge", ["software"], ["tech"], ["code"], "Code quality"), new CodeQualityJudgePlugin()],
    [desc("testing", "Testing Judge", ["software"], ["tech"], ["testing"], "Test coverage quality"), new TestingJudgePlugin()],
    [desc("maintainability", "Maintainability Judge", ["software"], ["tech"], ["maintainability"], "Maintainability"), new MaintainabilityJudgePlugin()],
    [desc("medical", "Medical Judge", ["healthcare"], ["healthcare"], ["medical"], "Clinical soundness"), new MedicalJudgePlugin()],
    [desc("legal", "Legal Judge", ["legal"], ["legal"], ["legal"], "Legal soundness"), new LegalJudgePlugin()],
    [desc("finance", "Finance Judge", ["finance"], ["finance"], ["finance"], "Financial soundness"), new FinanceJudgePlugin()],
    [desc("research", "Research Judge", ["research"], ["*"], ["research"], "Research quality"), new ResearchJudgePlugin()],
    [desc("reasoning", "Reasoning Judge", ["general", "research"], ["*"], ["reasoning"], "Reasoning quality"), new ReasoningJudgePlugin()],
    [desc("compliance", "Compliance Judge", ["healthcare", "legal", "finance"], ["*"], ["compliance"], "Compliance"), new ComplianceJudgePlugin()],
    [desc("ux", "UX Judge", ["design", "software"], ["*"], ["ux"], "UX quality"), new UxJudgePlugin()],
    [desc("image_quality", "Image Quality Judge", ["design", "media"], ["*"], ["image"], "Image quality"), new ImageQualityJudgePlugin()],
    [desc("video_quality", "Video Quality Judge", ["media"], ["*"], ["video"], "Video quality"), new VideoQualityJudgePlugin()],
    [desc("audio_quality", "Audio Quality Judge", ["media"], ["*"], ["audio"], "Audio quality"), new AudioQualityJudgePlugin()],
  ];

  for (const [d, j] of [...core, ...plugins]) {
    registry.register(d, j);
  }
  return registry;
}
