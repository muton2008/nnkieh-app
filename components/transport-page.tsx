"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, TrainFront, Bus, Bike, ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { SkeletonBlock } from "./skeleton-block";
import { TransportDataResponse } from "@/lib/types/api";
import { fetchTransportData, fetchTransportSTSPData } from "@/lib/api-client";

const AUTO_REFRESH_INTERVAL = 60_000; // 60 秒自動刷新

type TrainInfo = {
  id: string;
  type: string;
  destination: string;
  departure: string;
  status: string;
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
  const [loading, setLoading] = useState(true);         // 首次載入（顯示骨架屏）
  const [refreshing, setRefreshing] = useState(false);   // 背景刷新中
  const [stspLoading, setStspLoading] = useState(false);
  const [stspRefreshing, setStspRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [stspLastUpdate, setStspLastUpdate] = useState(0);
  const [transportData, setTransportData] = useState<TransportDataResponse | null>(null);
  const [stspData, setStspData] = useState<TransportDataResponse["STSP_buses"]>({
    "南科實中": [],
    "民生水塔": [],
    "台鐵南科站": []
  });
  const [error, setError] = useState<string | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshSTSP = useCallback(async (isBackground: boolean) => {
    if (isBackground) setStspRefreshing(true);
    else setStspLoading(true);

    try {
      const data = await fetchTransportSTSPData(true);
      setStspData(data.STSP_buses);
      setStspLastUpdate(Date.now());
    } catch (err) {
      console.error("STSP資料載入失敗:", err);
    } finally {
      if (isBackground) setStspRefreshing(false);
      else setStspLoading(false);
    }
  }, []);

  /** 取得資料（forceRefresh = true 跳過客戶端快取） */
  const doFetch = useCallback(async (isBackground: boolean) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      // 永遠 forceRefresh，確保拿到最新資料
      const data = await fetchTransportData(true);
      setTransportData(data);
      setLastUpdate(Date.now());
    } catch (err) {
      console.error("交通資料載入失敗:", err);
      // 背景刷新失敗不擋畫面，只在沒有任何資料時才顯示錯誤
      if (!isBackground) {
        setError("載入失敗，請檢查網路連線");
      }
    } finally {
      if (!isBackground) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  // 首次載入 + 自動刷新
  useEffect(() => {
    doFetch(false);
    void refreshSTSP(false);

    autoRefreshRef.current = setInterval(() => {
      doFetch(true);
      void refreshSTSP(true);
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [doFetch, refreshSTSP]);

  // 倒計時顯示
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [stspSecondsAgo, setStspSecondsAgo] = useState(0);
  useEffect(() => {
    if (!lastUpdate) return;
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdate) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  useEffect(() => {
    if (!stspLastUpdate) return;
    const interval = setInterval(() => {
      setStspSecondsAgo(Math.floor((Date.now() - stspLastUpdate) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [stspLastUpdate]);

  /** 手動刷新（背景模式，不擋畫面） */
  const handleRefresh = useCallback(async () => {
    if (refreshing || stspRefreshing || loading) return;
    doFetch(true);
    void refreshSTSP(true);
  }, [refreshing, stspRefreshing, loading, doFetch, refreshSTSP]);

  return (
    <div className="flex flex-col h-full relative">
      {/* 背景刷新指示條 — 只在有資料時做背景刷新顯示 */}
      {refreshing && (
        <div className="absolute top-0 left-0 right-0 z-50 h-0.5 bg-foreground/5 overflow-hidden">
          <div className="h-full w-1/3 bg-foreground/30 rounded-full animate-[progress-slide_1.2s_ease-in-out_infinite]" />
        </div>
      )}

      {/* 首次載入全螢幕骨架屏 */}
      {loading && !transportData && (
        <div className="absolute inset-0 bg-background z-50 flex items-center justify-center">
          <div className="bg-background border border-border/50 rounded-lg px-6 py-4 shadow-lg flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-foreground/70" strokeWidth={2} />
            <span className="text-sm font-medium text-foreground">載入中...</span>
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
          {/* 更新狀態指示 */}
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground/55 font-light tabular-nums">
              主資料：{loading && !transportData ? "載入中" : refreshing ? "更新中" : `${secondsAgo} 秒前`}
            </span>
            <span className="text-[10px] text-muted-foreground/55 font-light tabular-nums">
              巡迴巴士：{stspLoading ? "載入中" : stspRefreshing ? "更新中" : stspLastUpdate ? `${stspSecondsAgo} 秒前` : "尚未更新"}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || stspRefreshing || (loading && !transportData)}
            className="p-2 -m-0.5 text-muted-foreground hover:text-foreground active:scale-90 transition-all disabled:opacity-30 rounded-full hover:bg-foreground/5"
            aria-label="重新整理"
          >
            <RefreshCw
              size={16}
              strokeWidth={1.5}
              className={`transition-transform ${refreshing || stspRefreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-5">
        {loading && !transportData ? (
          <div className="space-y-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <SkeletonBlock className="h-5 w-32" />
                <SkeletonBlock className="h-28" />
              </div>
            ))}
          </div>
        ) : error && !transportData ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => doFetch(false)}
              className="px-4 py-2 text-sm rounded-md bg-foreground/5 hover:bg-foreground/10 text-foreground transition-colors"
            >
              重試
            </button>
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
                  南科巡迴巴士 &middot; 站點動態
                </h2>
              </div>

              {Object.keys(stspData).length === 0 ? (
                <div className="bg-macaron-green border border-border/50 rounded-md px-4 py-6 text-[11px] text-muted-foreground/40 text-center italic font-light">
                  {stspLoading || stspRefreshing ? "STSP資料更新中...需等待較久" : "目前無可用站點資料"}
                </div>
              ) : (
                Object.entries(stspData).map(([stopName, buses]) => (
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
                          {stspLoading || stspRefreshing ? "STSP資料更新中..." : "目前無即時班次資訊"}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
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
