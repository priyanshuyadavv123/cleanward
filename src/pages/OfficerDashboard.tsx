import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Camera,
  MapPin,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  X,
  Upload,
  UserCheck,
  Calendar,
} from 'lucide-react';
import { db } from '../lib/firebase.ts';
import { LeafletMap } from '../components/LeafletMap.tsx';
import {
  updateReportStatus,
  getReportEvents,
} from '../services/reportService.ts';
import { processAndStripExifPhoto, uploadReportPhoto } from '../services/storageService.ts';
import { isReportOverdue } from '../utils/sla.ts';
import {
  getNextAllowedStatuses,
  isValidTransition,
  type ReportStatus,
} from '../utils/stateMachine.ts';
import type { Report, ReportEvent, UserProfile, Ward } from '../types/index.ts';

interface OfficerDashboardProps {
  currentUser: UserProfile;
  wards: Ward[];
}

export const OfficerDashboard: React.FC<OfficerDashboardProps> = ({
  currentUser,
  wards,
}) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedWardId, setSelectedWardId] = useState<string>(
    currentUser.wardId || (wards.length > 0 ? wards[0].id : '')
  );
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeCase, setActiveCase] = useState<Report | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<ReportEvent[]>([]);

  // Transition form state
  const [targetStatus, setTargetStatus] = useState<ReportStatus | ''>('');
  const [transitionNote, setTransitionNote] = useState<string>('');
  const [afterPhotoBlob, setAfterPhotoBlob] = useState<Blob | null>(null);
  const [afterPhotoPreview, setAfterPhotoPreview] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeWard = wards.find((w) => w.id === selectedWardId);

  // Sync ward selection when user profile or wards load
  useEffect(() => {
    if (currentUser.wardId) {
      setSelectedWardId(currentUser.wardId);
    } else if (wards.length > 0 && !selectedWardId) {
      setSelectedWardId(wards[0].id);
    }
  }, [currentUser, wards]);

  // Real-time listener for reports in the officer's ward
  useEffect(() => {
    if (!selectedWardId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const reportsRef = collection(db, 'reports');
    const q = query(
      reportsRef,
      where('wardId', '==', selectedWardId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: Report[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Report, 'id'>),
        }));
        // Sort descending by creation
        loaded.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
          return timeB - timeA;
        });
        setReports(loaded);
        setIsLoading(false);

        // Keep activeCase updated if currently selected
        if (activeCase) {
          const updated = loaded.find((r) => r.id === activeCase.id);
          if (updated) setActiveCase(updated);
        }
      },
      (error) => {
        console.error('Error listening to ward reports:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedWardId]);

  // Load audit timeline whenever activeCase changes
  useEffect(() => {
    if (activeCase) {
      getReportEvents(activeCase.id).then(setTimelineEvents);
      const nextAllowed = getNextAllowedStatuses(activeCase.status);
      setTargetStatus(nextAllowed.length > 0 ? nextAllowed[0] : '');
      setTransitionNote('');
      setAfterPhotoBlob(null);
      setAfterPhotoPreview(null);
      setActionError(null);
    }
  }, [activeCase?.id, activeCase?.status]);

  const handleAfterPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setActionError(null);
      const processed = await processAndStripExifPhoto(file, 1600);
      setAfterPhotoBlob(processed.blob);
      setAfterPhotoPreview(processed.base64DataUrl);
    } catch (err: any) {
      setActionError(err.message || 'Failed to process resolution photo.');
    }
  };

  const handleStatusTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase || !targetStatus) return;

    if (!isValidTransition(activeCase.status, targetStatus)) {
      setActionError(`Cannot transition from ${activeCase.status} to ${targetStatus}.`);
      return;
    }

    if (targetStatus === 'Resolved' && !afterPhotoBlob && !afterPhotoPreview) {
      setActionError('Resolving requires an "after" photo upload.');
      return;
    }

    try {
      setIsUpdating(true);
      setActionError(null);

      let afterPhotoUrl: string | null = null;
      if (targetStatus === 'Resolved' && afterPhotoBlob && afterPhotoPreview) {
        const storagePath = `reports/${activeCase.id}/after_${Date.now()}.jpg`;
        afterPhotoUrl = await uploadReportPhoto(afterPhotoBlob, afterPhotoPreview, storagePath);
      }

      await updateReportStatus(
        activeCase.id,
        activeCase.status,
        targetStatus,
        transitionNote.trim() || `Status updated to ${targetStatus}`,
        currentUser.role,
        afterPhotoUrl
      );

      setIsUpdating(false);
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Status transition failed.');
      setIsUpdating(false);
    }
  };

  // Filter reports
  const filteredReports = reports.filter((r) => {
    const isOverdue = isReportOverdue(r.status, r.dueAt);
    if (overdueOnly && !isOverdue) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12">
      {/* Officer Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-md">
              {currentUser.role === 'admin' ? 'Administrator' : 'Sanitation Officer'}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {currentUser.email}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Ward Sanitation Queue
          </h1>
        </div>

        {/* Ward Switcher (If Admin, can switch wards) */}
        {currentUser.role === 'admin' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Ward:</span>
            <select
              value={selectedWardId}
              onChange={(e) => setSelectedWardId(e.target.value)}
              className="p-2 text-xs font-medium bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-700"
            >
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} {w.isSample ? '(Sample)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Filter Strip */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs mb-6 flex flex-wrap items-center justify-between gap-3">
        {/* Status segmented filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {['all', 'Submitted', 'Acknowledged', 'In progress', 'Resolved', 'Closed', 'Reopened'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {st === 'all' ? 'All Cases' : st}
            </button>
          ))}
        </div>

        {/* Overdue Toggle */}
        <button
          onClick={() => setOverdueOnly(!overdueOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border whitespace-nowrap shrink-0 ${
            overdueOnly
              ? 'bg-red-50 text-red-700 border-red-300'
              : 'text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle className={`w-3.5 h-3.5 ${overdueOnly ? 'text-red-600' : 'text-slate-400'}`} />
          <span>Overdue SLA Only</span>
        </button>
      </div>

      {/* Layout Split: Cases List + Case Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Cases List */}
        <div className={`${activeCase ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-3`}>
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-700" />
              <span>Loading ward reports...</span>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-900">No cases found</h3>
              <p className="text-xs text-slate-500 mt-1">
                {overdueOnly
                  ? 'No overdue complaints in this ward.'
                  : 'All complaints matching this filter have been handled.'}
              </p>
            </div>
          ) : (
            filteredReports.map((report) => {
              const overdue = isReportOverdue(report.status, report.dueAt);
              const isSelected = activeCase?.id === report.id;

              return (
                <div
                  key={report.id}
                  onClick={() => setActiveCase(report)}
                  className={`p-4 rounded-2xl border transition cursor-pointer bg-white ${
                    isSelected
                      ? 'border-emerald-700 ring-2 ring-emerald-700/20 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {report.beforePhotoUrl ? (
                        <img
                          src={report.beforePhotoUrl}
                          alt="Before"
                          className="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          <Camera className="w-6 h-6 text-slate-400" />
                        </div>
                      )}

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {report.category}
                          </span>
                          {overdue && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold text-red-700 bg-red-100 rounded">
                              Overdue
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                          {report.description}
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1.5 font-mono">
                          <span>ID: {report.id.slice(0, 8)}...</span>
                          <span>·</span>
                          <span>Reporters: {report.reporterCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-slate-100 text-slate-800">
                        {report.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Detailed Case View Drawer (Officer Actions) */}
        {activeCase && (
          <div className="lg:col-span-6 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-6 sticky top-20">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[11px] font-mono text-slate-400 block uppercase">
                  Full Case Detail · ID: {activeCase.id}
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                  {activeCase.category}
                </h2>
              </div>
              <button
                onClick={() => setActiveCase(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Close detail"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photos (Before and After) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Before Photo (Citizen)
                </span>
                {activeCase.beforePhotoUrl ? (
                  <img
                    src={activeCase.beforePhotoUrl}
                    alt="Before sanitation condition"
                    className="w-full h-40 rounded-xl object-cover bg-slate-100 border border-slate-200"
                  />
                ) : (
                  <div className="w-full h-40 rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                    No photo
                  </div>
                )}
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  After Photo (Resolution)
                </span>
                {activeCase.afterPhotoUrl ? (
                  <img
                    src={activeCase.afterPhotoUrl}
                    alt="Resolved clean condition"
                    className="w-full h-40 rounded-xl object-cover bg-slate-100 border border-slate-200"
                  />
                ) : (
                  <div className="w-full h-40 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center p-2 text-center">
                    <Camera className="w-5 h-5 text-slate-300 mb-1" />
                    <span className="text-[11px] text-slate-400">
                      Required when marking Resolved
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Description & Reporter Count */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-xs">
              <div className="text-slate-700">
                <strong className="text-slate-900 block mb-0.5">Description:</strong>
                <p className="leading-relaxed">{activeCase.description}</p>
              </div>
              <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-200">
                <span>Confirming Citizens: <strong className="text-slate-900 font-mono">{activeCase.reporterCount}</strong></span>
                <span>Reopen Count: <strong className="text-slate-900 font-mono">{activeCase.reopenCount}</strong></span>
              </div>
            </div>

            {/* Exact GPS Pin Map for Officer */}
            <div>
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Exact GPS Coordinates (Officer View)</span>
                </span>
                <span className="font-mono text-slate-500">
                  {activeCase.lat.toFixed(6)}, {activeCase.lng.toFixed(6)}
                </span>
              </div>
              <LeafletMap
                lat={activeCase.lat}
                lng={activeCase.lng}
                zoom={16}
                isDraggable={false}
                markerTitle="Exact Incident Pin"
                className="h-48 w-full rounded-xl overflow-hidden border border-slate-200"
              />
            </div>

            {/* Status Change Form */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                Update Case Status
              </h3>

              {actionError && (
                <div className="mb-3 p-2.5 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                  {actionError}
                </div>
              )}

              {getNextAllowedStatuses(activeCase.status).length === 0 ? (
                <div className="p-3 bg-white text-slate-500 text-xs rounded-xl text-center">
                  Case is {activeCase.status}. No further transitions allowed.
                </div>
              ) : (
                <form onSubmit={handleStatusTransition} className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Allowed Next Step:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {getNextAllowedStatuses(activeCase.status).map((st) => (
                        <button
                          type="button"
                          key={st}
                          onClick={() => setTargetStatus(st)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                            targetStatus === st
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resolving requires after-photo upload */}
                  {targetStatus === 'Resolved' && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                      <label className="text-xs font-bold text-slate-900 block">
                        Upload "After" Resolution Photo (Mandatory):
                      </label>
                      {afterPhotoPreview ? (
                        <div className="relative rounded-lg overflow-hidden h-32 bg-slate-100">
                          <img
                            src={afterPhotoPreview}
                            alt="Cleaned preview"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setAfterPhotoBlob(null);
                              setAfterPhotoPreview(null);
                            }}
                            className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-md text-[10px]"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer flex items-center justify-center gap-2 p-3 border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50 rounded-xl text-emerald-800 text-xs font-semibold transition">
                          <Camera className="w-4 h-4" />
                          <span>Capture / Upload Cleaned Spot</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleAfterPhotoSelect}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Action Note:
                    </label>
                    <input
                      type="text"
                      value={transitionNote}
                      onChange={(e) => setTransitionNote(e.target.value)}
                      placeholder="e.g. Sanitation truck dispatched; area sanitized"
                      className="w-full p-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUpdating || !targetStatus}
                    className="w-full h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
                  >
                    {isUpdating ? 'Executing State Transition...' : `Transition to ${targetStatus}`}
                  </button>
                </form>
              )}
            </div>

            {/* Audit Trail Timeline */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Audit Log ({timelineEvents.length} events)
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
                {timelineEvents.map((ev, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start justify-between">
                    <div>
                      <span className="font-semibold text-slate-900">
                        {ev.fromStatus} → {ev.toStatus}
                      </span>
                      {ev.note && <p className="text-[11px] text-slate-600 mt-0.5">{ev.note}</p>}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {ev.actorRole}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
