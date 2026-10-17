import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Calendar,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { LeafletMap } from '../components/LeafletMap.tsx';
import { getPublicReport, reopenReportByCitizen } from '../services/reportService.ts';
import { canCitizenReopen } from '../utils/stateMachine.ts';
import { isReportOverdue } from '../utils/sla.ts';
import type { PublicReport } from '../types/index.ts';

interface TrackPageProps {
  initialReportId?: string;
  onSelectReportId?: (id: string) => void;
}

export const TrackPage: React.FC<TrackPageProps> = ({
  initialReportId,
  onSelectReportId,
}) => {
  const [reportIdInput, setReportIdInput] = useState<string>(initialReportId || '');
  const [activeReport, setActiveReport] = useState<PublicReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reopen State
  const [showReopenForm, setShowReopenForm] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [isReopening, setIsReopening] = useState<boolean>(false);
  const [reopenFeedback, setReopenFeedback] = useState<string | null>(null);
  const [citizenConfirmedFixed, setCitizenConfirmedFixed] = useState<boolean>(false);

  useEffect(() => {
    if (initialReportId) {
      setReportIdInput(initialReportId);
      loadReport(initialReportId);
    }
  }, [initialReportId]);

  const loadReport = async (id: string) => {
    if (!id.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    setCitizenConfirmedFixed(false);
    setShowReopenForm(false);
    setReopenFeedback(null);

    try {
      const data = await getPublicReport(id.trim());
      if (!data) {
        setErrorMsg('Report not found. Please verify the Case ID.');
        setActiveReport(null);
      } else {
        setActiveReport(data);
        if (onSelectReportId) onSelectReportId(id.trim());
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch public report.');
      setActiveReport(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadReport(reportIdInput);
  };

  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReport) return;
    if (!reopenReason.trim()) {
      setErrorMsg('Please specify why this issue is not fixed.');
      return;
    }

    try {
      setIsReopening(true);
      setErrorMsg(null);
      await reopenReportByCitizen(activeReport.id, reopenReason.trim());
      setReopenFeedback('Case reopened successfully. Municipal officers notified.');
      setShowReopenForm(false);
      setReopenReason('');
      // Reload report
      await loadReport(activeReport.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not reopen case.');
    } finally {
      setIsReopening(false);
    }
  };

  const getStatusBadge = (status: string, dueAt: any) => {
    const overdue = isReportOverdue(status, dueAt);

    if (overdue) {
      return (
        <span className="px-2.5 py-1 text-xs font-bold text-red-700 bg-red-100 rounded-lg flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{status} (Overdue)</span>
        </span>
      );
    }

    switch (status) {
      case 'Submitted':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">
            Submitted
          </span>
        );
      case 'Acknowledged':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-100 rounded-lg">
            Acknowledged
          </span>
        );
      case 'In progress':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-100 rounded-lg">
            In progress
          </span>
        );
      case 'Resolved':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-100 rounded-lg">
            Resolved
          </span>
        );
      case 'Closed':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-200 rounded-lg">
            Closed
          </span>
        );
      case 'Reopened':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-100 rounded-lg">
            Reopened
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">
            {status}
          </span>
        );
    }
  };

  const resolvedDate = activeReport?.resolvedAt?.toDate
    ? activeReport.resolvedAt.toDate()
    : activeReport?.resolvedAt
    ? new Date(activeReport.resolvedAt)
    : null;

  const reopenCheck = activeReport
    ? canCitizenReopen(activeReport.status, resolvedDate)
    : { allowed: false };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 pb-24 md:pb-12">
      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Track Public Sanitation Report
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Check complaint status, municipal timelines, and SLA deadlines. Public view uses privacy-rounded coordinates without photos.
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={reportIdInput}
            onChange={(e) => setReportIdInput(e.target.value)}
            placeholder="Enter Case ID (e.g., 7aB9xQ12...)"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !reportIdInput.trim()}
          className="px-4 py-2.5 bg-emerald-700 text-white rounded-xl text-sm font-semibold hover:bg-emerald-800 transition disabled:opacity-50 shrink-0"
        >
          {isLoading ? 'Searching...' : 'Track'}
        </button>
      </form>

      {errorMsg && (
        <div className="mb-6 flex items-start gap-2.5 p-3.5 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs font-medium">
          <ShieldAlert className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <p>{errorMsg}</p>
        </div>
      )}

      {reopenFeedback && (
        <div className="mb-6 flex items-center gap-2 p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{reopenFeedback}</span>
        </div>
      )}

      {activeReport && (
        <div className="space-y-6">
          {/* Main Case Summary Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Case ID: {activeReport.id}
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                  {activeReport.category}
                </h2>
              </div>
              <div>{getStatusBadge(activeReport.status, activeReport.dueAt)}</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-600">
              <div>
                <span className="text-slate-400 block mb-0.5">Reported On</span>
                <span className="font-semibold text-slate-900">
                  {activeReport.createdAt?.toDate
                    ? activeReport.createdAt.toDate().toLocaleDateString('en-IN')
                    : 'Recent'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">SLA Due By</span>
                <span className="font-semibold text-slate-900">
                  {activeReport.dueAt?.toDate
                    ? activeReport.dueAt.toDate().toLocaleTimeString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Pending'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Confirming Citizens</span>
                <span className="font-semibold text-slate-900 font-mono tabular-nums">
                  {activeReport.reporterCount} {activeReport.reporterCount === 1 ? 'citizen' : 'citizens'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Reopened Count</span>
                <span className="font-semibold text-slate-900 font-mono tabular-nums">
                  {activeReport.reopenCount} times
                </span>
              </div>
            </div>
          </div>

          {/* Citizen Verification: "Was this fixed?" when status is Resolved */}
          {activeReport.status === 'Resolved' && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>Sanitation Office marked this Resolved</span>
              </h3>
              <p className="text-xs text-emerald-800 leading-relaxed mb-4">
                Was this problem actually cleaned and fixed in your neighborhood? (You can challenge this within 7 days of resolution).
              </p>

              {citizenConfirmedFixed ? (
                <div className="p-3 bg-white text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Thank you for verifying! This helps keep our town clean.</span>
                </div>
              ) : !showReopenForm ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCitizenConfirmedFixed(true)}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl shadow-xs transition"
                  >
                    Yes, it's fixed
                  </button>
                  <button
                    onClick={() => {
                      if (!reopenCheck.allowed) {
                        setErrorMsg(reopenCheck.reason || 'Reopen period has expired.');
                      } else {
                        setShowReopenForm(true);
                      }
                    }}
                    className="px-4 py-2 bg-white hover:bg-slate-50 text-red-700 border border-red-300 text-xs font-semibold rounded-xl transition"
                  >
                    No, still dirty
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReopenSubmit} className="space-y-3 bg-white p-4 rounded-xl border border-emerald-200">
                  <label className="text-xs font-bold text-slate-900 block">
                    Why is this not fixed? (Short reason for ward officer)
                  </label>
                  <textarea
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value.slice(0, 300))}
                    placeholder="e.g. Garbage was only half cleared; drain is still overflowing with sludge."
                    rows={2}
                    className="w-full p-2.5 text-xs text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:border-red-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isReopening || !reopenReason.trim()}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                    >
                      {isReopening ? 'Reopening...' : 'Submit & Reopen Case'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReopenForm(false)}
                      className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Privacy Map: Location rounded to 3 decimal places (~110m privacy grid), no photos */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-sky-600" />
                <span>Approximate Location (~110m Privacy Grid)</span>
              </span>
              <span className="font-mono text-xs text-slate-500">
                {activeReport.approxLat.toFixed(3)}, {activeReport.approxLng.toFixed(3)}
              </span>
            </div>
            <LeafletMap
              lat={activeReport.approxLat}
              lng={activeReport.approxLng}
              zoom={15}
              isDraggable={false}
              isFuzzy={true}
              markerTitle="Fuzzy Privacy Vicinity"
              className="h-60 w-full rounded-xl overflow-hidden border border-slate-200"
            />
            <p className="text-[11px] text-slate-500 mt-2">
              Public privacy standard: exact coordinates and citizen photos are obscured on public tracking links.
            </p>
          </div>

          {/* Timeline of Events */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
              Lifecycle Timeline
            </h3>
            <div className="space-y-4">
              {activeReport.timelineSummary?.map((event, idx) => (
                <div key={idx} className="flex items-start gap-3 relative">
                  {idx !== activeReport.timelineSummary.length - 1 && (
                    <div className="absolute left-2.5 top-6 bottom-0 w-0.5 bg-slate-200" />
                  )}
                  <div className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0 z-10">
                    ✓
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        {event.status}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(event.timestamp).toLocaleTimeString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {event.note && (
                      <p className="text-xs text-slate-600 mt-0.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        {event.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
