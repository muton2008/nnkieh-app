"use client";

//by  ai
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getAdminSession } from "@/lib/api-client";
import type { AdminSession } from "@/lib/types/calendar";

// --- Types ---

interface AdminContextValue {
  /** 當前是否處於管理模式 */
  isAdminMode: boolean;
  /** 當前管理員 Session（null 代表無授權） */
  session: AdminSession | null;
  /** 開啟管理模式（寫入 sessionStorage） */
  enableAdminMode: (session: AdminSession) => void;
  /** 關閉管理模式 */
  disableAdminMode: () => void;
  /** 強制重新從 sessionStorage 載入 */
  refreshSession: () => void;
}

// --- Context ---

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within <AdminProvider>");
  return ctx;
}

// --- Provider ---

interface AdminProviderProps {
  children: ReactNode;
}

export function AdminProvider({ children }: AdminProviderProps) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);

  // 初始化：從 sessionStorage 載入
  useEffect(() => {
    const existing = getAdminSession();
    if (existing) {
      setSession(existing);
      setIsAdminMode(true);
    }
  }, []);

  // 定時檢查 session 是否過期（每 30 秒）
  useEffect(() => {
    if (!isAdminMode) return;

    const timer = setInterval(() => {
      const current = getAdminSession();
      if (!current) {
        setSession(null);
        setIsAdminMode(false);
      }
    }, 30_000);

    return () => clearInterval(timer);
  }, [isAdminMode]);

  const enableAdminMode = useCallback((newSession: AdminSession) => {
    sessionStorage.setItem("admin_session", JSON.stringify(newSession));
    setSession(newSession);
    setIsAdminMode(true);
  }, []);

  const disableAdminMode = useCallback(() => {
    sessionStorage.removeItem("admin_session");
    setSession(null);
    setIsAdminMode(false);
  }, []);

  const refreshSession = useCallback(() => {
    const current = getAdminSession();
    if (current) {
      setSession(current);
      setIsAdminMode(true);
    } else {
      setSession(null);
      setIsAdminMode(false);
    }
  }, []);

  return (
    <AdminContext.Provider
      value={{ isAdminMode, session, enableAdminMode, disableAdminMode, refreshSession }}
    >
      {children}
    </AdminContext.Provider>
  );
}
