import { NextResponse } from 'next/server';
import { getTDXToken } from '@/lib/tdx';
import { TrainInfo, DirectionInfo, BusInfo, YouBikeData, YouBikeStation, STSPBusInfo, STSP_TARGET_STOPS } from '@/lib/types/transport';
import type { TransportDataResponse } from '@/lib/types/api';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Server-side in-memory cache
const CACHE_TTL_MS = 60_000;
let cachedResponse: TransportDataResponse | null = null;
let cachedAt = 0;

async function getTrain(headers: Record<string, string>): Promise<{ north: TrainInfo[]; south: TrainInfo[] }> {
  const url = "https://tdx.transportdata.tw/api/basic/v2/Rail/TRA/LiveBoard/Station/4180";
  const res = await fetch(url, {
    headers,
    cache: 'no-store'
  });
  
  if (!res.ok) throw new Error(`TRA API Error: ${res.status} ${res.statusText}`);
  
  const data = await res.json();
  
  const uniqueMap = new Map();
  data.forEach((item: any) => {
    uniqueMap.set(item.TrainNo, item);
  });

  const north: TrainInfo[] = [];
  const south: TrainInfo[] = [];

  uniqueMap.forEach((item) => {
    const delay = item.DelayTime || 0;
    const statusText = delay <= 0 ? "準點" : `晚 ${delay} 分`;

    const trainData: TrainInfo = {
      id: item.TrainNo,
      type: item.TrainTypeName.Zh_tw.replace("車", ""), 
      destination: item.EndingStationName.Zh_tw,
      departure: item.ScheduledDepartureTime.substring(0, 5),
      status: statusText
    };

    if (item.Direction === 0) {
      north.push(trainData);
    } else {
      south.push(trainData);
    }
  });

  const sortByTime = (a: TrainInfo, b: TrainInfo) => a.departure.localeCompare(b.departure);
  north.sort(sortByTime);
  south.sort(sortByTime);

  return { north, south };
}

async function getSTSPBusData(): Promise<TransportDataResponse["STSP_buses"]> {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const url = "https://itsapi.stsp.gov.tw/STSPapi/api/bus/getStopRouteDynamicInfoByStopnameByLang?$format=json";
  
  const AUTH_TOKEN = "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" //public token
  
  // 指定要保留的路線關鍵字
  const WANTED_ROUTES = ["紅線", "藍線", "橘線", "實中線", "LM線"];

  // 建立 proxy 池，失敗時輪換
  const PROXY_POOL = [
    'http://34.81.160.132:80',
    'http://203.69.23.34:443',
    'http://211.72.142.231:443',
    'http://180.218.97.121:80',

  ];

  // 初始化回傳容器
  const finalData: Record<string, STSPBusInfo[]> = {};

  const fetchPromises = STSP_TARGET_STOPS.map(async (stopName) => {
    let json = null;

    // 嘗試輪換 proxy
    for (const proxyUrl of PROXY_POOL) {
      try {
        const proxyAgent = new HttpsProxyAgent(proxyUrl);
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
          agent: proxyAgent,
        } as RequestInit & { agent: any });

        if (res.ok) {
          json = await res.json();
          break; // 成功取得資料，跳出迴圈
        } else {
          console.warn(`STSP API Error for ${stopName} using proxy ${proxyUrl}:`, res.status);
        }
      } catch (e) {
        console.warn(`Proxy ${proxyUrl} failed for ${stopName}:`, e);
      }
    }

    if (!json) {
      console.error(`All proxies failed for STSP API: ${stopName}`);
      finalData[stopName] = [];
      return;
    }

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

      finalData[stopName] = filtered as STSPBusInfo[];
  });

  await Promise.all(fetchPromises);
  return finalData as TransportDataResponse["STSP_buses"];
}

