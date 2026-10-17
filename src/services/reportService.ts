import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
  updateDoc,
  increment,
  addDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors.ts';
import type {
  Report,
  PublicReport,
  ReportCategory,
  ReportStatus,
  ReportEvent,
} from '../types/index.ts';
import { haversineDistanceMeters } from '../utils/haversine.ts';
import { roundToThreeDecimals } from '../utils/geoFuzz.ts';
import { calculateDueAt, SlaHoursMap } from '../utils/sla.ts';
import { isValidTransition, canCitizenReopen } from '../utils/stateMachine.ts';

export interface CreateReportInput {
  category: ReportCategory;
  description: string;
  lat: number;
  lng: number;
  wardId: string;
  beforePhotoUrl: string;
  customSla?: Partial<SlaHoursMap>;
}

export interface CreateReportResult {
  isDuplicate: boolean;
  reportId: string;
}

/**
 * Checks for a similar report within 30m, same category, not Closed, created in the last 7 days.
 */
export async function findSimilarActiveReport(
  category: ReportCategory,
  lat: number,
  lng: number,
  wardId: string
): Promise<{ id: string; reporterCount: number } | null> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const publicReportsRef = collection(db, 'publicReports');

    // Query active reports in the ward with matching category
    const q = query(
      publicReportsRef,
      where('wardId', '==', wardId),
      where('category', '==', category)
    );

    const snap = await getDocs(q);

    for (const d of snap.docs) {
      const data = d.data();
      if (data.status === 'Closed') continue;

      // Check creation timestamp
      const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      if (createdDate < sevenDaysAgo) continue;

      // Calculate haversine distance
      const distance = haversineDistanceMeters(lat, lng, data.approxLat, data.approxLng);
      // Since approxLat is rounded to 3 decimals (~110m grid), allow up to 45m for fuzzy match
      if (distance <= 45) {
        return {
          id: d.id,
          reporterCount: data.reporterCount || 1,
        };
      }
    }

    return null;
  } catch (error) {
    console.warn('Error checking proximity reports:', error);
    return null;
  }
}

/**
 * Creates a report or confirms an existing duplicate.
 * Uses Firestore's random auto-IDs and atomic batch writes to keep reports and publicReports in sync.
 */
