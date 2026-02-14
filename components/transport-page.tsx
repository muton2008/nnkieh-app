"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrainFront, Bus, Bike, ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { SkeletonBlock } from "./skeleton-block";
import { TransportDataResponse } from "@/lib/types/api";

// --- MOCK DATA (CONSTANTS) ---
type TrainInfo = {
  id: string;
  type: string;
  destination: string;
  departure: string;
  status: string;
};

const MOCK_TRAINS_SOUTH: TrainInfo[] = [
  { id: "272", type: "區間", destination: "嘉義", departure: "17:23", status: "準點" },
  { id: "174", type: "自強", destination: "高雄", departure: "17:45", status: "準點" },
  { id: "276", type: "區間", destination: "新營", departure: "18:02", status: "晚 3 分" },
];

const MOCK_TRAINS_NORTH: TrainInfo[] = [
  { id: "171", type: "自強", destination: "台北", departure: "17:15", status: "準點" },
  { id: "273", type: "區間", destination: "台南", departure: "17:38", status: "準點" },
  { id: "175", type: "自強", destination: "台中", departure: "18:10", status: "晚 5 分" },
];

const MOCK_BUSES = [
  { route: "綠1", destination: "台南火車站", eta: "3 分鐘", status: "進站中" },
  { route: "綠3", destination: "高鐵台南站", eta: "8 分鐘", status: "行駛中" },
  { route: "紅2", destination: "善化轉運站", eta: "15 分鐘", status: "行駛中" },
  { route: "橘12", destination: "新市火車站", eta: "22 分鐘", status: "行駛中" },
];

const MOCK_YOUBIKE = [
  { name: "南科實中站", available: 8, empty: 12, total: 20 },
  { name: "南科管理局站", available: 3, empty: 17, total: 20 },
  { name: "南科站 (台鐵)", available: 12, empty: 8, total: 20 },
];

// Placeholder: API fetch functions
// Should check if cache is older than 60 seconds before making API request
const fetchTransportData = async () => {
  const response = await fetch("/api/transport");
  if (!response.ok) {
    throw new Error("Failed to fetch transport data");
  }
  return response.json() as Promise<TransportDataResponse>;
};

function TrainRow({ train }: { train: TrainInfo }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center w-12">
          <span className="text-base font-medium text-foreground tabular-nums">
            {train.departure}
          </span>
        </div>
        <div className="w-px h-6 bg-border/50" />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/60 border border-border/50 px-1 py-0.5 rounded-sm font-light">
              {train.type}
            </span>
            <span className="text-sm text-foreground">{train.destination}</span>
          </div>
          <span className="text-[10px] text-muted-foreground/40 font-light">
            #{train.id}
          </span>
        </div>
      </div>
      <span
        className={`text-xs font-light ${
          train.status === "準點" ? "text-foreground/50" : "text-destructive/70"
        }`}
      >
        {train.status}
      </span>
    </div>
  );
}

