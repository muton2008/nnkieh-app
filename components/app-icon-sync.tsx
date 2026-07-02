"use client";

import { useEffect } from "react";
import { syncAppIconVariantFromStorage } from "@/lib/app-icon";

export function AppIconSync() {
  useEffect(() => {
    void syncAppIconVariantFromStorage();
  }, []);

  return null;
}