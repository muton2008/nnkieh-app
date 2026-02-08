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

      // --- 核心修正：嚴格狀態優先權 ---
      
      // 1. 優先處理「絕對停駛」的狀態
      if (status === 4) {
        etaText = "今日停駛";
      } else if (status === 3) {
        etaText = "末班已過";
      } else if (status === 2) {
        etaText = "交管不停";
      } 
      // 2. 狀態不是停駛時，才看秒數
      else if (time !== undefined && time !== null && time >= 0) {
        // 如果秒數大於 0，顯示分鐘；如果等於 0，且狀態不是停駛，顯示進站中
        const min = Math.floor(time / 60);
        if (min > 0) {
          etaText = `${min}`;
        } else {
          // 秒數為 0 且狀態是正常(0)或待發(1)，顯示進站中
          etaText = "進站中";
        }
      } 
      // 3. 最後的保險
      else {
        etaText = status === 1 ? "未發車" : "查詢中";
      }

      // --- 目的地保險：解決 SubRouteName 為空的問題 ---
      let dest = "未知";
      const subName = item.SubRouteName?.Zh_tw; // 使用 Optional Chaining
      
      if (subName && subName.includes('→')) {
        dest = subName.split('→').pop() || "未知";
      } else if (subName) {
        dest = subName;
      } else {
        // 如果 SubRouteName 是空的 (像橘14)，直接顯示路線名稱
        dest = name; 
      }

      const dirInfo: DirectionInfo = {
        id: `${item.RouteID}-${item.SubRouteID}-${item.Direction}-${item.StopID}`,
        subRouteName: subName || name,
        destination: dest.trim(),
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

    // 排序與回傳 (與之前相同)
    return Array.from(routeMap.values()).map(route => {
      const parseEta = (s: string) => {
        if (s === "進站中") return -1;
        const n = parseInt(s);
        return isNaN(n) ? 999 : n;
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


async function getSTSPBusData(): Promise<STSPBusInfo[]> {
  try {
    const url = "https://atis.stsp.gov.tw/STSPapi/api/bus/getBusDynamicInfoArrayByLang?$token=FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF";

    const TARGET_ROUTES = [
      { id: "1916", name: "橘線" },
      { id: "1917", name: "紅線" },
      { id: "1915", name: "藍線" },
      { id: "2112", name: "實中LM線" }
    ];
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // 因為 STSP 的 API 沒有正確設定 SSL，暫時先這樣繞過（不建議在正式環境使用）

    const INTERESTED_STOPS = ["T5 南科實中", "T3 民生水塔"];

    const fetchPromises = TARGET_ROUTES.map(async (target) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ RouteID: target.id, Language: "ZH" }), // 參數通常也建議大寫
        next: { revalidate: 60 }
      });

      if (!res.ok) return [];
      const json = await res.json();

      const goStops = json.GoInfo?.Stops || [];
      const backStops = json.BackInfo?.Stops || [];
      const allStops = [...goStops, ...backStops];

      return allStops
        .filter((s: any) => 
          s.StopName && 
          INTERESTED_STOPS.includes(s.StopName) && 
          s.EstimateTimeType === 0 // 0 代表有預估分鐘數
        )
        .map((s: any): STSPBusInfo => ({
          route: target.name,
          destination: s.StopName,
          eta: s.EstimateTime  + " 分鐘",
          status: s.EstimateTimeType === 0 ? "行駛中" : "無班次"
        }));
    });

    const results = await Promise.all(fetchPromises);
    return results.flat();
  } catch (error) {
    console.error("STSP Bus Error:", error);
    return [];
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
        STSP_buses: stspBus,
        youbike: youbike,
        updated_at: new Date().toISOString()
    }
    return NextResponse.json(response);
}