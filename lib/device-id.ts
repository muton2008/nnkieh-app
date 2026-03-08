/**
 * 裝置識別碼生成與註冊
 * 支援 Web / PWA / Capacitor Native (iOS & Android)
 *
 * 生成格式為標準 UUID v4（相容 Supabase uuid 欄位型態）
 * 使用 crypto.getRandomValues() 確保更強的隨機性
 *
 * 流程:
 *   1. 若 localStorage 已有 device_id → 直接使用（已註冊過）
 *   2. 若無 → 生成 UUID → 向 Server 註冊
 *      - 註冊成功 → 寫入 localStorage → 回傳
 *      - 衝突（極低機率）→ 重新生成 → 重試（最多 3 次）
 */

import { registerDevice } from "@/lib/api-client";

const STORAGE_KEY = "device_id";
const MAX_REGISTER_RETRIES = 3;

// ─── 生成邏輯 ───

/**
 * 以 crypto.getRandomValues 產生符合 RFC 4122 的 UUID v4。
 * 相較舊版 Math.random()，使用 CSPRNG 確保 122-bit 有效隨機熵。
 * 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx （相容 Supabase uuid 欄位）
 */
export function generateSecureUUIDv4(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);

  // 設定 version = 4 (第 7 byte 高 4 bit)
  buf[6] = (buf[6] & 0x0f) | 0x40;
  // 設定 variant = RFC 4122 (第 9 byte 高 2 bit = 10)
  buf[8] = (buf[8] & 0x3f) | 0x80;

  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

// ─── 註冊 / 初始化流程 ───

/**
 * 取得已註冊的 Device ID，若尚未註冊則自動生成並向 Server 註冊。
 * @returns 已成功註冊的 device_id（標準 UUID 格式）
 */
export async function getOrRegisterDeviceId(): Promise<string> {
  // 向下相容：舊版 UUID 格式 (e.g. "09fcc7ce-ea12-4ac4-b454-fffe792a0c95")
  // 已存在於 localStorage 和資料庫中，直接沿用，不重新生成也不走註冊流程
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  // 生成 → 註冊
  for (let attempt = 0; attempt < MAX_REGISTER_RETRIES; attempt++) {
    const newId = generateSecureUUIDv4();
    try {
      const result = await registerDevice(newId);
      if (result.success) {
        localStorage.setItem(STORAGE_KEY, newId);
        return newId;
      }
      // conflict — 重新生成
      console.warn(`Device ID 衝突 (attempt ${attempt + 1})，重新生成…`);
    } catch (err) {
      // 網路錯誤 — 離線情境：先寫入本地，下次上線再同步
      console.error("裝置註冊失敗，暫時使用本地 ID:", err);
      localStorage.setItem(STORAGE_KEY, newId);
      return newId;
    }
  }

  // 極端情況：重試耗盡，仍寫入本地避免無限載入
  const fallbackId = generateSecureUUIDv4();
  localStorage.setItem(STORAGE_KEY, fallbackId);
  return fallbackId;
}
