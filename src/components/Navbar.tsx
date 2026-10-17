import React from 'react';
import { ShieldCheck, LogIn, LogOut, User } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import type { UserProfile } from '../types/index.ts';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  currentUser: UserProfile | null;
  onSignIn: () => void;
  onSignOut: () => void;
  isAuthenticating: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  onSignIn,
  onSignOut,
  isAuthenticating,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand wordmark */}
        <button
          onClick={() => onSelectTab('report')}
          className="flex items-center gap-2 text-left focus:outline-none"
        >
          <div className="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center text-white shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            CleanWard
          </span>
        </button>

        {/* Zone 2: Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => onSelectTab('report')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
              currentTab === 'report' ? 'text-emerald-700 font-semibold' : ''
            }`}
          >
            Report Issue
          </button>
          <button
            onClick={() => onSelectTab('track')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
              currentTab === 'track' ? 'text-emerald-700 font-semibold' : ''
            }`}
          >
            Track Status
          </button>
          <button
            onClick={() => onSelectTab('scoreboard')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
              currentTab === 'scoreboard' ? 'text-emerald-700 font-semibold' : ''
            }`}
          >
            Ward Scoreboard
          </button>
          <button
            onClick={() => onSelectTab('officer')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
              currentTab === 'officer' || currentTab === 'admin'
                ? 'text-emerald-700 font-semibold'
                : ''
            }`}
          >
            {currentUser?.role === 'admin' ? 'Officer & Admin' : 'Officer Portal'}
          </button>
        </nav>

        {/* Zone 3: PWA Install and User Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton />

          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-900 truncate max-w-[120px]">
                  {currentUser.email.split('@')[0]}
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700">
                  {currentUser.role}
                </span>
              </div>
              <button
                onClick={onSignOut}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              disabled={isAuthenticating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isAuthenticating ? 'Signing in...' : 'Officer Login'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
