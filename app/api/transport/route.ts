import { NextResponse } from 'next/server';
import { getTDXToken } from '@/lib/tdx';
import type { TrainInfo, DirectionInfo, BusInfo, STSPBusInfo, YouBikeData, YouBikeStation } from '@/lib/types/transport';
import type { TransportDataResponse } from '@/lib/types/api';

const headers : Record<string, string> = {}

async function getTrain() {
  const url = "https://tdx.transportdata.tw/api/basic/v2/Rail/TRA/LiveBoard/Station/4180";
  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate: 60 }
    });
    
    if (!res.ok) throw new Error("TRA API Error");
    
    const data = await res.json();
    
    // 使用 Map 進行去重複，並以最後一筆 (通常是較新的) 為準
    const uniqueMap = new Map();
    data.forEach((item: any) => {
      uniqueMap.set(item.TrainNo, item);
    });

    const north: TrainInfo[] = [];
    const south: TrainInfo[] = [];

    // 2. 處理去重後的資料
    uniqueMap.forEach((item) => {
      // 處理誤點文字
      // DelayTime 0 = 準點, > 0 為誤點分鐘數
      const delay = item.DelayTime || 0;
      const statusText = delay <= 0 ? "準點" : `晚 ${delay} 分`;

      const trainData: TrainInfo = {
        id: item.TrainNo,
        type: item.TrainTypeName.Zh_tw.replace("車", ""), 
        destination: item.EndingStationName.Zh_tw,
        // 取 HH:mm 格式
        departure: item.ScheduledDepartureTime.substring(0, 5),
        status: statusText
      };

      // Direction: 0 是北上, 1 是南下
      if (item.Direction === 0) {
        north.push(trainData);
      } else {
        south.push(trainData);
      }
    });

    // 依照出發時間排序 (避免去重後順序亂掉)
    const sortByTime = (a: TrainInfo, b: TrainInfo) => a.departure.localeCompare(b.departure);
    north.sort(sortByTime);
    south.sort(sortByTime);

    return { north, south };
  } catch (error) {
    console.error("Train Error:", error);
    return { north: [], south: [] };
  }
}

async function getBus(): Promise<BusInfo[]> {
  try {
    const TARGET_ROUTES = ["綠2", "綠3", "橘12", "橘14"];
    const TARGET_STOPS = ["南科實中", "民生水塔"];

    const rFilter = TARGET_ROUTES.map(r => `RouteName/Zh_tw eq '${r}'`).join(' or ');
    const sFilter = TARGET_STOPS.map(s => `contains(StopName/Zh_tw, '${s}')`).join(' or ');
    const filter = `(${rFilter}) and (${sFilter})`;
    const select = "RouteID,SubRouteID,Direction,StopID,RouteName,StopName,EstimateTime,StopStatus,SubRouteName";

    const url = `https://tdx.transportdata.tw/api/basic/v3/Bus/EstimatedTimeOfArrival/City/Tainan?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}&$format=JSON`;

    const res = await fetch(url, { headers, next: { revalidate: 60 } });
    const data = await res.json();
    const rawData = data.N1Datas || [];
    const routeMap = new Map<string, BusInfo>();

    rawData.forEach((item: any) => {
      const name = item.RouteName?.Zh_tw || "未知路線";
      const status = item.StopStatus;
      const time = item.EstimateTime;
      
      let etaText = "";
      
      
      // 1. 如果有秒數且大於 0，優先顯示分鐘 (不管 status 是多少)
      if (time !== undefined && time !== null && time > 60) {
        etaText = `${Math.floor(time / 60)} 分`;
      } 
      // 2. 如果秒數在 0~60 秒之間
      else if (time !== undefined && time !== null && time >= 0 && ( status === 1 || status === 0)) {
        if (status === 1) {
          etaText = "未發車";
        } else {
          etaText = "進站中";
        }
      }
      // 3. 如果完全沒有秒數資訊，才根據 StopStatus 顯示文字
      else {
        if (status === 1) etaText = "未發車";
        else if (status === 2) etaText = "交管不停";
        else if (status === 3) etaText = "末班已過";
        else if (status === 4) etaText = "今日停駛";
        else {
          console.warn("未知的公車狀態:", status, "秒數:", time);
          etaText = "查詢中";
        }
      }

      // --- 目的地處理 (保持彈性，不寫死特定路線) ---
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

    // 排序與回傳
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

  } catch (error) {
    console.error("Bus Error:", error);
    return [];
  }
}


async function getSTSPBusData(): Promise<Record<string, STSPBusInfo[]>> {
  try {
    const url = "https://atis.stsp.gov.tw/STSPapi/api/bus/getStopRouteDynamicInfoByStopnameByLang?$format=json";
    
    // 你要查詢的兩個目標站點
    const TARGET_STOPS = ["南科實中", "民生水塔"];
    const AUTH_TOKEN = "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" //public token
    
    // 指定要保留的路線關鍵字
    const WANTED_ROUTES = ["紅線", "藍線", "橘線", "實中線", "LM線"];

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; 

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
          next: { revalidate: 60 }
        });

        if (!res.ok) {
          console.error(`STSP API Error for ${stopName}:`, res);
          finalData[stopName] = [];
          return [];
        }

        const json = await res.json();
        //console.log(`Raw STSP Data for ${stopName}:`, json);
        const allRoutes = json.routes || [];

        const filtered = allRoutes
          .filter((r: any) => 
            // 1. 必須是我們要的路線
            WANTED_ROUTES.some(name => r.routeName.includes(name)) &&
            // 2. 必須有時間資訊且不是「尚未發車」
            r.estimateTime && r.estimateTime !== "尚未發車"
          )
          .map((r: any) => ({
            route: `${r.routeName} (${r.subRouteName})`,
            destination: r.destination,
            eta: r.estimateTime.includes("分") ? r.estimateTime : r.estimateTime,
            // 排序權重：行駛中(0)優於預排(6)
            _sortWeight: r.estimateTime.includes("分") 
              ? parseInt(r.estimateTime) 
              : parseInt(r.estimateTime.replace(":", "")) + 1000
          }))
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
    //console.log("STSP Bus Data:", finalData);
    return finalData;

  } catch (error) {
    console.error("STSP Bus Total Error:", error);
    return {};
  }
}

