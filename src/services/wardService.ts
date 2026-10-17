import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors.ts';
import type { Ward, SlaConfig } from '../types/index.ts';
import { DEFAULT_SLA_HOURS } from '../utils/sla.ts';

export const SAMPLE_WARDS: Omit<Ward, 'id'>[] = [
  {
    name: 'Ward 3 - Sadar Bazaar',
    bbox: {
      minLat: 28.648,
      maxLat: 28.665,
      minLng: 77.205,
      maxLng: 77.225,
    },
    isSample: true,
  },
  {
    name: 'Ward 7 - Civil Lines',
    bbox: {
      minLat: 28.67,
      maxLat: 28.69,
      minLng: 77.215,
      maxLng: 77.235,
    },
    isSample: true,
  },
  {
    name: 'Ward 12 - Gandhi Nagar',
    bbox: {
      minLat: 28.655,
      maxLat: 28.675,
      minLng: 77.26,
      maxLng: 77.285,
    },
    isSample: true,
  },
  {
    name: 'Ward 18 - Railway Colony',
    bbox: {
      minLat: 28.635,
      maxLat: 28.655,
      minLng: 77.21,
      maxLng: 77.23,
    },
    isSample: true,
  },
];

/**
 * Initializes default SLA and sample wards if they don't already exist.
 */
export async function initializeDefaultConfigAndWards(): Promise<void> {
  try {
    // 1. Initialize config/sla
    const slaDocRef = doc(db, 'config', 'sla');
    const slaSnap = await getDoc(slaDocRef);
    if (!slaSnap.exists()) {
      await setDoc(slaDocRef, {
        overflowingDustbinHours: DEFAULT_SLA_HOURS['Overflowing dustbin'],
        garbageDumpHours: DEFAULT_SLA_HOURS['Garbage dump'],
        blockedDrainHours: DEFAULT_SLA_HOURS['Blocked drain'],
        deadAnimalHours: DEFAULT_SLA_HOURS['Dead animal'],
        otherHours: DEFAULT_SLA_HOURS['Other'],
      });
    }

    // 2. Initialize sample wards if none exist
    const wardsRef = collection(db, 'wards');
    const wardsSnap = await getDocs(wardsRef);
    if (wardsSnap.empty) {
      for (const sample of SAMPLE_WARDS) {
        await addDoc(wardsRef, {
          ...sample,
          createdAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    // We log and ignore if read-only user, but let handleFirestoreError log properly
    console.warn('Config/Ward initialization notice:', error);
  }
}

/**
 * Fetches all wards from Firestore.
 */
export async function getWards(): Promise<Ward[]> {
  try {
    const wardsRef = collection(db, 'wards');
    const snap = await getDocs(wardsRef);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Ward, 'id'>),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'wards');
  }
}

/**
 * Determines which ward a given lat/lng coordinate falls into.
 * If outside all bounding boxes, returns the closest ward based on centroid.
 */
export function findWardForLocation(lat: number, lng: number, wards: Ward[]): Ward | null {
  if (wards.length === 0) return null;

  // 1. Check exact bounding box containment
  for (const ward of wards) {
    const { minLat, maxLat, minLng, maxLng } = ward.bbox;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return ward;
    }
  }

  // 2. Fallback: closest ward by centroid distance
  let closestWard = wards[0];
  let minDistanceSq = Number.MAX_VALUE;

  for (const ward of wards) {
    const centerLat = (ward.bbox.minLat + ward.bbox.maxLat) / 2;
    const centerLng = (ward.bbox.minLng + ward.bbox.maxLng) / 2;
    const distSq = Math.pow(lat - centerLat, 2) + Math.pow(lng - centerLng, 2);
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closestWard = ward;
    }
  }

  return closestWard;
}

/**
 * Fetches SLA configuration.
 */
export async function getSlaConfig(): Promise<SlaConfig> {
  try {
    const slaDocRef = doc(db, 'config', 'sla');
    const snap = await getDoc(slaDocRef);
    if (snap.exists()) {
      return snap.data() as SlaConfig;
    }
    return {
      overflowingDustbinHours: DEFAULT_SLA_HOURS['Overflowing dustbin'],
      garbageDumpHours: DEFAULT_SLA_HOURS['Garbage dump'],
      blockedDrainHours: DEFAULT_SLA_HOURS['Blocked drain'],
      deadAnimalHours: DEFAULT_SLA_HOURS['Dead animal'],
      otherHours: DEFAULT_SLA_HOURS['Other'],
    };
  } catch (error) {
    console.warn('Falling back to default SLA hours:', error);
    return {
      overflowingDustbinHours: DEFAULT_SLA_HOURS['Overflowing dustbin'],
      garbageDumpHours: DEFAULT_SLA_HOURS['Garbage dump'],
      blockedDrainHours: DEFAULT_SLA_HOURS['Blocked drain'],
      deadAnimalHours: DEFAULT_SLA_HOURS['Dead animal'],
      otherHours: DEFAULT_SLA_HOURS['Other'],
    };
  }
}
