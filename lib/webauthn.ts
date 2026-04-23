import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_ORIGIN = "http://localhost:3000";
const DEFAULT_RP_ID = "localhost";
const DEFAULT_RP_NAME = "NNKIEH App";

function getUrlFromEnv(): URL | null {
  const raw = process.env.WEBAUTHN_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_ORIGIN;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function getWebAuthnOrigin(): string {
  const explicit = process.env.WEBAUTHN_ORIGIN?.trim();
  if (explicit) return explicit;
  const fromEnv = getUrlFromEnv();
  return fromEnv?.origin || DEFAULT_ORIGIN;
}

export function getWebAuthnRpID(): string {
  const explicit = process.env.WEBAUTHN_RP_ID?.trim();
  if (explicit) return explicit;
  const fromEnv = getUrlFromEnv();
  return fromEnv?.hostname || DEFAULT_RP_ID;
}

export function getWebAuthnRpName(): string {
  return process.env.WEBAUTHN_RP_NAME?.trim() || DEFAULT_RP_NAME;
}

export function toBase64URL(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function fromBase64URL(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(value, "base64url")) as Uint8Array<ArrayBuffer>;
}

const TRANSPORTS = new Set<AuthenticatorTransportFuture>([
  "ble",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

export function normalizeTransports(value: unknown): AuthenticatorTransportFuture[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is AuthenticatorTransportFuture => {
    return typeof item === "string" && TRANSPORTS.has(item as AuthenticatorTransportFuture);
  });
  return items.length > 0 ? items : undefined;
}

export function challengeExpiresAt(minutes = 5): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function isChallengeIssueRateLimited(
  supabase: SupabaseClient,
  adminDeviceId: string,
  type: "registration" | "authentication" | "pending_list" | "request_create",
  minIntervalMs = 5_000
): Promise<boolean> {
  const { data } = await supabase
    .from("webauthn_challenges")
    .select("created_at")
    .eq("admin_device_id", adminDeviceId)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(1);

  const createdAt = data?.[0]?.created_at;
  if (!createdAt) return false;

  return Date.now() - new Date(createdAt).getTime() < minIntervalMs;
}
