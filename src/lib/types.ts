export type BlockSource = "kairos" | "gcal";

export interface ScheduledBlock {
  id: string;
  taskId: string | null;
  source: BlockSource;
  startUtc: string; // ISO-8601 UTC
  endUtc: string; // ISO-8601 UTC
  title: string; // task title, or "(busy)" for gcal blocks
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
