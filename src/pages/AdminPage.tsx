import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  serverTimestamp,
  query,
  limit,
} from 'firebase/firestore';
import {
  ShieldAlert,
  Building,
  UserCheck,
  Clock,
  History,
  CheckCircle2,
  AlertCircle,
  Plus,
  Save,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { db } from '../lib/firebase.ts';
import { getWards, getSlaConfig } from '../services/wardService.ts';
import type { Ward, SlaConfig, UserProfile, ReportEvent } from '../types/index.ts';

interface AdminPageProps {
  currentUser: UserProfile;
}

export const AdminPage: React.FC<AdminPageProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'wards' | 'officers' | 'sla' | 'audit'>('wards');
  const [wards, setWards] = useState<Ward[]>([]);
  const [sla, setSla] = useState<SlaConfig | null>(null);
  const [auditEvents, setAuditEvents] = useState<(ReportEvent & { reportId: string })[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // New Ward Form
  const [newWardName, setNewWardName] = useState('');
  const [minLat, setMinLat] = useState('28.600');
  const [maxLat, setMaxLat] = useState('28.620');
  const [minLng, setMinLng] = useState('77.200');
  const [maxLng, setMaxLng] = useState('77.220');
  const [isSample, setIsSample] = useState(false);

  // Officer Assignment Form
  const [officerEmail, setOfficerEmail] = useState('');
  const [assignedWardId, setAssignedWardId] = useState('');
  const [officerRole, setOfficerRole] = useState<'officer' | 'admin'>('officer');
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);

  // SLA Form
  const [slaForm, setSlaForm] = useState<SlaConfig>({
    overflowingDustbinHours: 12,
    garbageDumpHours: 12,
    blockedDrainHours: 24,
    deadAnimalHours: 48,
    otherHours: 72,
  });

  const loadAllData = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      // 1. Wards
      const loadedWards = await getWards();
      setWards(loadedWards);
      if (loadedWards.length > 0 && !assignedWardId) {
        setAssignedWardId(loadedWards[0].id);
      }

      // 2. SLA Config
      const loadedSla = await getSlaConfig();
      setSla(loadedSla);
      setSlaForm(loadedSla);

      // 3. Registered Users
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: UserProfile[] = usersSnap.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as Omit<UserProfile, 'uid'>),
      }));
      setRegisteredUsers(usersList);

      // 4. Audit Log (Read events across reports)
      const reportsSnap = await getDocs(collection(db, 'reports'));
      const allEvents: (ReportEvent & { reportId: string })[] = [];

      for (const reportDoc of reportsSnap.docs.slice(0, 20)) {
        const eventsSnap = await getDocs(collection(db, 'reports', reportDoc.id, 'events'));
        eventsSnap.forEach((ev) => {
          allEvents.push({
            reportId: reportDoc.id,
            ...(ev.data() as ReportEvent),
          });
        });
      }

      allEvents.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setAuditEvents(allEvents);
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Failed to load administration data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleCreateWard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWardName.trim()) {
      setActionError('Ward name is required.');
      return;
    }

    const parsedMinLat = parseFloat(minLat);
    const parsedMaxLat = parseFloat(maxLat);
    const parsedMinLng = parseFloat(minLng);
    const parsedMaxLng = parseFloat(maxLng);

    if (
      isNaN(parsedMinLat) ||
      isNaN(parsedMaxLat) ||
      isNaN(parsedMinLng) ||
      isNaN(parsedMaxLng)
    ) {
      setActionError('Valid numeric bounding coordinates are required.');
      return;
    }

    try {
      setActionError(null);
      await addDoc(collection(db, 'wards'), {
        name: newWardName.trim(),
        bbox: {
          minLat: parsedMinLat,
          maxLat: parsedMaxLat,
          minLng: parsedMinLng,
          maxLng: parsedMaxLng,
        },
        isSample,
        createdAt: serverTimestamp(),
      });

      setActionNotice(`Ward "${newWardName}" created successfully.`);
      setNewWardName('');
      await loadAllData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create ward.');
    }
  };

  const handleAssignOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = officerEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setActionError('Officer Google email is required.');
      return;
    }

    try {
      setActionError(null);

      // Check if user has already signed in and has a uid
      const existingUser = registeredUsers.find((u) => u.email.toLowerCase() === cleanEmail);
      const uidToUpdate = existingUser ? existingUser.uid : `email_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

      await setDoc(
        doc(db, 'users', uidToUpdate),
        {
          email: cleanEmail,
          role: officerRole,
          wardId: assignedWardId,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setActionNotice(`Officer ${cleanEmail} linked to role ${officerRole} successfully.`);
      setOfficerEmail('');
      await loadAllData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to assign officer.');
    }
  };

  const handleSaveSla = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionError(null);
      await setDoc(doc(db, 'config', 'sla'), slaForm);
      setActionNotice('SLA turnaround hours updated successfully.');
      await loadAllData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update SLA configuration.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-md">
            Master Administration
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Municipal Governance Console
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Configure wards, manage officer assignments, update SLA policies, and inspect global audit logs.
          </p>
        </div>

        <button
          onClick={loadAllData}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Reload</span>
        </button>
      </div>

      {actionNotice && (
        <div className="mb-6 flex items-center gap-2 p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {actionError && (
        <div className="mb-6 flex items-center gap-2 p-3.5 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs font-semibold">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-6 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('wards')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'wards'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Wards &amp; Bounding Boxes ({wards.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('officers')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'officers'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Officer Assignments ({registeredUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('sla')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'sla'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>SLA Turnaround Configuration</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'audit'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Log ({auditEvents.length})</span>
        </button>
      </div>

      {/* Tab 1: Wards */}
      {activeTab === 'wards' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Create Ward Form */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Plus className="w-4 h-4 text-emerald-700" />
              <span>Create New Municipal Ward</span>
            </h3>

            <form onSubmit={handleCreateWard} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Ward Name:
                </label>
                <input
                  type="text"
                  value={newWardName}
                  onChange={(e) => setNewWardName(e.target.value)}
                  placeholder="e.g. Ward 21 - Model Town"
                  className="w-full p-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Min Latitude:
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={minLat}
                    onChange={(e) => setMinLat(e.target.value)}
                    className="w-full p-2 text-xs text-slate-900 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Max Latitude:
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={maxLat}
                    onChange={(e) => setMaxLat(e.target.value)}
                    className="w-full p-2 text-xs text-slate-900 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Min Longitude:
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={minLng}
                    onChange={(e) => setMinLng(e.target.value)}
                    className="w-full p-2 text-xs text-slate-900 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Max Longitude:
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={maxLng}
                    onChange={(e) => setMaxLng(e.target.value)}
                    className="w-full p-2 text-xs text-slate-900 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="sampleCheck"
                  checked={isSample}
                  onChange={(e) => setIsSample(e.target.checked)}
                  className="rounded text-emerald-700"
                />
                <label htmlFor="sampleCheck" className="text-xs text-slate-700 font-medium">
                  Mark as sample ward
                </label>
              </div>

              <button
                type="submit"
                className="w-full h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition"
              >
                Save Ward Bounding Box
              </button>
            </form>
          </div>

          {/* Existing Wards List */}
          <div className="lg:col-span-7 space-y-3">
            {wards.map((w) => (
              <div
                key={w.id}
                className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-start justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{w.name}</span>
                    {w.isSample && (
                      <span className="px-2 py-0.5 text-[10px] font-bold text-slate-600 bg-slate-100 rounded-md">
                        Sample Ward
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-1 space-y-0.5">
                    <div>
                      Lat: {w.bbox.minLat} to {w.bbox.maxLat}
                    </div>
                    <div>
                      Lng: {w.bbox.minLng} to {w.bbox.maxLng}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-400">ID: {w.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Officer Assignments */}
      {activeTab === 'officers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Assignment Form */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <UserCheck className="w-4 h-4 text-emerald-700" />
              <span>Link Officer to Ward</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              When an officer signs in with Google, link their email here to grant access to their municipal ward.
            </p>

            <form onSubmit={handleAssignOfficer} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Google Email Address:
                </label>
                <input
                  type="email"
                  value={officerEmail}
                  onChange={(e) => setOfficerEmail(e.target.value)}
                  placeholder="officer.delhi@gmail.com"
                  className="w-full p-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Assigned Ward:
                </label>
                <select
                  value={assignedWardId}
                  onChange={(e) => setAssignedWardId(e.target.value)}
                  className="w-full p-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-700"
                >
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.isSample ? '(Sample)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Role:
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                    <input
                      type="radio"
                      name="roleChoice"
                      value="officer"
                      checked={officerRole === 'officer'}
                      onChange={() => setOfficerRole('officer')}
                    />
                    <span>Officer</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                    <input
                      type="radio"
                      name="roleChoice"
                      value="admin"
                      checked={officerRole === 'admin'}
                      onChange={() => setOfficerRole('admin')}
                    />
                    <span>Administrator</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
              >
                Assign Role &amp; Ward
              </button>
            </form>
          </div>

          {/* Current Linked Officers */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-700">
              Registered System Roles
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {registeredUsers.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  No officers registered yet. Sign in with Google to create accounts.
                </div>
              ) : (
                registeredUsers.map((u) => {
                  const assigned = wards.find((w) => w.id === u.wardId);
                  return (
                    <div key={u.uid} className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <span className="font-semibold text-slate-900 block">{u.email}</span>
                        <span className="text-[11px] text-slate-500">
                          Ward: {assigned?.name || 'Unassigned'}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 text-[11px] font-bold uppercase rounded-md bg-slate-100 text-slate-800">
                        {u.role}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: SLA Turnaround Hours */}
      {activeTab === 'sla' && (
        <div className="max-w-xl bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-emerald-700" />
            <span>Resolution SLA Standards (in Hours)</span>
          </h3>
          <p className="text-xs text-slate-500 mb-6">
            Configures maximum resolution turnaround times before a case is flagged as Overdue.
          </p>

          <form onSubmit={handleSaveSla} className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <label className="text-xs font-semibold text-slate-700">
                Overflowing dustbin:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={slaForm.overflowingDustbinHours}
                  onChange={(e) =>
                    setSlaForm({
                      ...slaForm,
                      overflowingDustbinHours: parseInt(e.target.value) || 12,
                    })
                  }
                  className="w-20 p-2 text-xs font-mono text-center border border-slate-300 rounded-lg"
                />
                <span className="text-xs text-slate-500">hours</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="text-xs font-semibold text-slate-700">
                Garbage dump:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={slaForm.garbageDumpHours}
                  onChange={(e) =>
                    setSlaForm({
                      ...slaForm,
                      garbageDumpHours: parseInt(e.target.value) || 12,
                    })
                  }
                  className="w-20 p-2 text-xs font-mono text-center border border-slate-300 rounded-lg"
                />
                <span className="text-xs text-slate-500">hours</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="text-xs font-semibold text-slate-700">
                Blocked drain:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={slaForm.blockedDrainHours}
                  onChange={(e) =>
                    setSlaForm({
                      ...slaForm,
                      blockedDrainHours: parseInt(e.target.value) || 24,
                    })
                  }
                  className="w-20 p-2 text-xs font-mono text-center border border-slate-300 rounded-lg"
                />
                <span className="text-xs text-slate-500">hours</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="text-xs font-semibold text-slate-700">
                Dead animal:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={slaForm.deadAnimalHours}
                  onChange={(e) =>
                    setSlaForm({
                      ...slaForm,
                      deadAnimalHours: parseInt(e.target.value) || 48,
                    })
                  }
                  className="w-20 p-2 text-xs font-mono text-center border border-slate-300 rounded-lg"
                />
                <span className="text-xs text-slate-500">hours</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="text-xs font-semibold text-slate-700">
                Other sanitation hazards:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={slaForm.otherHours}
                  onChange={(e) =>
                    setSlaForm({
                      ...slaForm,
                      otherHours: parseInt(e.target.value) || 72,
                    })
                  }
                  className="w-20 p-2 text-xs font-mono text-center border border-slate-300 rounded-lg"
                />
                <span className="text-xs text-slate-500">hours</span>
              </div>
            </div>

            <button
              type="submit"
              className="mt-6 w-full h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Save Category SLAs</span>
            </button>
          </form>
        </div>
      )}

      {/* Tab 4: Audit Log */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-700 flex items-center justify-between">
            <span>Global Sanitation Transition Audit Log</span>
            <span className="font-mono text-[11px] text-slate-400">
              {auditEvents.length} events logged
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-2.5 px-4">Case ID</th>
                  <th className="py-2.5 px-4">Transition</th>
                  <th className="py-2.5 px-4">Action Note</th>
                  <th className="py-2.5 px-4">Actor Role</th>
                  <th className="py-2.5 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No status transitions recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditEvents.map((ev, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {ev.reportId.slice(0, 10)}...
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800">
                          {ev.fromStatus} → {ev.toStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {ev.note || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {ev.actorRole}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                        {ev.createdAt?.toDate
                          ? ev.createdAt.toDate().toLocaleString('en-IN')
                          : 'Recent'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
