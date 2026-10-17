# CleanWard: Municipal Sanitation & Civic Issue Reporting Platform

CleanWard is a mobile-first Progressive Web App (PWA) tailored for Indian municipal towns to report, track, and resolve neighborhood sanitation issues—such as overflowing dustbins, garbage dumps, blocked drains, and stray carcasses. Designed to complement the national Swachhata initiative, it empowers citizens with zero-login geotagged reporting and 30-meter proximity deduplication while providing municipal ward officers and administrators with a strict SLA-driven workflow and public accountability scoreboards.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and workflow decisions have been confirmed and will guide the build:

- **Confirmed Decision (Photo Storage Pipeline)**: Uploads will target Firebase Storage buckets for high-resolution before/after records, storing clean download URLs on the Firestore document. If Firebase Storage is unavailable in the environment, the client immediately falls back to base64-encoded compressed JPEGs (clamped to ≤400 KB) in the document.
- **Confirmed Decision (Seed Data)**: On initial application boot, the system will auto-seed 4 authentic sample Indian town wards (e.g., Ward 3 - Sadar Bazaar, Ward 7 - Civil Lines, Ward 12 - Gandhi Nagar, Ward 18 - Railway Colony) and the default SLA hour table so testing and verification are immediate without blank-screen friction.
- **Admin & Officer Onboarding**: The user running the development environment (`dps.priyanshu6@gmail.com`) is bootstrapped as the initial Admin. When officers sign in via Google Auth, the Admin assigns them to specific wards and roles from the Admin panel.
- **Deduplication Threshold**: 30-meter Haversine distance, matching category, created within 7 days, and non-Closed status. Duplicate submissions increment `reporterCount` and register in the `reporters` subcollection without spawning duplicate municipal tickets.
- **Zero EXIF / Privacy Preservation**: Camera/gallery images are re-rendered onto an offscreen canvas and re-encoded at max 1600px JPEG to completely strip EXIF, sensor, and hardware metadata before transit.

---

## 1. Overview & Core Concept

CleanWard connects two distinct groups:
1. **Citizens**: Anyone in the municipal area who encounters sanitation hazards can report them instantly from a mobile browser without creating an account or providing phone numbers. They receive a clean `/track/{id}` URL to follow municipal progress and can challenge premature closures within 7 days of resolution.
2. **Municipal Sanitation Officers & Administrators**: Ward officers log in with Google to view their assigned ward queue, inspect before-photos and exact GPS pins, acknowledge complaints, and submit photo-verified resolutions. Municipal commissioners and admins manage ward geographical bounding boxes, officer assignments, and category SLAs, while citizens inspect an open scoreboard of ward response times.

---

## 2. User Experience & Visual Design

### Key User Flows

```
[ Citizen Flow ]
Photo Capture ──> Canvas EXIF Stripper ──> Geolocation + Leaflet Pin ──> 30m Deduplication Check
                                                                                  │
                             ┌────────────────────────────────────────────────────┴────────────────────────────────┐
                             ▼ (Existing Case Found)                                                               ▼ (New Case)
                   Add to reporters subcollection                                                        Batch Create:
                   Increment reporterCount                                                                • reports/{id} (private)
                   Display "Similar report exists" confirmation                                           • publicReports/{id} (sanitized)
                                                                                                                   │
                                                                                                          Tracking URL: /track/{id}

[ Officer Flow ]
Google Sign-In ──> Ward Verification ──> Ward Case Queue (Overdue / Status Filter) ──> Case Detail & Exact Pin
                                                                                                 │
                                      Submitted ──> Acknowledged ──> In Progress ──> Resolved ──> Closed
                                                                                       (Requires After Photo)
```

1. **Report Flow (`/report` or `/`)**:
   - Hero action banner with immediate photo capture trigger.
   - Interactive canvas re-draw preview (stripped of EXIF metadata, compressed to ≤1600px).
   - Draggable Leaflet marker showing current GPS position; dynamic badge warning if GPS accuracy exceeds 50m.
   - Category selector (Garbage dump, Overflowing dustbin, Blocked drain, Dead animal, Other).
   - 300-character description field with live character counter. No PII asked.
   - Submit executes a 30m geospatial deduplication query against active cases within 7 days. If matched: increments `reporterCount` and confirms. If unique: batch-writes private and public report records and redirects to the confirmation tracking screen.
2. **Citizen Track Flow (`/track/:id`)**:
   - Shows case category, humanized relative status, SLA countdown or due timestamp, and public timeline summary.
   - Leaflet map displaying the report location rounded to 3 decimal places (approx. 110m grid) for privacy. No photos or citizen information are displayed.
   - When status reaches `Resolved`: renders the interactive "Was this fixed?" verification widget with Yes and No. Selecting No prompts for an explanation and reopens the case (allowed only within 7 days of `resolvedAt`).
