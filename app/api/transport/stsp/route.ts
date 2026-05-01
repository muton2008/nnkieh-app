import { NextResponse } from 'next/server';
import type { STSPBusInfo } from '@/lib/types/transport';
import type { TransportSTSPResponse } from '@/lib/types/api';

const CACHE_TTL_MS = 60_000;
const STSP_TIMEOUT_MS = 25_000;

const DEFAULT_STSP_BUSES: Record<string, STSPBusInfo[]> = {};

let cachedResponse: TransportSTSPResponse | null = null;
let cachedAt = 0;

async function getNewSTSPBusData(): Promise<Record<string, STSPBusInfo[]>> {
  const url = 'https://nnkieh-app-stsp.allenyellow11.workers.dev/';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STSP_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`STSP proxy API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, STSPBusInfo[]>;
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSTSPData(raw: Record<string, STSPBusInfo[]>): Record<string, STSPBusInfo[]> {
  const normalized: Record<string, STSPBusInfo[]> = {};

  for (const [stopName, buses] of Object.entries(raw ?? {})) {
    if (!Array.isArray(buses)) continue;
    normalized[stopName] = buses;
  }

  return normalized;
}

export async function GET() {
  if (cachedResponse && Date.now() - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedResponse, {
      headers: { 'Cache-Control': 'no-store', 'X-Cache': 'HIT' },
    });
  }

  try {
    const stspRaw = await getSTSPBusData();
    const responseData: TransportSTSPResponse = {
      STSP_buses: normalizeSTSPData(stspRaw),
      updated_at: new Date().toISOString(),
    };

    // 成功時正常寫入快取 (60秒)
    cachedResponse = responseData;
    cachedAt = Date.now();

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('STSP Transport API Error:', error);

    // 發生錯誤，若有舊資料則當作擋箭牌 (30秒過期)，避免連續被打爆
    if (cachedResponse) {
      cachedAt = Date.now() - (CACHE_TTL_MS / 2);
      return NextResponse.json(cachedResponse, {
        status: 200, 
        headers: { 'Cache-Control': 'no-store', 'X-Cache': 'STALE' }
      });
    }

    // 連舊資料都沒有的話，只給 30 秒空資料冷卻
    cachedAt = Date.now() - (CACHE_TTL_MS / 2);
    return NextResponse.json(
      {
        STSP_buses: DEFAULT_STSP_BUSES,
        updated_at: new Date().toISOString(),
      } satisfies TransportSTSPResponse,
      { 
        status: 503, // 真的是第一次拿資料還拿到錯誤，才吐給前端 503
        headers: { 'Cache-Control': 'no-store', 'X-Cache': 'ERROR' } 
      }
    );
  }
}



// 已停用，外國IP無法連線，目前改用 Cloudflare Worker 代理
async function getSTSPBusData(): Promise<Record<string, STSPBusInfo[]>> {
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const url = "https://atis.stsp.gov.tw/STSPapi/api/bus/getStopRouteDynamicInfoByStopnameByLang?$format=json";
    
    const TARGET_STOPS = ["南科實中", "民生水塔", "台鐵南科站"];
    const AUTH_TOKEN = "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" //public token
    
    // 指定要保留的路線關鍵字
    const WANTED_ROUTES = ["紅線", "藍線", "橘線", "實中線", "LM線"];

    // 初始化回傳容器
    const finalData: Record<string, STSPBusInfo[]> = {};

    const fetchPromises = TARGET_STOPS.map(async (stopName) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Authorization': AUTH_TOKEN,
            'Origin': 'https://atis.stsp.gov.tw',
            'Referer': 'https://atis.stsp.gov.tw/businfo',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
          },
          body: JSON.stringify({ stopName: stopName, language: "ZH" }),
          cache: 'no-store',
        });

        if (!res.ok) {
          console.error(`STSP API Error for ${stopName}:`, res);
          finalData[stopName] = [];
          return [];
        }

        const json = await res.json();
        const allRoutes = json.routes || [];

        const getEtaText = (type: string, time: string) => {
          if (type === "0") return "正常狀態";
          if (type === "1") return "尚未發車";
          if (type === "2") return "交管不停靠";
          if (type === "3") return "末班車已過";
          if (type === "4") return "今日未營運";
          if (type === "5") return "即將到站";
          if (type === "6") return time; 
          return time || type;
        };

        const filtered = allRoutes
          .filter((r: any) => {
            const isWanted = WANTED_ROUTES.some(name => r.routeName.includes(name));
            return isWanted;
          })
          .map((r: any) => {
            const etaText = getEtaText(r.estimateTimeType, r.estimateTime);
            return {
              route: `${r.routeName} (${r.subRouteName})`,
              destination: r.destination,
              eta: etaText,
              // 獨立的內部權重邏輯，越小越優先
              _sortWeight: r.estimateTimeType === "5" ? 0 :
                           r.estimateTimeType === "6" ? (parseInt(r.estimateTime) || 100) :
                           r.estimateTimeType === "1" ? 200 :
                           r.estimateTimeType === "0" ? 300 : 1000
            };
          })
          // 依抵達時間排序
          .sort((a: any, b: any) => a._sortWeight - b._sortWeight)
          // 每個站點僅取前 3 班
          .slice(0, 3)
          // 移除內部的排序權重欄位
          .map(({ _sortWeight, ...info }: any) => info as STSPBusInfo);

        finalData[stopName] = filtered;

      } catch (e) {
        console.error(`Fetch error for ${stopName}:`, e);
        finalData[stopName] = [];
      }
    });

    await Promise.all(fetchPromises);
    return finalData;

  } catch (error) {
    console.error("STSP Bus Total Error:", error);
    return {};
  }
}