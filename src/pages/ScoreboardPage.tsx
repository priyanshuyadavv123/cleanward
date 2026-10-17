import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { db } from '../lib/firebase.ts';
import { getWards } from '../services/wardService.ts';
import { isReportOverdue, calculateMedianResolutionHours } from '../utils/sla.ts';
import type { Ward, PublicReport } from '../types/index.ts';

interface WardMetric {
  ward: Ward;
  openCases: number;
  overdueCases: number;
  totalReports: number;
  medianResolutionHours: number | null;
}

export const ScoreboardPage: React.FC = () => {
  const [metrics, setMetrics] = useState<WardMetric[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const loadScoreboardData = async () => {
    setIsLoading(true);
    try {
      const wards = await getWards();

      // Read public reports (completely sanitized and safe)
      const publicReportsRef = collection(db, 'publicReports');
      const snap = await getDocs(publicReportsRef);
      const reports: (PublicReport & { createdAtDate: Date; resolvedAtDate?: Date | null })[] = snap.docs.map((d) => {
        const data = d.data();
        const createdAtDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now());
        const resolvedAtDate = data.resolvedAt?.toDate
          ? data.resolvedAt.toDate()
          : data.resolvedAt
          ? new Date(data.resolvedAt)
          : null;

        return {
          id: d.id,
          ...data,
          createdAtDate,
          resolvedAtDate,
        } as any;
      });

      const computed: WardMetric[] = wards.map((ward) => {
        const wardReports = reports.filter((r) => r.wardId === ward.id);

        let openCount = 0;
        let overdueCount = 0;

        for (const r of wardReports) {
          const isOpen = r.status !== 'Resolved' && r.status !== 'Closed';
          if (isOpen) {
            openCount++;
            if (isReportOverdue(r.status, r.dueAt)) {
              overdueCount++;
            }
          }
        }

        const medianHours = calculateMedianResolutionHours(
          wardReports.map((r) => ({
            createdAt: r.createdAtDate,
            resolvedAt: r.resolvedAtDate,
          }))
        );

        return {
          ward,
          openCases: openCount,
          overdueCases: overdueCount,
          totalReports: wardReports.length,
          medianResolutionHours: medianHours,
        };
      });

      setMetrics(computed);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Error loading scoreboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadScoreboardData();
  }, []);

  // Aggregates across all wards
  const totalOpen = metrics.reduce((acc, m) => acc + m.openCases, 0);
  const totalOverdue = metrics.reduce((acc, m) => acc + m.overdueCases, 0);
  const totalSubmissions = metrics.reduce((acc, m) => acc + m.totalReports, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Municipal Sanitation Scoreboard
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Ward-level civic performance metrics. Pure aggregations without citizen coordinates, photos, or personal identities.
          </p>
        </div>

        <button
          onClick={loadScoreboardData}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Aggregate KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Active Complaints</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
            {totalOpen}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Currently open across all municipal wards
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Overdue SLA Cases</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-3xl font-extrabold text-red-600 font-mono tabular-nums">
            {totalOverdue}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Exceeded standard resolution time limit
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Reports</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
            {totalSubmissions}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Lifetime civic complaints recorded
          </span>
        </div>
      </div>

      {/* Scoreboard Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-700" />
            <span>Ward Resolution Transparency Index</span>
          </h2>
          <span className="text-[11px] text-slate-400 font-mono">
            Updated {lastRefreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 sm:px-6">Municipal Ward</th>
                <th className="py-3 px-4 text-center">Open Cases</th>
                <th className="py-3 px-4 text-center">Overdue Cases</th>
                <th className="py-3 px-4 text-center">30-Day Median Resolution</th>
                <th className="py-3 px-4 sm:px-6 text-right">Total Cases</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-700" />
                    <span>Loading ward analytics...</span>
                  </td>
                </tr>
              ) : metrics.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No municipal wards configured.
                  </td>
                </tr>
              ) : (
                metrics.map((row) => (
                  <tr key={row.ward.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-4 sm:px-6 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{row.ward.name}</span>
                        {row.ward.isSample && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold text-slate-500 bg-slate-100 rounded">
                            Sample
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center font-mono font-bold tabular-nums text-slate-800">
                      {row.openCases}
                    </td>
                    <td className="py-4 px-4 text-center font-mono font-bold tabular-nums">
                      <span className={row.overdueCases > 0 ? 'text-red-600' : 'text-slate-400'}>
                        {row.overdueCases}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center font-mono tabular-nums text-slate-700">
                      {row.medianResolutionHours != null ? (
                        <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                          {row.medianResolutionHours}h
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No recent closures</span>
                      )}
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-right font-mono font-bold tabular-nums text-slate-900">
                      {row.totalReports}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