3. **Officer Dashboard Flow (`/officer`)**:
   - Google Sign-In with ward badge indicator.
   - Case triage list segmented into All, Overdue (past SLA dueAt and non-terminal), and status tabs.
   - Detailed inspection drawer: before-photo viewer, full-precision Leaflet map with exact coordinates, reporter count indicator, and audit history.
   - Status transition form strictly enforcing valid transitions (`Submitted` → `Acknowledged` → `In progress` → `Resolved` [camera after-photo upload required] → `Closed`).
4. **Public Scoreboard Flow (`/scoreboard`)**:
   - High-level civic transparency dashboard aggregated by ward.
   - Cards/tables showing Open Cases, Overdue Cases, Median Resolution Time in the past 30 days, and Total Lifetime Reports.
   - Clean tabular formatting with `tabular-nums` without exposing coordinates, photos, or reporter identities.
5. **Admin Console Flow (`/admin`)**:
   - Ward creator with bounding box boundaries (`minLat`, `maxLat`, `minLng`, `maxLng`) and visual map rectangle preview.
   - Officer management: associate signed-in Google email addresses with specific ward IDs and roles.
   - SLA Configuration editor: configure resolution target hours per category (12h, 24h, 48h, 72h).
   - Global municipal audit trail viewer.

### Visual Identity & Theme
- **Aesthetic Direction**: Civic, functional, tactile, and daylight-readable. Built to perform cleanly under bright outdoor sunlight in Indian municipalities.
- **Color Palette**:
  - Neutral Canvas: Crisp white (`#ffffff`) and slate canvas (`#f8fafc`).
  - Structural Surfaces: Cool slate borders (`#e2e8f0`) with subtle card fills (`#f1f5f9`).
  - Civic Accents: Deep Municipal Green (`#15803d` / `#166534`) conveying cleanliness and sanitation, Indian Ochre/Amber (`#d97706`) for overdue SLA warnings, and Navy (`#1e293b`) for administrative controls.
- **Typography & Hierarchy**: `Plus Jakarta Sans` for clean, legibility-first titles and body text; `font-mono tabular-nums` for coordinates, case IDs, and SLA countdowns.
- **Mobile Thumb Zone**: Bottom navigation bar with 4 primary touch destinations (Report, Track, Scoreboard, Officer/Admin) with min 48px touch targets and haptic visual feedback.

---

## 3. Key Product Decisions & Trade-Offs

- **Private vs. Public Collection Mirroring**:
  - *Chosen Approach*: Atomic Firestore batch writes create both `reports/{id}` (full data, exact GPS, photos, officer notes) and `publicReports/{id}` (rounded 3-decimal lat/lng, no photos, public timeline summary).
  - *Why*: Provides zero-trust security where public users can read complaint statuses and maps without any leak of citizens' exact coordinates or private photos, completely enforced at the Firestore rule layer.
- **Geospatial Deduplication Strategy**:
  - *Chosen Approach*: Client executes a bounding box pre-filter query on active reports in the ward/region created in the last 7 days, then calculates exact Haversine distance in meters (`≤ 30m`).
  - *Why*: Avoids costly and complex external geospatial extensions while remaining completely accurate within standard town ward densities.
- **Offline PWA Shell**:
  - *Chosen Approach*: `vite-plugin-pwa` precaching the application shell (HTML, CSS, JS, Leaflet assets, brand icons) with an interactive in-app install banner and iOS Safari guide.
  - *Why*: Allows field workers and citizens on spotty 2G/3G connections to launch the app instantly without network stalls.

---

## 4. Technical Architecture & Data Strategy

### System Layout & Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CleanWard PWA Shell                             │
│       (Vite + React 19 + Tailwind CSS + vite-plugin-pwa + Leaflet JS)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌──────────────┐              ┌─────────────────┐             ┌───────────────┐
│ Public Views │              │ Authenticated   │             │ Core Engine   │
│ • ReportForm │              │ • OfficerDash   │             │ • Geo & SLA   │
│ • CaseTrack  │              │ • AdminConsole  │             │ • Canvas EXIF │
│ • Scoreboard │              │ • RoleGuard     │             │ • Haversine   │
└───────┬──────┘              └────────┬────────┘             └───────┬───────┘
        │                              │                              │
        └──────────────────────────────┼──────────────────────────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     ▼                                   ▼
          ┌─────────────────────┐             ┌─────────────────────┐
          │   Firebase Auth     │             │  Cloud Firestore    │
          │ (Google Popup Auth) │             │ (Atomic Batch Sync) │
          └─────────────────────┘             └──────────┬──────────┘
                                                         │
             ┌───────────────────────┬───────────────────┴───────────────────┬──────────────────────┐
             ▼                       ▼                                       ▼                      ▼
      config/sla              wards/{wardId}                         reports/{reportId}      publicReports/{reportId}
   (Resolution SLAs)       (Bounding Box Wards)                     (Private Full Data)     (Public Sanitized Mirror)
                                                                             │
                                                                   ┌─────────┴─────────┐
                                                                   ▼                   ▼
                                                            events/{eventId}   reporters/{autoId}
