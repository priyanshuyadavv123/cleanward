# CleanWard Security Specification & Invariants

## 1. Core Data Invariants
1. **Sanitation Territory Invariant**: Latitude must strictly fall between `6.0` and `38.0` N, and longitude between `68.0` and `98.0` E (Indian territory boundary).
2. **Citizen Privacy Invariant**: `reports/{reportId}` containing exact GPS and photos is strictly restricted to assigned ward officers and administrators. It is NEVER readable by the public.
3. **Public Mirror Invariant**: `publicReports/{reportId}` contains only fuzzy coordinates (rounded to 3 decimal places) and never exposes citizen photos, PII, or exact positions.
4. **State Machine Invariant**: Status transitions are unidirectional:
   - `Submitted` -> `Acknowledged`
   - `Acknowledged` -> `In progress`
   - `In progress` -> `Resolved` (mandates `afterPhotoUrl` and `resolvedAt`)
   - `Resolved` -> `Closed`
   - `Reopened` -> `In progress`
   All other state mutations (e.g., `Submitted` directly to `Closed` or `Resolved`) are mathematically forbidden.
5. **Citizen Reopen Invariant**: Citizens can only update `publicReports/{reportId}` when current status is `Resolved`, target status is `Reopened`, within 7 days of `resolvedAt`, and `reopenCount` increments by exactly 1.
6. **Administrative Sovereignty**: Only users with the `'admin'` role can write to `config/sla` and `wards/{wardId}`, or update roles in `users/{uid}`.
7. **User Profile Isolation**: Users can only read their own profile (`users/$(request.auth.uid)`), preventing enumeration of officer emails.

## 2. The "Dirty Dozen" Payloads (Must be Blocked)
1. **Payload 1 (Out-of-Bounds GPS - Latitude > 38.0)**: Latitude set to 45.0 outside India -> REJECTED.
2. **Payload 2 (Out-of-Bounds GPS - Longitude < 68.0)**: Longitude set to 55.0 -> REJECTED.
3. **Payload 3 (Disallowed Category)**: Category set to "Pothole" or "Streetlight" -> REJECTED.
4. **Payload 4 (Buffer Overflow Description)**: Description containing 301+ characters -> REJECTED.
5. **Payload 5 (Premature Status Bypass)**: Create report directly with `status: "Resolved"` -> REJECTED.
6. **Payload 6 (Shadow Counter Manipulation)**: Create report with `reporterCount: 5` or `reopenCount: 2` -> REJECTED.
7. **Payload 7 (Unauthenticated Read on Private Reports)**: Guest accessing `reports/{id}` -> REJECTED.
8. **Payload 8 (Cross-Ward Officer Tampering)**: Officer assigned to Ward 3 attempting to update a case in Ward 7 -> REJECTED.
9. **Payload 9 (Invalid Transition Jump)**: Officer attempting to change status from `Submitted` directly to `Closed` -> REJECTED.
10. **Payload 10 (Reopen Window Expiry)**: Citizen attempting to reopen a case resolved 8 days ago -> REJECTED.
11. **Payload 11 (Non-Admin SLA Tampering)**: Regular user or officer attempting to write to `config/sla` -> REJECTED.
12. **Payload 12 (Self-Assigned Admin Role)**: User attempting to write `role: "admin"` into their own `users/{uid}` -> REJECTED.
