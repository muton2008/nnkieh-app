"use client";

import { useState, useEffect } from "react";
import { BottomNav, type TabId } from "@/components/bottom-nav";
import { HomePage } from "@/components/home-page";
import { TimetablePage } from "@/components/timetable-page";
import { TransportPage } from "@/components/transport-page";
import { CalendarPage } from "@/components/calendar-page";
import { NewsPage } from "@/components/news-page";

// UUID generation function
function generateUUID(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Device UUID identification
  useEffect(() => {
    let id = localStorage.getItem("device_id");
    if (!id) {
      id = generateUUID();
      localStorage.setItem("device_id", id);
    }
    setDeviceId(id);
  }, []);

  const renderPage = () => {
    switch (activeTab) {
      case "home":
        return <HomePage onNavigate={setActiveTab} />;
      case "timetable":
        return <TimetablePage />;
      case "transport":
        return <TransportPage />;
      case "calendar":
        return <CalendarPage />;
      case "news":
        return <NewsPage />;
      default:
        return <HomePage onNavigate={setActiveTab} />;
    }
  };

  return (
    <main className="min-h-screen flex flex-col relative">
      <div className="flex-1">{renderPage()}</div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  );
}