async function getYouBike(): Promise<YouBikeStation[]> {
  try {
    // 站點 ID 與名稱的對照表 (確保順序與名稱正確)
    const STATIONS = [
      { id: "501330008", name: "南科實中國中部" },
      { id: "501330010", name: "民生水塔" },
      { id: "501330004", name: "社區中心" },
      { id: "501328006", name: "南科火車站" },
    ];

    const stationIds = STATIONS.map(s => `StationID eq '${s.id}'`).join(' or ');
    const url = `https://tdx.transportdata.tw/api/basic/v2/Bike/Availability/City/Tainan?$filter=${encodeURIComponent(stationIds)}&$format=JSON`;

    const res = await fetch(url, { headers, next: { revalidate: 60 } });
    if (!res.ok) throw new Error("TDX YouBike API Error");

    const data: YouBikeData[] = await res.json();
    
    // 將 API 回傳資料轉為 Map 方便對照 ID 填入名稱
    const dataMap = new Map(data.map((item: any) => [item.StationID, item]));

    return STATIONS.map(s => {
      const liveData = dataMap.get(s.id);
      if (!liveData) {
        return { id: s.id, name: s.name, available: 0, empty: 0, total: 0 };
      }

      // AvailableRentBikes 已經包含一般車與電輔車的總和
      const available = liveData.AvailableRentBikes || 0;
      const empty = liveData.AvailableReturnBikes || 0;

      return {
        name: s.name,
        available: available,
        empty: empty,
        total: available + empty // 總車位數
      };
    });

  } catch (error) {
    console.error("YouBike Error:", error);
    return [];
  }
}

export async function GET() {
    const tdxToken = await getTDXToken();
    headers['authorization']= 'Bearer ' + tdxToken;
    const [train, bus, stspBus, youbike] = await Promise.all([getTrain(), getBus(), getSTSPBusData(), getYouBike()]);
    const response: TransportDataResponse = {    
        trains_south: train.south,
        trains_north: train.north,
        buses: bus,
        STSP_buses : stspBus,
        youbike: youbike,
        updated_at: new Date().toISOString()
    }
    return NextResponse.json(response);
}