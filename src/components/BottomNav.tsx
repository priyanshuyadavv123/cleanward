import React from 'react';
import { Camera, Search, BarChart3, Briefcase } from 'lucide-react';

interface BottomNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOfficerOrAdmin: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  isOfficerOrAdmin,
}) => {
  const tabs = [
    { id: 'report', label: 'Report', icon: Camera },
    { id: 'track', label: 'Track', icon: Search },
    { id: 'scoreboard', label: 'Scoreboard', icon: BarChart3 },
    {
      id: isOfficerOrAdmin ? 'officer' : 'officer-login',
      label: isOfficerOrAdmin ? 'Officer' : 'Login',
      icon: Briefcase,
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe">
      <div className="grid grid-cols-4 items-center h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            currentTab === tab.id ||
            (tab.id === 'officer' && (currentTab === 'officer' || currentTab === 'admin')) ||
            (tab.id === 'officer-login' && currentTab === 'officer');

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id === 'officer-login' ? 'officer' : tab.id)}
              className="flex flex-col items-center justify-center min-h-[48px] text-slate-500 hover:text-slate-900 transition-colors"
              aria-label={tab.label}
            >
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive ? 'text-emerald-700 bg-emerald-50' : ''
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span
                className={`text-[10px] font-medium tracking-tight mt-0.5 ${
                  isActive ? 'text-emerald-700 font-bold' : 'text-slate-500'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