export async function createOrConfirmReport(
  input: CreateReportInput
): Promise<CreateReportResult> {
  const { category, description, lat, lng, wardId, beforePhotoUrl, customSla } = input;

  // 1. Check for similar report
  const existing = await findSimilarActiveReport(category, lat, lng, wardId);

  if (existing) {
    try {
      const batch = writeBatch(db);

      // Increment reporterCount on reports doc
      const reportRef = doc(db, 'reports', existing.id);
      batch.update(reportRef, {
        reporterCount: increment(1),
      });

      // Increment reporterCount on publicReports doc
      const publicReportRef = doc(db, 'publicReports', existing.id);
      batch.update(publicReportRef, {
        reporterCount: increment(1),
      });

      // Add record to reporters subcollection
      const reportersRef = doc(collection(db, 'reports', existing.id, 'reporters'));
      batch.set(reportersRef, {
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      return {
        isDuplicate: true,
        reportId: existing.id,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${existing.id}`);
    }
  }

  // 2. Create new report
  try {
    const batch = writeBatch(db);

    // Random auto-ID for Firestore documents (never sequential numbers)
    const reportDocRef = doc(collection(db, 'reports'));
    const reportId = reportDocRef.id;
    const publicReportDocRef = doc(db, 'publicReports', reportId);

    const now = new Date();
    const dueAtDate = calculateDueAt(category, now, customSla);

    const approxLat = roundToThreeDecimals(lat);
    const approxLng = roundToThreeDecimals(lng);

    const initialEvent = {
      fromStatus: 'Submitted',
      toStatus: 'Submitted',
      note: 'Case submitted by citizen',
      actorRole: 'citizen',
      createdAt: serverTimestamp(),
    };

    // Private report document
    batch.set(reportDocRef, {
      category,
      description: description.slice(0, 300),
      lat,
      lng,
      wardId,
      status: 'Submitted',
      reporterCount: 1,
      reopenCount: 0,
      createdAt: serverTimestamp(),
      dueAt: Timestamp.fromDate(dueAtDate),
      resolvedAt: null,
      beforePhotoUrl,
      afterPhotoUrl: null,
    });

    // Public sanitized mirror document
    batch.set(publicReportDocRef, {
      category,
      status: 'Submitted',
      wardId,
      dueAt: Timestamp.fromDate(dueAtDate),
      resolvedAt: null,
      reopenCount: 0,
      reporterCount: 1,
      approxLat,
      approxLng,
      createdAt: serverTimestamp(),
      timelineSummary: [
        {
          status: 'Submitted',
          timestamp: new Date().toISOString(),
          note: 'Case submitted by citizen',
        },
      ],
    });

    // Subcollection event
    const eventDocRef = doc(collection(db, 'reports', reportId, 'events'));
    batch.set(eventDocRef, initialEvent);

    // Subcollection first reporter
    const reporterDocRef = doc(collection(db, 'reports', reportId, 'reporters'));
    batch.set(reporterDocRef, {
      createdAt: serverTimestamp(),
    });

    await batch.commit();

    return {
      isDuplicate: false,
      reportId,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'reports');
  }
}

/**
 * Updates status of a case along the strict allowed transition path.
 * Kept atomic across reports and publicReports.
 */
export async function updateReportStatus(
  reportId: string,
  currentStatus: ReportStatus,
  newStatus: ReportStatus,
  note: string,
  actorRole: string,
  afterPhotoUrl?: string | null
): Promise<void> {
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid status transition from "${currentStatus}" to "${newStatus}".`
    );
  }

  if (newStatus === 'Resolved' && (!afterPhotoUrl || afterPhotoUrl.trim() === '')) {
    throw new Error('Resolving a case requires an after-photo upload.');
  }

  try {
    const batch = writeBatch(db);
    const reportRef = doc(db, 'reports', reportId);
    const publicReportRef = doc(db, 'publicReports', reportId);

    const nowTimestamp = serverTimestamp();
    const resolvedTimestamp = newStatus === 'Resolved' ? nowTimestamp : null;

    // Fetch existing public timeline to append
    const publicSnap = await getDoc(publicReportRef);
    const existingTimeline = publicSnap.data()?.timelineSummary || [];

    const newTimelineItem = {
      status: newStatus,
      timestamp: new Date().toISOString(),
      note: note.slice(0, 300) || undefined,
    };

    const updatePayload: Record<string, any> = {
      status: newStatus,
    };

    const publicUpdatePayload: Record<string, any> = {
      status: newStatus,
      timelineSummary: [...existingTimeline, newTimelineItem],
    };

    if (newStatus === 'Resolved') {
      updatePayload.resolvedAt = resolvedTimestamp;
      updatePayload.afterPhotoUrl = afterPhotoUrl;
      publicUpdatePayload.resolvedAt = resolvedTimestamp;
    }

    batch.update(reportRef, updatePayload);
    batch.update(publicReportRef, publicUpdatePayload);

    // Write audit event
    const eventRef = doc(collection(db, 'reports', reportId, 'events'));
    batch.set(eventRef, {
      fromStatus: currentStatus,
      toStatus: newStatus,
      note: note.slice(0, 300),
      actorRole,
      createdAt: nowTimestamp,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}

/**
 * Reopens a resolved report if within 7 days of resolvedAt.
 */
export async function reopenReportByCitizen(
  reportId: string,
  reason: string
): Promise<void> {
  try {
    const publicReportRef = doc(db, 'publicReports', reportId);
    const publicSnap = await getDoc(publicReportRef);

    if (!publicSnap.exists()) {
      throw new Error('Report not found.');
    }

    const data = publicSnap.data();
    const resolvedAtDate = data.resolvedAt?.toDate
      ? data.resolvedAt.toDate()
      : data.resolvedAt;

    const check = canCitizenReopen(data.status, resolvedAtDate);
    if (!check.allowed) {
      throw new Error(check.reason || 'Cannot reopen report.');
    }

    const batch = writeBatch(db);
    const reportRef = doc(db, 'reports', reportId);

    const existingTimeline = data.timelineSummary || [];
    const newTimelineItem = {
      status: 'Reopened',
      timestamp: new Date().toISOString(),
      note: reason.slice(0, 300) || 'Citizen reopened: issue not resolved',
    };

    batch.update(reportRef, {
      status: 'Reopened',
      reopenCount: increment(1),
    });

    batch.update(publicReportRef, {
      status: 'Reopened',
      reopenCount: increment(1),
      timelineSummary: [...existingTimeline, newTimelineItem],
    });

    const eventRef = doc(collection(db, 'reports', reportId, 'events'));
    batch.set(eventRef, {
      fromStatus: 'Resolved',
      toStatus: 'Reopened',
      note: reason.slice(0, 300),
      actorRole: 'citizen',
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `publicReports/${reportId}`);
  }
}

/**
 * Fetches public report by ID.
 */
export async function getPublicReport(reportId: string): Promise<PublicReport | null> {
  try {
    const publicRef = doc(db, 'publicReports', reportId);
    const snap = await getDoc(publicRef);
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<PublicReport, 'id'>),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `publicReports/${reportId}`);
  }
}

/**
 * Fetches private full report (officer/admin only).
 */
export async function getPrivateReport(reportId: string): Promise<Report | null> {
  try {
    const reportRef = doc(db, 'reports', reportId);
    const snap = await getDoc(reportRef);
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<Report, 'id'>),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `reports/${reportId}`);
  }
}

/**
 * Fetches timeline events for a report.
 */
export async function getReportEvents(reportId: string): Promise<ReportEvent[]> {
  try {
    const eventsRef = collection(db, 'reports', reportId, 'events');
    const snap = await getDocs(eventsRef);
    return snap.docs
      .map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ReportEvent, 'id'>),
      }))
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
        return timeA - timeB;
      });
  } catch (error) {
    // If not officer/admin, return empty array gracefully
    return [];
  }
}