async function getNewSTSPBusData(): Promise<TransportDataResponse["STSP_buses"]> {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const url = "https://itsapi.stsp.gov.tw/STSPapi/api/bus/getStopRouteDynamicInfoByStopnameByLang?$format=json";

  const AUTH_TOKEN = "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF"; // public token

  // 指定要保留的路線關鍵字
  const WANTED_ROUTES = ["紅線", "藍線", "橘線", "實中線", "LM線"];

  // 初始化回傳容器
  const finalData: Record<string, STSPBusInfo[]> = {};

  const fetchPromises = STSP_TARGET_STOPS.map(async (stopName) => {
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
        body: JSON.stringify({ stopName, language: "ZH" }),
        cache: 'no-store',
      });

      if (!res.ok) {
        console.warn(`STSP API Error for ${stopName}:`, res.status);
        finalData[stopName] = [];
        return;
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
        .filter((r: any) => WANTED_ROUTES.some(name => r.routeName.includes(name)))
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

      finalData[stopName] = filtered as STSPBusInfo[];
    } catch (error) {
      console.warn(`STSP API request failed for ${stopName}:`, error);
      finalData[stopName] = [];
    }
  });

  await Promise.all(fetchPromises);
  return finalData as TransportDataResponse["STSP_buses"];
}

async function getBus(headers: Record<string, string>): Promise<TransportDataResponse["buses"]> {
  const TARGET_ROUTES = ["綠2", "綠3", "橘12", "橘14"];
  const TARGET_STOPS = ["南科實中", "民生水塔"];

  const rFilter = TARGET_ROUTES.map(r => `RouteName/Zh_tw eq '${r}'`).join(' or ');
  const sFilter = TARGET_STOPS.map(s => `contains(StopName/Zh_tw, '${s}')`).join(' or ');
  const filter = `(${rFilter}) and (${sFilter})`;
  const select = "RouteID,SubRouteID,Direction,StopID,RouteName,StopName,EstimateTime,StopStatus,SubRouteName";

  const url = `https://tdx.transportdata.tw/api/basic/v3/Bus/EstimatedTimeOfArrival/City/Tainan?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}&$format=JSON`;

  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`Bus API Error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const rawData = data.N1Datas || [];
  const routeMap = new Map<string, BusInfo>();

  rawData.forEach((item: any) => {
    const name = item.RouteName?.Zh_tw || "未知路線";
    const status = item.StopStatus;
    const time = item.EstimateTime;
    
    let etaText = "";
    if (time !== undefined && time !== null && time > 60) {
      etaText = `${Math.floor(time / 60)} 分`;
    } else if (time !== undefined && time !== null && time >= 0 && ( status === 1 || status === 0)) {
      if (status === 1) {
        etaText = "未發車";
      } else {
        etaText = "進站中";
      }
    } else {
      if (status === 1) etaText = "未發車";
      else if (status === 2) etaText = "交管不停";
      else if (status === 3) etaText = "末班已過";
      else if (status === 4) etaText = "今日停駛";
      else {
        console.warn("未知的公車狀態:", status, "秒數:", time);
        etaText = "查詢中";
      }
    }

    let dest = "未知";
    const subName = item.SubRouteName?.Zh_tw || "";
    
    if (subName.includes('→')) {
      dest = subName.split('→').pop()?.trim() || "未知";
    } else if (subName) {
      dest = subName.trim();
    } else {
      dest = name; 
    }

    const dirInfo: DirectionInfo = {
      id: `${item.RouteID}-${item.SubRouteID}-${item.Direction}-${item.StopID}`,
      subRouteName: subName || name,
      destination: dest,
      eta: etaText,
      status: status
    };

    if (!routeMap.has(name)) {
      routeMap.set(name, { routeName: name, outbound: [], inbound: [] });
    }
    const current = routeMap.get(name)!;
    if (item.Direction === 0) current.outbound.push(dirInfo);
    else current.inbound.push(dirInfo);
  });

  return Array.from(routeMap.values()).map(route => {
    const parseEta = (s: string) => {
      if (s === "進站中") return -1;
      const n = parseInt(s);
      if (isNaN(n)) return 999;
      return n;
    };
    route.outbound.sort((a, b) => parseEta(a.eta) - parseEta(b.eta));
    route.inbound.sort((a, b) => parseEta(a.eta) - parseEta(b.eta));
    return route;
  });
}

async function getYouBike(headers: Record<string, string>): Promise<TransportDataResponse["youbike"]> {
  const STATIONS = [
    { id: "501330008", name: "南科實中國中部" },
    { id: "501330010", name: "民生水塔" },
    { id: "501330004", name: "社區中心" },
    { id: "501328006", name: "南科火車站" },
  ];

  const stationIds = STATIONS.map(s => `StationID eq '${s.id}'`).join(' or ');
  const url = `https://tdx.transportdata.tw/api/basic/v2/Bike/Availability/City/Tainan?$filter=${encodeURIComponent(stationIds)}&$format=JSON`;

  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`TDX YouBike API Error: ${res.status} ${res.statusText}`);

  const data: YouBikeData[] = await res.json();
  const dataMap = new Map(data.map((item: any) => [item.StationID, item]));

  return STATIONS.map(s => {
    const liveData = dataMap.get(s.id);
    if (!liveData) {
      return { id: s.id, name: s.name, available: 0, empty: 0, total: 0 };
    }

    const available = liveData.AvailableRentBikes || 0;
    const empty = liveData.AvailableReturnBikes || 0;

    return {
      name: s.name,
      available: available,
      empty: empty,
      total: available + empty
    };
  });
}

