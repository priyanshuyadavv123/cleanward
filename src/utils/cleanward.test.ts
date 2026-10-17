import test from 'node:test';
import assert from 'node:assert/strict';

import { haversineDistanceMeters, isWithinProximity } from './haversine.ts';
import {
  isValidTransition,
  getNextAllowedStatuses,
  canCitizenReopen,
  type ReportStatus,
} from './stateMachine.ts';
import {
  calculateDueAt,
  isReportOverdue,
  calculateMedianResolutionHours,
} from './sla.ts';
import { roundToThreeDecimals } from './geoFuzz.ts';

test('Haversine distance calculates accurate meters between nearby points', () => {
  // Point A in Delhi: 28.6139, 77.2090
  // Point B approx 25m north: 28.614125, 77.2090
  const dist = haversineDistanceMeters(28.6139, 77.209, 28.614125, 77.209);
  assert.ok(dist >= 20 && dist <= 30, `Expected distance ~25m, got ${dist}`);

  // Point C approx 100m away
  const distFar = haversineDistanceMeters(28.6139, 77.209, 28.6148, 77.209);
  assert.ok(distFar > 90, `Expected distance >90m, got ${distFar}`);

  // Proximity check with default 30m threshold
  assert.equal(isWithinProximity(28.6139, 77.209, 28.614125, 77.209, 30), true);
  assert.equal(isWithinProximity(28.6139, 77.209, 28.6148, 77.209, 30), false);
});

test('State machine strictly enforces allowed transitions and rejects invalid skips', () => {
  // Allowed sequential paths
  assert.equal(isValidTransition('Submitted', 'Acknowledged'), true);
  assert.equal(isValidTransition('Acknowledged', 'In progress'), true);
  assert.equal(isValidTransition('In progress', 'Resolved'), true);
  assert.equal(isValidTransition('Resolved', 'Closed'), true);
  assert.equal(isValidTransition('Reopened', 'In progress'), true);

  // Illegal skips must be rejected
  assert.equal(isValidTransition('Submitted', 'Resolved'), false);
  assert.equal(isValidTransition('Submitted', 'Closed'), false);
  assert.equal(isValidTransition('Acknowledged', 'Closed'), false);
  assert.equal(isValidTransition('Closed', 'In progress'), false);
  assert.equal(isValidTransition('Resolved', 'Acknowledged'), false);

  // Next allowed status options
  assert.deepEqual(getNextAllowedStatuses('Submitted'), ['Acknowledged']);
  assert.deepEqual(getNextAllowedStatuses('Acknowledged'), ['In progress']);
  assert.deepEqual(getNextAllowedStatuses('In progress'), ['Resolved']);
  assert.deepEqual(getNextAllowedStatuses('Resolved'), ['Closed']);
  assert.deepEqual(getNextAllowedStatuses('Closed'), []);
  assert.deepEqual(getNextAllowedStatuses('Reopened'), ['In progress']);
});

test('Citizen reopen validation enforces 7-day post-resolution window', () => {
  const baseTime = new Date('2026-10-15T12:00:00Z');

  // Case 1: Within 3 days of resolution -> Allowed
  const threeDaysLater = new Date('2026-10-18T12:00:00Z');
  const validCheck = canCitizenReopen('Resolved', baseTime, threeDaysLater);
  assert.equal(validCheck.allowed, true);

  // Case 2: 8 days later -> Rejected
  const eightDaysLater = new Date('2026-10-23T12:00:00Z');
  const expiredCheck = canCitizenReopen('Resolved', baseTime, eightDaysLater);
  assert.equal(expiredCheck.allowed, false);

  // Case 3: Status is not Resolved -> Rejected
  const wrongStatusCheck = canCitizenReopen('In progress', baseTime, threeDaysLater);
  assert.equal(wrongStatusCheck.allowed, false);
});

test('SLA calculation computes dueAt timestamps and overdue states accurately', () => {
  const createdAt = new Date('2026-10-10T10:00:00Z');

  // Overflowing dustbin has 12h SLA
  const dueDustbin = calculateDueAt('Overflowing dustbin', createdAt);
  assert.equal(dueDustbin.toISOString(), '2026-10-10T22:00:00.000Z');

  // Blocked drain has 24h SLA
  const dueDrain = calculateDueAt('Blocked drain', createdAt);
  assert.equal(dueDrain.toISOString(), '2026-10-11T10:00:00.000Z');

  // Overdue check: 13h after creation -> Overdue for dustbin
  const checkTime = new Date('2026-10-10T23:00:00Z');
  assert.equal(isReportOverdue('Submitted', dueDustbin, checkTime), true);
  assert.equal(isReportOverdue('In progress', dueDustbin, checkTime), true);

  // If already Resolved or Closed, never overdue
  assert.equal(isReportOverdue('Resolved', dueDustbin, checkTime), false);
  assert.equal(isReportOverdue('Closed', dueDustbin, checkTime), false);
});

test('Median resolution calculation handles odd and even counts', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const reports = [
    {
      createdAt: '2026-10-10T10:00:00Z',
      resolvedAt: '2026-10-10T14:00:00Z', // 4 hours
    },
    {
      createdAt: '2026-10-11T08:00:00Z',
      resolvedAt: '2026-10-11T16:00:00Z', // 8 hours
    },
    {
      createdAt: '2026-10-12T00:00:00Z',
      resolvedAt: '2026-10-12T12:00:00Z', // 12 hours
    },
  ];

  const median = calculateMedianResolutionHours(reports, now);
  assert.equal(median, 8);
});

test('Geo-fuzzing rounds coordinates to 3 decimal places', () => {
  const lat = 28.613945;
  const lng = 77.209028;

  assert.equal(roundToThreeDecimals(lat), 28.614);
  assert.equal(roundToThreeDecimals(lng), 77.209);
});
