export type ReportCategory =
  | 'Garbage dump'
  | 'Overflowing dustbin'
  | 'Blocked drain'
  | 'Dead animal'
  | 'Other';

export type ReportStatus =
  | 'Submitted'
  | 'Acknowledged'
  | 'In progress'
  | 'Resolved'
  | 'Closed'
  | 'Reopened';

export interface WardBoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface Ward {
  id: string;
  name: string;
  bbox: WardBoundingBox;
  isSample: boolean;
  createdAt?: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'officer' | 'admin';
  wardId?: string;
  updatedAt?: any;
}

export interface Report {
  id: string;
  category: ReportCategory;
  description: string;
  lat: number;
  lng: number;
  wardId: string;
  status: ReportStatus;
  reporterCount: number;
  reopenCount: number;
  createdAt: any;
  dueAt: any;
  resolvedAt?: any | null;
  beforePhotoUrl: string;
  afterPhotoUrl?: string | null;
}

export interface ReportEvent {
  id?: string;
  fromStatus: ReportStatus | string;
  toStatus: ReportStatus | string;
  note?: string;
  actorRole: string;
  createdAt: any;
}

export interface PublicReport {
  id: string;
  category: ReportCategory;
  status: ReportStatus;
  wardId: string;
  dueAt: any;
  resolvedAt?: any | null;
  reopenCount: number;
  reporterCount: number;
  approxLat: number;
  approxLng: number;
  createdAt: any;
  timelineSummary: {
    status: ReportStatus | string;
    timestamp: any;
    note?: string;
  }[];
}

export interface SlaConfig {
  overflowingDustbinHours: number;
  garbageDumpHours: number;
  blockedDrainHours: number;
  deadAnimalHours: number;
  otherHours: number;
}