export async function GET() {
  // 快取有效 → 直接回傳
  if (cachedResponse && Date.now() - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedResponse, {
      headers: { 'Cache-Control': 'no-store', 'X-Cache': 'HIT' }
    });
  }

  try {
    const tdxToken = await getTDXToken();
    const headers = {
      'Authorization': `Bearer ${tdxToken}`,
    };

    const results = await Promise.allSettled([
      getTrain(headers),
      getBus(headers),
      getYouBike(headers),
      getNewSTSPBusData()
    ]);

    const trainData = results[0].status === 'fulfilled' ? results[0].value 
      : (cachedResponse ? { south: cachedResponse.trains_south, north: cachedResponse.trains_north } : { south: [], north: [] });
      
    const busData = results[1].status === 'fulfilled' ? results[1].value 
      : (cachedResponse ? cachedResponse.buses : []);

    const youbikeData = results[2].status === 'fulfilled' ? results[2].value 
      : (cachedResponse ? cachedResponse.youbike : []);

    const stspData = results[3].status === 'fulfilled' ? results[3].value 
      : (cachedResponse ? cachedResponse.STSP_buses : {});

    const hasError = results.some(r => r.status === 'rejected');

    if (hasError) {
      console.error("Transport API Partial Errors:");
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`Index ${i} rejected:`, r.reason);
        }
      });
    }

    const responseData: TransportDataResponse = {
      trains_south: trainData.south,
      trains_north: trainData.north,
      buses: busData,
      STSP_buses: stspData,
      youbike: youbikeData,
      updated_at: new Date().toISOString()
    };

    // 不管有無錯誤，都必須紀錄時間點，防止在 API 失敗時頻繁重試打爆 TDX (429 Too Many Requests)
    cachedResponse = responseData;
    // 如果有錯誤，提早 30 秒過期讓它有機會提早恢復；如果完全成功則正常 60 秒
    cachedAt = hasError ? Date.now() - (CACHE_TTL_MS / 2) : Date.now();

    return NextResponse.json(responseData, {
      status: 200, // 不再回傳 206 讓前端清空快取，後端自己吸收錯誤並給出快取的資料
      headers: { 'Cache-Control': 'no-store', 'X-Cache': hasError ? 'STALE' : 'MISS' }
    });
  } catch (error) {
    console.error("Critical Transport API Error:", error);
    // 發生重大崩潰時，假如有舊快取，也要延長生命週期當擋箭牌，以免持續被打爆
    if (cachedResponse) {
      cachedAt = Date.now() - (CACHE_TTL_MS / 2);
      return NextResponse.json(cachedResponse, {
        status: 200,
        headers: { 'Cache-Control': 'no-store', 'X-Cache': 'STALE_CRITICAL' }
      });
    }
    // 真的連快取都沒有，給予 30 秒的冷卻時間
    cachedAt = Date.now() - (CACHE_TTL_MS / 2);
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 });
  }
}