function BikeBar({ available, total }: { available: number; total: number }) {
  const pct = Math.round((available / total) * 100);
  return (
    <div className="w-full h-1.5 bg-border/40 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          pct > 30 ? "bg-emerald-400" : pct > 10 ? "bg-amber-400" : "bg-red-400"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TransportPage() {
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [transportData, setTransportData] = useState<TransportDataResponse | null>(null);

  const initFetch = useCallback(async () => {
    try {
      const data = await fetchTransportData();
      setTransportData(data);
      setLastUpdate(Date.now());
    } catch (error) {
      console.error("初始化載入失敗:", error);
    } finally {
      setLoading(false); // 無論成功失敗都結束 loading 狀態
    }
  }, []);

  useEffect(() => {
    initFetch();
  }, [initFetch]);

  const [secondsAgo, setSecondsAgo] = useState(0);
  useEffect(() => {
    if (!lastUpdate) return;
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdate) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return; // 防止重複點擊
    setRefreshing(true);
    try {
      const data = await fetchTransportData();
      setTransportData(data);
      setLastUpdate(Date.now());
    } catch (error) {
      alert("更新失敗，請檢查網路連線");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  return (
    <div className="flex flex-col h-full relative">
      {/* 載入中遮罩 */}
      {(loading || refreshing) && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-background border border-border/50 rounded-lg px-6 py-4 shadow-lg flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-foreground/70" strokeWidth={2} />
            <span className="text-sm font-medium text-foreground">
              {loading ? "載入中..." : "更新中..."}
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="px-5 pt-12 pb-3 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-semibold text-foreground">
            交通資訊
          </h1>
          <p className="text-xs text-muted-foreground font-light mt-0.5">
            南科周邊即時資訊
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/50 font-light tabular-nums">
            {loading ? "載入中" : `${secondsAgo} 秒前`}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            aria-label="重新整理"
          >
            <RefreshCw
              size={16}
              strokeWidth={1.5}
              className={`transition-transform ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-5">
        {loading ? (
          <div className="space-y-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <SkeletonBlock className="h-5 w-32" />
                <SkeletonBlock className="h-28" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* TRA Southbound */}
            <section aria-label="台鐵南下">
              <div className="flex items-center gap-2 mb-2.5">
                <TrainFront size={16} strokeWidth={1.5} className="text-foreground/60" />
                <h2 className="text-sm font-medium text-foreground">
                  台鐵 &middot; 南科站
                </h2>
              </div>

              {/* Southbound */}
              <div className="mb-2.5">
                <div className="flex items-center gap-1.5 mb-1.5 px-1">
                  <ArrowDown size={12} className="text-red-500" />
                  <span className="text-[11px] text-foreground/60 font-medium">南下</span>
                </div>
                <div className="bg-macaron-pink border border-border/50 rounded-sm divide-y divide-border/50">
                  {transportData?.trains_south.map((train) => (
                    <TrainRow key={`${train.id}-${train.destination}`} train={train} />
                  ))}
                </div>
              </div>

              {/* Northbound */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 px-1">
                  <ArrowUp size={12} className="text-sky-500" />
                  <span className="text-[11px] text-foreground/60 font-medium">北上</span>
                </div>
                <div className="bg-macaron-blue border border-border/50 rounded-sm divide-y divide-border/50">
                  {transportData?.trains_north.map((train) => (
                    <TrainRow key={`${train.id}-${train.destination}`} train={train} />
                  ))}
                </div>
              </div>
            </section>

            {/* Bus section */}
            <section aria-label="公車資訊">
              <div className="flex items-center gap-2 mb-2.5">
                <Bus size={16} strokeWidth={1.5} className="text-foreground/60" />
                <h2 className="text-sm font-medium text-foreground">
                  大台南公車 &middot; 即時動態
                </h2>
              </div>
              
              {transportData?.buses.map((bus) => (
                <div key={bus.routeName} className="mb-4 bg-macaron-green border border-border/50 rounded-sm overflow-hidden">
                  {/* 路線標頭 */}
                  <div className="px-4 py-2 border-b border-border/30 bg-white/30">
                    <span className="text-sm font-bold">{bus.routeName}</span>
                  </div>
                  
                  {/* 去回程班次 */}
                  <div className="divide-y divide-border/30">
                    {[...bus.outbound, ...bus.inbound].map((trip) => (
                      <div key={trip.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] px-1 rounded-sm ${trip.id.includes('-0-') ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                              {trip.id.includes('-0-') ? '去程' : '回程'}
                            </span>
                            <span className="text-sm text-foreground">往 {trip.destination}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground/40 font-light line-clamp-1">
                            {trip.subRouteName}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm font-medium tabular-nums ${
                            parseInt(trip.eta) < 3 ? "text-red-500" : "text-foreground/70"
                          }`}>
                            {trip.eta === "未發車" || trip.eta === "今日停駛" ? trip.eta : `${trip.eta}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {/* STSP Bus section - 南科巡迴巴士 */}
            <section aria-label="STSP公車資訊" className="space-y-4">
              <div className="flex items-center gap-2 mb-2.5">
                <Bus size={16} strokeWidth={1.5} className="text-foreground/60" />
                <h2 className="text-sm font-medium text-foreground">
                  南科巡迴巴士 &middot; 站點動態(暫不支援)
                </h2>
              </div>

              {transportData?.STSP_buses && Object.entries(transportData.STSP_buses).map(([stopName, buses]) => (
                <div key={stopName} className="mb-5 last:mb-0">
                  {/* 站點名稱標籤 */}
                  <div className="flex items-center gap-1.5 mb-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[11px] text-foreground/60 font-bold uppercase tracking-wider">
                      {stopName}
                    </span>
                  </div>

                  {/* 公車列表卡片 */}
                  <div className="bg-macaron-green border border-border/50 rounded-md divide-y divide-border/50 overflow-hidden">
                    {buses && buses.length > 0 ? (
                      buses.map((bus, idx) => (
                        <div 
                          key={`${stopName}-${idx}`} 
                          className="flex items-center justify-between px-4 py-3.5 gap-4"
                        >
                          {/* 左側資訊區：使用 flex-1 確保佔滿空間 */}
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {/* 路線名稱 (如：紅線) */}
                            <span className="text-sm font-black text-foreground shrink-0 mt-0.5">
                              {bus.route.split(" ")[0]}
                            </span>
                            
                            {/* 分隔線 */}
                            <div className="w-px h-8 bg-border/50 shrink-0" />
                            
                            {/* 目的地與子路線 */}
                            <div className="flex flex-col min-w-0 gap-1">
                              {/* 目的地 */}
                              <span className="text-sm text-foreground font-semibold leading-tight">
                                {bus.destination}
                              </span>
                              
                              {/* 子路線標籤 */}
                              <div className="flex">
                                <span className="text-[10px] text-emerald-700 font-medium bg-white/70 px-1.5 py-0.5 rounded shadow-sm border border-emerald-100/50 whitespace-normal break-all">
                                  {bus.route.includes("(") 
                                    ? bus.route.match(/\(([^)]+)\)/)?.[1] + ")"
                                    : bus.status}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 右側時間區 */}
                          <div className="text-right shrink-0 min-w-[3.5rem]">
                            <span className={`text-base font-bold tabular-nums ${
                              bus.eta.includes("分") ? "text-emerald-600 animate-pulse" : "text-foreground/60"
                            }`}>
                              {bus.eta}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-[11px] text-muted-foreground/40 text-center italic font-light">
                        目前無即時班次資訊
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </section>

            {/* YouBike section */}
            <section aria-label="YouBike">
              <div className="flex items-center gap-2 mb-2.5">
                <Bike size={16} strokeWidth={1.5} className="text-foreground/60" />
                <h2 className="text-sm font-medium text-foreground">
                  YouBike 2.0
                </h2>
              </div>
              <div className="bg-macaron-yellow border border-border/50 rounded-sm divide-y divide-border/50">
                {transportData?.youbike.map((station) => (
                  <div key={station.name} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-foreground">{station.name}</span>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                          <span className="text-base font-medium text-foreground tabular-nums">
                            {station.available}
                          </span>
                          <span className="text-[9px] text-muted-foreground/40 font-light">
                            可借
                          </span>
                        </div>
                        <div className="w-px h-6 bg-border/50" />
                        <div className="flex flex-col items-center">
                          <span className="text-base font-medium text-foreground tabular-nums">
                            {station.empty}
                          </span>
                          <span className="text-[9px] text-muted-foreground/40 font-light">
                            可還
                          </span>
                        </div>
                      </div>
                    </div>
                    <BikeBar available={station.available} total={station.total} />
                  </div>
                ))}
              </div>
            </section>

            {/* Footer */}
            <div className="pt-2 border-t border-dashed border-border">
              <p className="text-[10px] text-muted-foreground/40 text-center font-light">
                資料來源：TDX 運輸資料平台 / YouBike 2.0
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
