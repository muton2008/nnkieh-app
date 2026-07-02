import { Capacitor, registerPlugin } from "@capacitor/core";

export const APP_ICON_VARIANTS = ["A", "B", "C"] as const;

export type AppIconVariant = (typeof APP_ICON_VARIANTS)[number];

const APP_ICON_STORAGE_KEY = "app_icon_variant";
const DEFAULT_APP_ICON_VARIANT: AppIconVariant = "C";

const APP_ICON_FILES = {
  favicon16: "favicon-16x16.png",
  favicon32: "favicon-32x32.png",
  favicon48: "favicon-48x48.png",
  favicon180: "favicon-180x180.png",
  favicon192: "favicon-192x192.png",
  favicon512: "favicon-512x512.png",
  appleTouchIcon: "apple-touch-icon.png",
  manifest: "site.webmanifest",
} as const;

interface AppIconPlugin {
  setIcon(options: { icon: AppIconVariant }): Promise<{ success: boolean; icon: AppIconVariant }>;
  getIcon(): Promise<{ icon: AppIconVariant }>;
}

const AppIcon = registerPlugin<AppIconPlugin>("AppIcon");

export function normalizeAppIconVariant(raw: unknown): AppIconVariant {
  return raw === "A" || raw === "B" || raw === "C" ? raw : DEFAULT_APP_ICON_VARIANT;
}

export function getAppIconVariantFromStorage(): AppIconVariant {
  if (typeof window === "undefined") return DEFAULT_APP_ICON_VARIANT;

  try {
    return normalizeAppIconVariant(localStorage.getItem(APP_ICON_STORAGE_KEY));
  } catch {
    return DEFAULT_APP_ICON_VARIANT;
  }
}

export function setAppIconVariantInStorage(variant: AppIconVariant): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(APP_ICON_STORAGE_KEY, variant);
}

export async function syncAppIconVariant(variant: AppIconVariant): Promise<void> {
  setAppIconVariantInStorage(variant);

  if (typeof document !== "undefined") {
    applyAppIconVariant(variant);
  }

  if (!Capacitor.isNativePlatform()) return;

  try {
    await AppIcon.setIcon({ icon: variant });
  } catch (error) {
    console.warn("[AppIcon] Failed to sync native app icon:", error);
  }
}

export async function syncAppIconVariantFromStorage(): Promise<void> {
  await syncAppIconVariant(getAppIconVariantFromStorage());
}

export function getAppIconBasePath(variant: AppIconVariant): string {
  return `/NK-app-${variant}`;
}

export function getAppIconHref(variant: AppIconVariant, file: keyof typeof APP_ICON_FILES): string {
  return `${getAppIconBasePath(variant)}/${APP_ICON_FILES[file]}`;
}

function upsertIconLink(rel: string, href: string, attrs: Record<string, string>) {
  const size = attrs.sizes ?? "";
  const existing = size
    ? document.head.querySelector(
        `link[data-app-icon-managed=\"true\"][rel=\"${rel}\"][data-app-icon-size=\"${size}\"]`
      )
    : document.head.querySelector(`link[data-app-icon-managed=\"true\"][rel=\"${rel}\"]:not([data-app-icon-size])`);
  const link = existing ?? document.createElement("link");

  link.setAttribute("rel", rel);
  link.setAttribute("href", href);
  Object.entries(attrs).forEach(([key, value]) => link.setAttribute(key, value));
  link.setAttribute("data-app-icon-managed", "true");
  if (size) {
    link.setAttribute("data-app-icon-size", size);
  } else {
    link.removeAttribute("data-app-icon-size");
  }

  if (!existing) {
    document.head.appendChild(link);
  }
}

export function applyAppIconVariant(variant: AppIconVariant): void {
  if (typeof document === "undefined") return;

  const basePath = getAppIconBasePath(variant);

  upsertIconLink("icon", `${basePath}/${APP_ICON_FILES.favicon16}`, { sizes: "16x16", type: "image/png" });
  upsertIconLink("icon", `${basePath}/${APP_ICON_FILES.favicon32}`, { sizes: "32x32", type: "image/png" });
  upsertIconLink("icon", `${basePath}/${APP_ICON_FILES.favicon48}`, { sizes: "48x48", type: "image/png" });
  upsertIconLink("icon", `${basePath}/${APP_ICON_FILES.favicon192}`, { sizes: "192x192", type: "image/png" });
  upsertIconLink("icon", `${basePath}/${APP_ICON_FILES.favicon512}`, { sizes: "512x512", type: "image/png" });
  upsertIconLink("apple-touch-icon", `${basePath}/${APP_ICON_FILES.appleTouchIcon}`, { sizes: "180x180" });
  upsertIconLink("manifest", `${basePath}/${APP_ICON_FILES.manifest}`, {});
}

export function setAppIconVariant(variant: AppIconVariant): void {
  void syncAppIconVariant(variant);
}