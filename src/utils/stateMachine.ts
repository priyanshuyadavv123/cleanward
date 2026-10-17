export type ReportStatus =
  | 'Submitted'
  | 'Acknowledged'
  | 'In progress'
  | 'Resolved'
  | 'Closed'
  | 'Reopened';

export const ALLOWED_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  Submitted: ['Acknowledged'],
  Acknowledged: ['In progress'],
  'In progress': ['Resolved'],
  Resolved: ['Closed'],
  Closed: [],
  Reopened: ['In progress'],
};

/**
 * Validates whether transitioning from fromStatus to toStatus is allowed by the strict workflow.
 */
export function isValidTransition(
  fromStatus: ReportStatus,
  toStatus: ReportStatus
): boolean {
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

/**
 * Returns the list of next allowed statuses for an officer.
 */
export function getNextAllowedStatuses(currentStatus: ReportStatus): ReportStatus[] {
  return ALLOWED_TRANSITIONS[currentStatus] || [];
}

/**
 * Checks if a citizen can reopen a resolved report within 7 days of resolvedAt.
 */
export function canCitizenReopen(
  status: ReportStatus,
  resolvedAt: string | number | Date | null | undefined,
  now: Date = new Date()
): { allowed: boolean; reason?: string } {
  if (status !== 'Resolved') {
    return { allowed: false, reason: 'Only resolved reports can be reopened.' };
  }
  if (!resolvedAt) {
    return { allowed: false, reason: 'Resolution timestamp is missing.' };
  }

  const resolvedTime = new Date(resolvedAt).getTime();
  if (isNaN(resolvedTime)) {
    return { allowed: false, reason: 'Invalid resolution timestamp.' };
  }

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const isWithinWindow = now.getTime() - resolvedTime <= sevenDaysMs;

  if (!isWithinWindow) {
    return {
      allowed: false,
      reason: 'Reopen window has expired (must be within 7 days of resolution).',
    };
  }

  return { allowed: true };
}
