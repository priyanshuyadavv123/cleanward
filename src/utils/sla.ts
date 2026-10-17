export type ReportCategory =
  | 'Garbage dump'
  | 'Overflowing dustbin'
  | 'Blocked drain'
  | 'Dead animal'
  | 'Other';

export interface SlaHoursMap {
  'Garbage dump': number;
  'Overflowing dustbin': number;
  'Blocked drain': number;
  'Dead animal': number;
  'Other': number;
}

export const DEFAULT_SLA_HOURS: SlaHoursMap = {
  'Overflowing dustbin': 12,
  'Garbage dump': 12,
  'Blocked drain': 24,
  'Dead animal': 48,
  'Other': 72,
};

/**
 * Calculates the due timestamp based on report category and SLA config.
 */
export function calculateDueAt(
  category: ReportCategory,
  createdAt: Date = new Date(),
  customSla?: Partial<SlaHoursMap>
): Date {
  const hours = customSla?.[category] ?? DEFAULT_SLA_HOURS[category] ?? 72;
  const due = new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
  return due;
}

/**
 * Overdue means status is not Resolved or Closed and dueAt is in the past.
 */
export function isReportOverdue(
  status: string,
  dueAt: string | number | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (status === 'Resolved' || status === 'Closed') {
    return false;
  }
  if (!dueAt) return false;
  const dueTime = new Date(dueAt).getTime();
  if (isNaN(dueTime)) return false;
  return dueTime < now.getTime();
}

/**
 * Calculates median resolution time in hours for reports resolved within the last 30 days.
 */
export function calculateMedianResolutionHours(
  reports: { createdAt: string | number | Date; resolvedAt?: string | number | Date | null }[],
  now: Date = new Date()
): number | null {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();

  const resolutionTimesHours: number[] = [];

  for (const r of reports) {
    if (!r.resolvedAt) continue;
    const resolvedMs = new Date(r.resolvedAt).getTime();
    if (isNaN(resolvedMs)) continue;

    // Must be resolved within the last 30 days
    if (nowMs - resolvedMs <= thirtyDaysMs) {
      const createdMs = new Date(r.createdAt).getTime();
      if (!isNaN(createdMs) && resolvedMs >= createdMs) {
        const diffHours = (resolvedMs - createdMs) / (1000 * 60 * 60);
        resolutionTimesHours.push(diffHours);
      }
    }
  }

  if (resolutionTimesHours.length === 0) return null;

  resolutionTimesHours.sort((a, b) => a - b);
  const mid = Math.floor(resolutionTimesHours.length / 2);

  if (resolutionTimesHours.length % 2 === 0) {
    return Math.round(((resolutionTimesHours[mid - 1] + resolutionTimesHours[mid]) / 2) * 10) / 10;
  } else {
    return Math.round(resolutionTimesHours[mid] * 10) / 10;
  }
}
