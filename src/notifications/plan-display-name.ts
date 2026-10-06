export function planDisplayName(plan: unknown): string {
  const p = plan as
    | { razorpayPlanItem?: { item?: { name?: string } }; planCode?: string }
    | null
    | undefined;
  return p?.razorpayPlanItem?.item?.name || p?.planCode || "Your plan";
}
