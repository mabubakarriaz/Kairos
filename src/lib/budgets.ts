// Budget math — pure, safe in both server and client modules.
//
// A label budget is an amount of work-hours per base period (day/week/month/
// quarter). The budget view shows one calendar range at a time (a specific day,
// week, month, or quarter) and asks: how much was scheduled against this label,
// versus how much the budget allows for *this* range?
//
// Re-basing rule:
//   • If the viewed range's unit matches the budget's base period, the budgeted
//     amount IS the budget. "40h per week", viewed by week → 40h. No fuzz from
//     a 28- vs 31-day month creeping into the natural reading.
//   • Otherwise pro-rate by days: convert the budget to a per-day rate using the
//     period's nominal length, then multiply by the actual number of days in the
//     range. "40h per week", viewed by a 30-day month → 40/7 × 30 ≈ 171h.
//
// Nothing here caps usage. Over budget is a fact to surface, not an error.

import type { BudgetPeriod } from "@/lib/types";

export const BUDGET_PERIODS: BudgetPeriod[] = ["day", "week", "month", "quarter"];

/** Short label for a period, used on the range chips and budget figures. */
export const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
};

/** "/wk" style suffix shown after a budget amount in the label list. */
export const PERIOD_SUFFIX: Record<BudgetPeriod, string> = {
  day: "/day",
  week: "/wk",
  month: "/mo",
  quarter: "/qtr",
};

/**
 * Nominal length of each base period in days, used only for cross-unit
 * pro-rating (e.g. a weekly budget viewed by month). Month and quarter use the
 * average Gregorian lengths (365.25 / 12 and / 4) so a year of months sums back
 * to the year. When the range unit equals the period these never come into play.
 */
export const NOMINAL_DAYS: Record<BudgetPeriod, number> = {
  day: 1,
  week: 7,
  month: 30.4375,
  quarter: 91.3125,
};

export function isBudgetPeriod(value: string): value is BudgetPeriod {
  return (BUDGET_PERIODS as string[]).includes(value);
}

/** Budgeted hours for the selected range. See the re-basing rule above. */
export function budgetedHoursForRange(
  budgetHours: number,
  period: BudgetPeriod,
  rangeUnit: BudgetPeriod,
  rangeDays: number,
): number {
  if (rangeUnit === period) return budgetHours;
  return (budgetHours / NOMINAL_DAYS[period]) * rangeDays;
}

/**
 * A single label's standing against its budget for the viewed range. All
 * amounts are in minutes so the existing `fmtDuration` renders them; ratios are
 * unitless. `pct` can exceed 1 (over budget); the meter clamps the visual.
 */
export interface BudgetMeter {
  slug: string;
  /** Budgeted minutes for the selected range. */
  budgetMin: number;
  /** Minutes actually scheduled against this label in the range. */
  usedMin: number;
  /** used / budget, unclamped. >1 means over. 0 when there's no budget. */
  ratio: number;
  /** max(0, budget − used) — what's left. */
  remainingMin: number;
  /** max(0, used − budget) — the overrun. */
  overMin: number;
  over: boolean;
}

export function buildMeter(args: {
  slug: string;
  budgetHours: number;
  period: BudgetPeriod;
  rangeUnit: BudgetPeriod;
  rangeDays: number;
  usedMinutes: number;
}): BudgetMeter {
  const budgetMin = budgetedHoursForRange(args.budgetHours, args.period, args.rangeUnit, args.rangeDays) * 60;
  const usedMin = Math.max(0, args.usedMinutes);
  const ratio = budgetMin > 0 ? usedMin / budgetMin : 0;
  return {
    slug: args.slug,
    budgetMin,
    usedMin,
    ratio,
    remainingMin: Math.max(0, budgetMin - usedMin),
    overMin: Math.max(0, usedMin - budgetMin),
    over: usedMin > budgetMin,
  };
}

/**
 * Meter bar geometry. The bar's full width represents max(budget, used), so an
 * over-budget label shows the budget as a tick partway along, with the overrun
 * spilling past it as the ember tail. Under budget, the bar = the budget and the
 * fill is the used fraction.
 */
export interface MeterGeometry {
  /** Amber fill width as a 0–100 percentage (the budgeted, consumed portion). */
  fillPct: number;
  /** Ember overrun width as a 0–100 percentage (0 when under budget). */
  overPct: number;
  /** Where the budget tick sits, 0–100. Only meaningful when `over`. */
  tickPct: number;
  over: boolean;
}

export function meterGeometry(m: BudgetMeter): MeterGeometry {
  if (m.budgetMin <= 0) {
    return { fillPct: 0, overPct: 0, tickPct: 100, over: false };
  }
  if (m.usedMin <= m.budgetMin) {
    return { fillPct: (m.usedMin / m.budgetMin) * 100, overPct: 0, tickPct: 100, over: false };
  }
  const tickPct = (m.budgetMin / m.usedMin) * 100;
  return { fillPct: tickPct, overPct: 100 - tickPct, tickPct, over: true };
}