```

### Data Schema Reference

#### 1. `config/sla`
```typescript
interface SlaConfig {
  garbageDumpHours: number;       // default: 12
  overflowingDustbinHours: number;// default: 12
  blockedDrainHours: number;      // default: 24
  deadAnimalHours: number;        // default: 48
  otherHours: number;             // default: 72
}
```

#### 2. `wards/{wardId}`
```typescript
interface Ward {
  id: string;
  name: string;
  bbox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  isSample: boolean;
  createdAt: any;
}
```

#### 3. `users/{uid}`
```typescript
interface UserProfile {
  email: string;
  role: 'officer' | 'admin';
  wardId: string;
  updatedAt: any;
}
```

#### 4. `reports/{reportId}` (Private)
```typescript
type ReportCategory = 'Garbage dump' | 'Overflowing dustbin' | 'Blocked drain' | 'Dead animal' | 'Other';
type ReportStatus = 'Submitted' | 'Acknowledged' | 'In progress' | 'Resolved' | 'Closed' | 'Reopened';

interface Report {
  id: string;
  category: ReportCategory;
  description: string;           // max 300 chars
  lat: number;                   // 6.0 to 38.0
  lng: number;                   // 68.0 to 98.0
  wardId: string;
  status: ReportStatus;
  reporterCount: number;         // initial: 1
  reopenCount: number;           // initial: 0
  createdAt: any;
  dueAt: any;                    // createdAt + category SLA hours
  resolvedAt: any | null;
  beforePhotoUrl: string;
  afterPhotoUrl: string | null;
}
```

#### 5. `publicReports/{reportId}` (Public Mirror)
```typescript
interface PublicReport {
  id: string;
  category: ReportCategory;
  status: ReportStatus;
  wardId: string;
  dueAt: any;
  resolvedAt: any | null;
  reopenCount: number;
  reporterCount: number;
  approxLat: number;             // Math.round(lat * 1000) / 1000
  approxLng: number;             // Math.round(lng * 1000) / 1000
  createdAt: any;
  timelineSummary: {
    status: ReportStatus;
    timestamp: any;
    note?: string;
  }[];
}
```

### Security Rules Validation Strategy (`firestore.rules`)
- **Strict Boundary Checks**: Enforces `lat >= 6.0 && lat <= 38.0` and `lng >= 68.0 && lng <= 98.0` (Indian territory coordinates).
- **Zero Update Gaps**: Creation requires `status == 'Submitted'`, `reporterCount == 1`, `reopenCount == 0`, and matching category allowlists.
- **ABAC Authorization**: Reads and writes on `reports/{id}` require `isSignedIn()` and matching officer ward assignment or admin status.
- **Sanitized Public Reads**: `publicReports` allows universal `read` but restricts `write` to atomic syncs or authenticated officers, with citizen updates limited strictly to changing `status: 'Reopened'` within 7 days of `resolvedAt`.
- **Commented Rationale**: Every rule block is preceded by an explanatory comment outlining the threat model and access invariant.

---

## 5. Verification & Testing Plan

1. **Unit Tests (`node:test`)**:
   - `haversine.test.ts`: Test distance calculations between coordinates and 30m boundary detection.
   - `stateMachine.test.ts`: Test valid transitions (`Submitted` → `Acknowledged` → `In progress` → `Resolved` → `Closed` and `Reopened` → `In progress`) and rejection of invalid jumps.
   - `sla.test.ts`: Verify due date computation per category hours.
   - `geoFuzz.test.ts`: Test 3-decimal rounding for public privacy.
2. **Browser End-to-End Verification (`playwright-cli`)**:
   - **Journey 1: Public Report Submission**: Open `/report`, select category, verify canvas photo compression, place Leaflet pin, submit, and confirm redirection to `/track/{id}`.
   - **Journey 2: Proximity Deduplication**: Submit a secondary report with the same category within 30m of an existing case; verify that duplicate case creation is suppressed and `reporterCount` increments.
   - **Journey 3: Public Tracking & Reopen**: Load `/track/{id}`, inspect rounded coordinates on Leaflet, verify absence of private photos/PII, simulate `Resolved` status, and trigger the "Was this fixed? No" reopen flow.
   - **Journey 4: Officer Dashboard & Status Progression**: Sign in as officer, view assigned ward queue, filter overdue tickets, open case detail, upload "after" photo, and progress status to `Resolved`.
   - **Journey 5: Scoreboard & Admin**: Verify ward-level aggregation metrics (open, overdue, 30-day median) on the scoreboard, and verify ward creation and SLA modifications in the admin console.
