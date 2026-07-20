/**
 * Hierarchical task taxonomy — extensible tree.
 */

export interface TaxonomyNode {
  readonly id: string;
  readonly label: string;
  readonly children?: readonly TaxonomyNode[];
}

export const TASK_TAXONOMY: readonly TaxonomyNode[] = [
  {
    id: "marketing",
    label: "Marketing",
    children: [
      {
        id: "marketing.social",
        label: "Social Media",
        children: [
          { id: "marketing.social.carousel", label: "Carousel" },
          { id: "marketing.social.reel", label: "Reel" },
          { id: "marketing.social.story", label: "Story" },
          { id: "marketing.social.ad_copy", label: "Ad Copy" },
          { id: "marketing.social.campaign", label: "Campaign" },
        ],
      },
      { id: "marketing.blog", label: "Blog" },
      { id: "marketing.email", label: "Email Campaign" },
      { id: "marketing.seo", label: "SEO" },
    ],
  },
  {
    id: "branding",
    label: "Branding",
    children: [
      { id: "branding.strategy", label: "Brand Strategy" },
      { id: "branding.tone", label: "Tone" },
      { id: "branding.positioning", label: "Positioning" },
      { id: "branding.guidelines", label: "Guidelines" },
    ],
  },
  { id: "sales", label: "Sales" },
  { id: "legal", label: "Legal" },
  { id: "finance", label: "Finance" },
  { id: "hr", label: "HR" },
  {
    id: "software_engineering",
    label: "Software Engineering",
    children: [
      { id: "coding.backend", label: "Backend" },
      { id: "coding.frontend", label: "Frontend" },
      { id: "coding.mobile", label: "Mobile" },
      { id: "coding.ai", label: "AI" },
    ],
  },
  { id: "cyber_security", label: "Cyber Security" },
  { id: "research", label: "Research" },
  { id: "ui_ux", label: "UI/UX" },
  { id: "graphic_design", label: "Graphic Design" },
  {
    id: "video_production",
    label: "Video Production",
    children: [
      { id: "video.script", label: "Script" },
      { id: "video.storyboard", label: "Storyboard" },
      { id: "video.editing", label: "Editing" },
    ],
  },
  { id: "audio_production", label: "Audio Production" },
  { id: "education", label: "Education" },
  { id: "healthcare", label: "Healthcare" },
  { id: "customer_support", label: "Customer Support" },
  { id: "business_intelligence", label: "Business Intelligence" },
];

export function flattenTaxonomy(nodes: readonly TaxonomyNode[] = TASK_TAXONOMY): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (node.children) ids.push(...flattenTaxonomy(node.children));
  }
  return ids;
}
