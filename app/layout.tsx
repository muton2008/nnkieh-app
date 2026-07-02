import React from "react"
import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";

import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { CapacitorInit } from "@/components/capacitor-init";
import { AppIconSync } from "@/components/app-icon-sync";
import { Toaster } from "@/components/ui/toaster";

const notoSans = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-sans",
});

const notoSerif = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "校園生活助手 | 南科實中",
  description:
    "南科實中校園生活助手 - 課表、交通、行事曆、公告一站掌握",

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "校園生活助手",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF8F5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",  // 支援 iOS 瀏海 / Dynamic Island
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className={`${notoSans.variable} ${notoSerif.variable}`}>
      <body className="font-sans antialiased desktop-shell min-h-screen safe-area-all">
      <ServiceWorkerRegister />
      <CapacitorInit />
      <AppIconSync />
        <div className="mx-auto max-w-[450px] min-h-screen bg-background relative shadow-sm">
          {children}
        </div>
        <Toaster />
      </body>
    </html>
  );
}
