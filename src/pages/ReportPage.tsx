import React, { useState, useEffect } from 'react';
import {
  Camera,
  Upload,
  AlertCircle,
  CheckCircle2,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Info,
} from 'lucide-react';
import { LeafletMap } from '../components/LeafletMap.tsx';
import { processAndStripExifPhoto, uploadReportPhoto } from '../services/storageService.ts';
import { createOrConfirmReport } from '../services/reportService.ts';
import { findWardForLocation, getWards, getSlaConfig } from '../services/wardService.ts';
import type { Ward, ReportCategory, SlaConfig } from '../types/index.ts';

interface ReportPageProps {
  onNavigateToTrack: (id: string) => void;
}

const CATEGORIES: { label: ReportCategory; description: string }[] = [
  { label: 'Garbage dump', description: 'Accumulated street waste, illegal dumping sites' },
  { label: 'Overflowing dustbin', description: 'Spilling community bins, broken compactor bins' },
  { label: 'Blocked drain', description: 'Stagnant water, choked sewer or stormwater drain' },
  { label: 'Dead animal', description: 'Stray carcass requiring urgent sanitation removal' },
  { label: 'Other', description: 'Other municipal sanitation or hygiene hazards' },
];

export const ReportPage: React.FC<ReportPageProps> = ({ onNavigateToTrack }) => {
  const [wards, setWards] = useState<Ward[]>([]);
  const [slaConfig, setSlaConfig] = useState<SlaConfig | null>(null);

  // Form State
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoSizeKb, setPhotoSizeKb] = useState<number>(0);
  const [category, setCategory] = useState<ReportCategory>('Garbage dump');
  const [description, setDescription] = useState<string>('');

  // Location State (Default: Central New Delhi / India coordinates)
  const [lat, setLat] = useState<number>(28.6508);
  const [lng, setLng] = useState<number>(77.2154);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [assignedWard, setAssignedWard] = useState<Ward | null>(null);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    isDuplicate: boolean;
    reportId: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Load wards and SLA config on mount
  useEffect(() => {
    async function loadData() {
      const loadedWards = await getWards();
      setWards(loadedWards);
      const loadedSla = await getSlaConfig();
      setSlaConfig(loadedSla);

      // Determine initial ward
      const initialWard = findWardForLocation(lat, lng, loadedWards);
      setAssignedWard(initialWard);
    }
    loadData();
    requestGeolocation();
  }, []);

  // Recalculate ward when lat/lng changes
  useEffect(() => {
    if (wards.length > 0) {
      const matched = findWardForLocation(lat, lng, wards);
      setAssignedWard(matched);
    }
  }, [lat, lng, wards]);

  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;

        // Verify latitude and longitude are within Indian borders (6 to 38, 68 to 98)
        if (userLat >= 6 && userLat <= 38 && userLng >= 68 && userLng <= 98) {
          setLat(userLat);
          setLng(userLng);
          setAccuracy(pos.coords.accuracy);
        } else {
          // Keep Delhi default if GPS returns overseas coordinates in sandbox
          setAccuracy(pos.coords.accuracy);
        }
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setErrorMsg(null);
      // Strip EXIF and GPS metadata, compress to max 1600px, JPEG quality clamped <= 400KB
      const processed = await processAndStripExifPhoto(file, 1600);
      setPhotoBlob(processed.blob);
      setPhotoPreview(processed.base64DataUrl);
      setPhotoSizeKb(Math.round(processed.sizeBytes / 1024));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoBlob || !photoPreview) {
      setErrorMsg('Please capture or upload a photo of the sanitation issue.');
      return;
    }

    if (!description.trim()) {
      setErrorMsg('Please provide a short description (max 300 characters).');
      return;
    }

    if (description.length > 300) {
      setErrorMsg('Description must be 300 characters or less.');
      return;
    }

    if (!assignedWard) {
      setErrorMsg('Could not determine municipal ward for this location.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      // 1. Upload photo to Firebase Storage (falls back to compressed base64 <= 400KB)
      const storagePath = `reports/temp_${Date.now()}/before.jpg`;
      const photoUrl = await uploadReportPhoto(photoBlob, photoPreview, storagePath);

      // 2. Perform 30m Haversine deduplication check and atomic batch write
      const result = await createOrConfirmReport({
        category,
        description: description.trim(),
        lat,
        lng,
        wardId: assignedWard.id,
        beforePhotoUrl: photoUrl,
        customSla: slaConfig
          ? {
              'Overflowing dustbin': slaConfig.overflowingDustbinHours,
              'Garbage dump': slaConfig.garbageDumpHours,
              'Blocked drain': slaConfig.blockedDrainHours,
              'Dead animal': slaConfig.deadAnimalHours,
              'Other': slaConfig.otherHours,
            }
          : undefined,
      });

      setSuccessResult(result);
      setIsSubmitting(false);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Submission failed. Please check network connectivity.');
      setIsSubmitting(false);
    }
  };

  const copyTrackingLink = (reportId: string) => {
    const fullUrl = `${window.location.origin}#track=${reportId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 pb-24 md:pb-12">
      {/* Header Banner */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Report Sanitation Problem
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Direct civic complaint dispatch for Indian municipal towns. Complements the Swachhata app. No login or phone number required.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Confirmation Modal */}
      {successResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            {successResult.isDuplicate ? (
              <>
                <h3 className="text-lg font-bold text-slate-900">
                  A similar report already exists. Thanks for confirming.
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Another citizen recently reported this exact issue within 30 meters. Your confirmation has been added to increase the municipal priority!
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-slate-900">
                  Report Registered Successfully!
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Your case has been dispatched to{' '}
                  <strong>{assignedWard?.name || 'the Ward Office'}</strong>.
                  Keep your tracking link to monitor resolution progress.
                </p>
              </>
            )}

            <div className="mt-5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-left">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Case Tracking ID
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-bold text-slate-900 truncate">
                  {successResult.reportId}
                </span>
                <button
                  onClick={() => copyTrackingLink(successResult.reportId)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                  aria-label="Copy tracking link"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                onClick={() => onNavigateToTrack(successResult.reportId)}
                className="w-full h-11 rounded-xl bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-emerald-800 transition"
              >
                <span>Track This Case</span>
                <ExternalLink className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setSuccessResult(null);
                  setPhotoBlob(null);
                  setPhotoPreview(null);
                  setDescription('');
                }}
                className="w-full h-10 rounded-xl bg-slate-100 text-slate-700 font-medium text-xs hover:bg-slate-200 transition"
              >
                Submit Another Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Photo Capture with EXIF Removal */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              1. Issue Photo (Canvas EXIF-Stripped)
            </label>
            {photoPreview && (
              <span className="text-[11px] text-emerald-700 font-medium">
                {photoSizeKb} KB · Clean JPEG
              </span>
            )}
          </div>

          {photoPreview ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 group">
              <img
                src={photoPreview}
                alt="Sanitation problem preview"
                className="w-full h-56 object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <label className="cursor-pointer px-3 py-1.5 bg-white text-slate-900 text-xs font-semibold rounded-lg shadow-md hover:bg-slate-100 transition">
                  Change Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="cursor-pointer flex flex-col items-center justify-center p-6 border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 rounded-xl transition text-center min-h-[140px]">
                <Camera className="w-8 h-8 text-emerald-700 mb-2" />
                <span className="text-xs font-bold text-emerald-900">Take Photo</span>
                <span className="text-[10px] text-emerald-700 mt-0.5">Camera capture</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>

              <label className="cursor-pointer flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 rounded-xl transition text-center min-h-[140px]">
                <Upload className="w-8 h-8 text-slate-600 mb-2" />
                <span className="text-xs font-bold text-slate-800">Choose from Gallery</span>
                <span className="text-[10px] text-slate-500 mt-0.5">Upload file</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Images are re-drawn to canvas at max 1600px to remove EXIF &amp; GPS camera data.</span>
          </p>
        </div>

        {/* Step 2: Location on Leaflet Map with Draggable Pin */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              2. Location &amp; Ward Assignment
            </label>
            <button
              type="button"
              onClick={requestGeolocation}
              disabled={isLocating}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'Locating...' : 'Refresh GPS'}</span>
            </button>
          </div>

          <div className="mb-3 flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                Ward:{' '}
                <strong className="text-slate-900">
                  {assignedWard?.name || 'Determining ward...'}
                </strong>
              </span>
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {lat.toFixed(4)}, {lng.toFixed(4)}
            </span>
          </div>

          <LeafletMap
            lat={lat}
            lng={lng}
            isDraggable={true}
            onLocationChange={(newLat, newLng) => {
              setLat(newLat);
              setLng(newLng);
            }}
            accuracyMeters={accuracy}
            className="h-60 w-full rounded-xl overflow-hidden border border-slate-200"
          />
        </div>

        {/* Step 3: Category */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-3">
            3. Sanitation Problem Category
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat.label;
              return (
                <button
                  type="button"
                  key={cat.label}
                  onClick={() => setCategory(cat.label)}
                  className={`p-3 rounded-xl text-left border transition ${
                    isSelected
                      ? 'border-emerald-700 bg-emerald-50/80 shadow-xs ring-1 ring-emerald-700'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-900">{cat.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {cat.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 4: Description (Max 300 chars, No PII asked) */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              4. Description (Max 300 Characters)
            </label>
            <span
              className={`text-xs font-mono tabular-nums ${
                description.length > 280 ? 'text-amber-600 font-bold' : 'text-slate-400'
              }`}
            >
              {description.length}/300
            </span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 300))}
            rows={3}
            placeholder="Describe the issue (landmark, size of dump, blocked road, etc.). Do NOT include your name or phone number."
            className="w-full p-3 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || !photoPreview}
          className="w-full h-13 rounded-2xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white font-semibold text-sm shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Verifying &amp; Submitting...</span>
            </>
          ) : (
            <span>Submit Sanitation Report</span>
          )}
        </button>
      </form>
    </div>
  );
};
