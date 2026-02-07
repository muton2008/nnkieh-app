"use client";

import {
  Home,
  CalendarDays,
  Train,
  BookOpen,
  Megaphone,
  Settings,
} from "lucide-react";
import { TabId } from "@/lib/types/common";

const TABS: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "首頁", icon: Home },
  { id: "timetable", label: "課表", icon: BookOpen },
  { id: "transport", label: "交通", icon: Train },
  { id: "calendar", label: "行事曆", icon: CalendarDays },
  { id: "news", label: "公告", icon: Megaphone },
];

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[450px] bg-card/95 backdrop-blur-sm border-t border-border"
      style={{ zIndex: 50 }}
      role="tablist"
      aria-label="主導覽列"
    >
      <div className="flex items-center justify-around px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors duration-200 ${
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              <Icon
                size={20}
                strokeWidth={isActive ? 2 : 1.5}
                className="transition-all duration-200"
              />
              <span
                className={`text-[10px] leading-tight tracking-wide transition-all duration-200 ${
                  isActive ? "font-medium" : "font-light"
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <span className="block w-1 h-1 rounded-full bg-foreground mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
