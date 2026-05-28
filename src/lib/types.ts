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
