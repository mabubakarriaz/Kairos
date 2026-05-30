export type BlockSource = "kairos" | "gcal";

export type RecurrenceKind = "daily" | "weekdays" | "weekly" | "interval";

export interface RecurrenceSpec {
  kind: RecurrenceKind;
  /** Only used when kind === "interval". The N in "every N days", >= 2. */
  intervalDays?: number;
}

export interface ScheduledBlock {
  id: string;
  taskId: string | null;
  source: BlockSource;
  startUtc: string; // ISO-8601 UTC
  endUtc: string; // ISO-8601 UTC
  title: string; // task title, or "(busy)" for gcal blocks
  tags: string[]; // task labels (normalized); empty for gcal
  /** Non-null when this block is one occurrence of a recurring series. */
  seriesId: string | null;
  /** The recurrence kind on this occurrence's task row, if part of a series. */
  recurrenceKind: RecurrenceKind | null;
}

export interface FreeSlot {
  startUtc: string;
  endUtc: string;
  minutes: number;
}

/** The base period a label budget is expressed in. The budget view re-bases it
 *  to whatever range is on screen (see src/lib/budgets.ts). */
export type BudgetPeriod = "day" | "week" | "month" | "quarter";

/**
 * A registered label. `tags` on a task stay free-text; this is the optional
 * managed overlay. A label is "tracked" when it carries a budget — both
 * `budgetHours` and `budgetPeriod` are non-null together, or both null.
 */
export interface Label {
  slug: string;
  budgetHours: number | null;
  budgetPeriod: BudgetPeriod | null;
}

export interface DaySchedule {
  date: string; // yyyy-mm-dd
  dayStartUtc: string;
  dayEndUtc: string;
  blocks: ScheduledBlock[];
  freeSlots: FreeSlot[];
}

/**
 * A day-divider. Scalar: just a wall-clock time + a label. Renders as a thin
 * horizontal line across the day grid. The model is effective-dated daily:
 * the same checkpoint may carry different times on different dates (see
 * `src/server/checkpoints.ts`). What the day view receives is already resolved
 * to the active rule for that date.
 */
export interface Checkpoint {
  id: string;
  label: string;
  /** Wall-clock time-of-day, "HH:MM" (24h). */
  at: string;
}
