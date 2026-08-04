import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';

const relPrepEntrySchema = z.object({
  name: z.string(),
  date_finish: z.string(),
});

export type RelPrepEntry = z.infer<typeof relPrepEntrySchema>;

const releaseDeadlinesSchema = z.object({
  rel_prep: z.array(relPrepEntrySchema),
  itm_26: z.string().nullable(),
});

const deadlinesFileSchema = z.object({
  updated_at: z.string(),
  releases: z.record(z.string(), releaseDeadlinesSchema),
});

export type ReleaseDeadlines = z.infer<typeof releaseDeadlinesSchema>;
export type DeadlinesFile = z.infer<typeof deadlinesFileSchema>;

export const DEFAULT_DEADLINES_PATH = path.resolve(
  os.homedir(),
  '.config',
  'jira-sprinter',
  'deadlines.json'
);

export const SCHEDULE_TASK_REGEX =
  '.*(Package Advisory REL_PREP Deadline|ITM 26 DevTestDoc).*';

export function readDeadlines(
  filePath: string = DEFAULT_DEADLINES_PATH
): DeadlinesFile | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return deadlinesFileSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function classifyScheduleTasks(
  tasks: { name: string; date_finish: string }[]
): ReleaseDeadlines {
  const deadlines: ReleaseDeadlines = { rel_prep: [], itm_26: null };
  for (const task of tasks) {
    if (task.name.includes('REL_PREP')) {
      deadlines.rel_prep.push({
        name: task.name,
        date_finish: task.date_finish,
      });
    } else if (task.name.includes('ITM 26')) {
      deadlines.itm_26 = task.date_finish;
    }
  }
  return deadlines;
}

export function closestFutureDate(
  dates: string[],
  today: Date = new Date()
): string | null {
  const todayStr = formatDate(today);
  const future = dates.filter(d => d >= todayStr).sort();
  return future.length > 0 ? future[0] : null;
}

export function computePreliminaryTestingDueDate(
  deadlines: ReleaseDeadlines,
  isZStream: boolean,
  today: Date = new Date()
): string | null {
  const twoWeeks = new Date(today);
  twoWeeks.setDate(twoWeeks.getDate() + 14);
  const twoWeeksStr = formatDate(twoWeeks);

  if (isZStream) {
    const closest = closestFutureDate(
      deadlines.rel_prep.map(e => e.date_finish),
      today
    );
    if (!closest) return twoWeeksStr;
    return closest < twoWeeksStr ? closest : twoWeeksStr;
  }

  if (deadlines.itm_26) {
    const todayStr = formatDate(today);
    if (deadlines.itm_26 >= todayStr && deadlines.itm_26 < twoWeeksStr) {
      return deadlines.itm_26;
    }
  }

  return twoWeeksStr;
}

export function computeQeTaskDueDate(
  deadlines: ReleaseDeadlines,
  isZStream: boolean,
  today: Date = new Date()
): string | null {
  if (isZStream) {
    return closestFutureDate(
      deadlines.rel_prep.map(e => e.date_finish),
      today
    );
  }

  if (deadlines.itm_26 && deadlines.itm_26 >= formatDate(today)) {
    return deadlines.itm_26;
  }

  return null;
}

export function writeDeadlines(
  data: DeadlinesFile,
  filePath: string = DEFAULT_DEADLINES_PATH
): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
