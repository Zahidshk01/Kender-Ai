/**
 * Server-only helpers behind the subscription server functions.
 * Kept out of `*.functions.ts` so the server-fn module stays a thin wrapper.
 */
import { z } from "zod";

export const planSchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
});

export function periodEnd(plan: "monthly" | "yearly") {
  const end = new Date();
  if (plan === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

export type SubRow = {
  status?: string | null;
  plan?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
};

export function isStillActive(row: SubRow | null | undefined) {
  if (!row) return false;
  const inPeriod =
    !row.current_period_end ||
    new Date(row.current_period_end).getTime() > Date.now();
  return (row.status === "active" || row.status === "trialing") && inPeriod;
}
