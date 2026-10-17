import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from './lib/firebase.ts';
import { Navbar } from './components/Navbar.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { ReportPage } from './pages/ReportPage.tsx';
import { TrackPage } from './pages/TrackPage.tsx';
import { OfficerDashboard } from './pages/OfficerDashboard.tsx';
import { ScoreboardPage } from './pages/ScoreboardPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';
import { initializeDefaultConfigAndWards, getWards } from './services/wardService.ts';
import type { UserProfile, Ward } from './types/index.ts';
import { ShieldCheck, WifiOff, LogIn } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('report');
  const [trackReportId, setTrackReportId] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [wards, setWards] = useState<Ward[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Network connectivity status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Hash-based routing synchronization
  useEffect(() => {
    const parseHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('track=')) {
        const id = hash.replace('track=', '');
        setTrackReportId(id);
        setCurrentTab('track');
      } else if (hash.startsWith('track/')) {
        const id = hash.replace('track/', '');
        setTrackReportId(id);
        setCurrentTab('track');
      } else if (['report', 'track', 'scoreboard', 'officer', 'admin'].includes(hash)) {
        setCurrentTab(hash);
      }
    };

    parseHash();
    window.addEventListener('hashchange', parseHash);
    return () => window.removeEventListener('hashchange', parseHash);
  }, []);

  const navigateToTab = (tab: string) => {
    setCurrentTab(tab);
    if (tab === 'track' && trackReportId) {
      window.location.hash = `track=${trackReportId}`;
    } else {
      window.location.hash = tab;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToTrackWithId = (id: string) => {
    setTrackReportId(id);
    setCurrentTab('track');
    window.location.hash = `track=${id}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Initialize DB and bootstrap admin / sample wards on mount
  useEffect(() => {
    async function init() {
      await initializeDefaultConfigAndWards();
      const loadedWards = await getWards();
      setWards(loadedWards);
    }
    init();
  }, []);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
      if (!user) {
        setCurrentUser(null);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userDocRef);

        const email = user.email || '';
        // Bootstrapped admin
        const isMasterAdmin = email.toLowerCase() === 'dps.priyanshu6@gmail.com';

        if (snap.exists()) {
          const data = snap.data();
          setCurrentUser({
            uid: user.uid,
            email,
            role: isMasterAdmin ? 'admin' : (data.role || 'officer'),
            wardId: data.wardId || '',
          });
        } else {
          // New user profile creation
          const initialRole = isMasterAdmin ? 'admin' : 'officer';
          const newProfile = {
            email,
            role: initialRole,
            wardId: wards.length > 0 ? wards[0].id : '',
            updatedAt: serverTimestamp(),
          };
          await setDoc(userDocRef, newProfile);
          setCurrentUser({
            uid: user.uid,
            email,
            role: initialRole,
            wardId: newProfile.wardId,
          });
        }
      } catch (err) {
        console.error('Error fetching user profile:', err);
        // Fallback session state
        setCurrentUser({
          uid: user.uid,
          email: user.email || '',
          role: user.email?.toLowerCase() === 'dps.priyanshu6@gmail.com' ? 'admin' : 'officer',
        });
      }
    });

    return () => unsubscribe();
  }, [wards]);

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      if (currentTab === 'officer' || currentTab === 'admin') {
        navigateToTab('report');
      }
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-900 selection:bg-emerald-500 selection:text-white">
      {/* Offline Connectivity Toast */}
      {!isOnline && (
        <div className="sticky top-0 z-50 bg-amber-600 text-white text-xs font-semibold px-4 py-2 flex items-center justify-center gap-2 shadow-sm">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Offline Mode — Cached app shell running. Reconnect for live synchronization.</span>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={navigateToTab}
        currentUser={currentUser}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        isAuthenticating={isAuthenticating}
      />

      {/* Page Content */}
      <main className="flex-1">
        {currentTab === 'report' && (
          <ReportPage onNavigateToTrack={navigateToTrackWithId} />
        )}

        {currentTab === 'track' && (
          <TrackPage
            initialReportId={trackReportId}
            onSelectReportId={(id) => setTrackReportId(id)}
          />
        )}

        {currentTab === 'scoreboard' && <ScoreboardPage />}

        {currentTab === 'officer' && (
          currentUser ? (
            <OfficerDashboard currentUser={currentUser} wards={wards} />
          ) : (
            <div className="max-w-md mx-auto px-4 py-16 text-center">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Officer &amp; Administration Portal
              </h2>
              <p className="text-xs text-slate-600 mt-2 mb-6 leading-relaxed">
                Authorized access for municipal ward sanitation officers and commissioners. Sign in with your registered Google account to triage cases.
              </p>
              <button
                onClick={handleSignIn}
                disabled={isAuthenticating}
                className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-semibold shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>{isAuthenticating ? 'Connecting...' : 'Sign In with Google'}</span>
              </button>
            </div>
          )
        )}

        {currentTab === 'admin' && (
          currentUser?.role === 'admin' ? (
            <AdminPage currentUser={currentUser} />
          ) : (
            <div className="max-w-md mx-auto px-4 py-16 text-center">
              <h2 className="text-lg font-bold text-slate-900">
                Administrator Access Required
              </h2>
              <p className="text-xs text-slate-600 mt-2">
                This page is restricted to municipal administrators.
              </p>
              <button
                onClick={() => navigateToTab('report')}
                className="mt-4 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl"
              >
                Return to Report Page
              </button>
            </div>
          )
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">CleanWard</span>
            <span>·</span>
            <span>Civic Sanitation &amp; Waste Management</span>
            <span>·</span>
            <span className="text-[11px] text-slate-400">Complements Swachhata Initiative</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <button
              onClick={() => navigateToTab('scoreboard')}
              className="hover:text-slate-900 transition"
            >
              Public Scoreboard
            </button>
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => navigateToTab('admin')}
                className="text-purple-700 font-semibold hover:text-purple-900 transition"
              >
                Admin Console
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Bottom Navigation for Mobile */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={navigateToTab}
        isOfficerOrAdmin={currentUser != null}
      />
    </div>
  );
}
