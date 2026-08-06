/**
 * Help Centre CMS service (M10.12).
 */

import HelpArticles, { type IHelpArticle } from "../models/helpArticle.model";
import { ApiError } from "../utils/apiError";

export type HelpArticleDto = {
  id: string;
  category: string;
  title: string;
  slug: string;
  body: string;
  tags: string[];
  updatedAt: string;
};

function toDto(doc: IHelpArticle): HelpArticleDto {
  return {
    id: doc._id.toString(),
    category: doc.category,
    title: doc.title,
    slug: doc.slug,
    body: doc.body,
    tags: doc.tags ?? [],
    updatedAt: doc.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

export class HelpService {
  async listCategories(): Promise<string[]> {
    const cats = await HelpArticles.distinct("category", { published: true });
    return cats.map(String).sort();
  }

  async list(input: {
    category?: string;
    q?: string;
    limit?: number;
  }): Promise<HelpArticleDto[]> {
    const filter: Record<string, unknown> = { published: true };
    if (input.category) filter.category = input.category;
    if (input.q?.trim()) {
      filter.$text = { $search: input.q.trim() };
    }
    const docs = await HelpArticles.find(filter)
      .sort({ sortOrder: 1, updatedAt: -1 })
      .limit(Math.min(input.limit ?? 50, 100));
    return docs.map(toDto);
  }

  async getBySlug(slug: string): Promise<HelpArticleDto> {
    const doc = await HelpArticles.findOne({ slug, published: true });
    if (!doc) throw new ApiError("Article not found", 404);
    return toDto(doc);
  }

  /** Seed minimal published articles when collection empty (idempotent). */
  async ensureSeed(): Promise<void> {
    const count = await HelpArticles.countDocuments();
    if (count > 0) return;
    await HelpArticles.insertMany([
      {
        category: "Getting Started",
        title: "Create your first workspace",
        slug: "create-workspace",
        body: "Open Create Workspace, enter your business details, and save. Your organisation becomes the tenant for projects, assets, and brands.",
        tags: ["workspace", "onboarding"],
        published: true,
        sortOrder: 1,
      },
      {
        category: "Getting Started",
        title: "Run an AI generation",
        slug: "ai-generation",
        body: "Choose a service, describe your prompt, and submit. Generating uses Enterprise Intelligence executions. Results appear in AI Mode or Asset Ready.",
        tags: ["ai", "executions"],
        published: true,
        sortOrder: 2,
      },
      {
        category: "Billing",
        title: "Subscription plans",
        slug: "subscription-plans",
        body: "Open Subscription & Billing to see plans from the server. Checkout creates a Razorpay subscription; live payment confirmation is an external integration.",
        tags: ["billing"],
        published: true,
        sortOrder: 3,
      },
      {
        category: "FAQ",
        title: "Where are my files?",
        slug: "where-are-files",
        body: "Organisation files live in Vault. Brand-scoped files appear under Brand Vault when a brand is selected.",
        tags: ["vault", "assets"],
        published: true,
        sortOrder: 4,
      },
    ]);
  }
}

export const helpService = new HelpService();
