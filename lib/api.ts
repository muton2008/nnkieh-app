// ============================================================
// 校園生活助手 - API 函式層
// ============================================================
// 此檔案定義了所有與後端互動的函式。
// 目前每個函式都回傳 Mock Data，你只需要替換函式內部的
// fetch/axios 實作即可完成串接。
//
// 快取策略建議：
// 每個 fetch 函式應判斷 localStorage 中的快取時間戳，
// 若距離上次請求不足 CACHE_TTL_MS (60秒)，直接回傳快取資料。
// ============================================================

import type {
  FetchTimetableResponse,
  WeekSchedule,
  SaveTimetableResponse,
  SaveTimetableRequest,
  JoinClassRequest,
  JoinClassResponse,
  GenerateCodeRequest,
  GenerateCodeResponse,
  TransportDataResponse,
  FetchSchoolCalendarResponse,
  SavePrivateEventsRequest,
  SavePrivateEventsResponse,
  PrivateCalendarEvent,
  FetchAnnouncementsResponse,
  UserProfile,
  TrainInfo,
  BusInfo,
  YouBikeStation,
  SchoolCalendarEvent,
  Announcement,
  CourseNote,
  CourseItem,
} from "./types";

// --- 設定 ---

/** 快取有效期 (毫秒)，建議 60 秒 */
const CACHE_TTL_MS = 60_000;

/** API Base URL - 請替換為你的後端位址 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

// --- 快取工具 ---

function getCachedData<T>(key: string): { data: T; fresh: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; timestamp: number };
    const isFresh = Date.now() - parsed.timestamp < CACHE_TTL_MS;
    return { data: parsed.data, fresh: isFresh };
  } catch {
    return null;
  }
}

function setCachedData<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
}

// ============================================================
// 使用者設定
// ============================================================

/** 從 localStorage 取得使用者設定 */
export function getLocalUserProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user_profile");
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

/** 儲存使用者設定至 localStorage */
export function saveLocalUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("user_profile", JSON.stringify(profile));
}

/**
 * 將使用者設定同步至後端
 * TODO: 實作 POST ${API_BASE}/api/user/profile
 */
export async function syncUserProfile(profile: UserProfile): Promise<{ success: boolean }> {
  // ------- 請在此處實作 API 呼叫 -------
  // const res = await fetch(`${API_BASE}/api/user/profile`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(profile),
  // });
  // return res.json();
  // ------- Mock -------
  console.log("[API] syncUserProfile:", profile);
  return { success: true };
}

// ============================================================
// 課表系統
// ============================================================

/** Mock 一週課表 */
function createMockSchedule(): WeekSchedule {
  const n = (id: string, text: string, cat: CourseNote["category"], src: CourseNote["source"] = "public"): CourseNote => ({
    id, text, category: cat, source: src,
  });
  const c = (subject: string, teacher: string, room: string, notes: CourseNote[] = []): CourseItem => ({
    subject, teacher, room, notes,
  });
  const empty: CourseItem = { subject: "", teacher: "", room: "", notes: [] };

  return {
    一: [
      c("國文", "王老師", "301", [n("p1", "第三課小考", "exam")]),
      c("數學", "林老師", "301"),
      c("英文", "陳老師", "301", [n("p2", "帶會話課本", "homework")]),
      c("物理", "張老師", "Lab-A"),
      empty, // lunch
      c("體育", "李老師", "操場"),
      c("化學", "黃老師", "Lab-B"),
      c("班會", "導師", "301"),
      empty, // 8th
    ],
    二: [
      c("英文", "陳老師", "301"),
      c("國文", "王老師", "301"),
      c("數學", "林老師", "301", [n("p3", "交習作 p.52", "homework")]),
      c("歷史", "吳老師", "301"),
      empty,
      c("地理", "趙老師", "301"),
      c("美術", "孫老師", "美術教室"),
      c("自習", "", "301"),
      empty,
    ],
    三: [
      c("數學", "林老師", "301"),
      c("物理", "張老師", "Lab-A", [n("p4", "實驗報告截止", "homework")]),
      c("國文", "王老師", "301"),
      c("英文", "陳老師", "301", [n("p5", "調至 305 教室", "swap")]),
      empty,
      c("化學", "黃老師", "Lab-B"),
      c("音樂", "周老師", "音樂教室"),
      c("社團", "", ""),
      c("第八節輔導", "導師", "301"),
    ],
    四: [
      c("歷史", "吳老師", "301"),
      c("英文", "陳老師", "301"),
      c("數學", "林老師", "301", [n("p6", "段考範圍公告", "exam")]),
      c("國文", "王老師", "301", [n("p7", "作文課", "homework")]),
      empty,
      c("物理", "張老師", "Lab-A"),
      c("公民", "鄭老師", "301"),
      c("輔導", "導師", "301"),
      empty,
    ],
    五: [
      c("化學", "黃老師", "Lab-B"),
      c("國文", "王老師", "301"),
      c("英文", "陳老師", "301"),
      c("數學", "林老師", "301"),
      empty,
      c("地理", "趙老師", "301"),
      c("體育", "李老師", "操場"),
      c("自習", "", "301"),
      empty,
    ],
  };
}

/**
 * 取得班級課表
 * TODO: 實作 GET ${API_BASE}/api/timetable?device_id=xxx
 * 此處應判斷快取是否超過 60 秒再進行 API 請求
 */
export async function fetchTimetable(deviceId: string): Promise<FetchTimetableResponse> {
  const cacheKey = "cache_timetable";
  const cached = getCachedData<FetchTimetableResponse>(cacheKey);
  if (cached?.fresh) return cached.data;

  // ------- 請在此處實作 API 呼叫 -------
  // const res = await fetch(`${API_BASE}/api/timetable?device_id=${deviceId}`);
  // const data: FetchTimetableResponse = await res.json();
  // setCachedData(cacheKey, data);
  // return data;
  // ------- Mock -------
  await new Promise((r) => setTimeout(r, 400));
  const data: FetchTimetableResponse = {
    schedule: createMockSchedule(),
    class_name: "高二甲班",
    default_room: "301",
    updated_at: new Date().toISOString(),
  };
  setCachedData(cacheKey, data);
  return data;
}

/**
 * 儲存課表至後端 (自動儲存觸發)
 * TODO: 實作 POST ${API_BASE}/api/timetable
 */
export async function saveTimetable(req: SaveTimetableRequest): Promise<SaveTimetableResponse> {
  // ------- 請在此處實作 API 呼叫 -------
  // const res = await fetch(`${API_BASE}/api/timetable`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(req),
  // });
  // return res.json();
  // ------- Mock -------
  console.log("[API] saveTimetable:", req.device_id);
  await new Promise((r) => setTimeout(r, 200));
  return { success: true };
}

/**
 * 加入班級 (輸入邀請碼)
 * TODO: 實作 POST ${API_BASE}/api/class/join
 */
export async function joinClass(req: JoinClassRequest): Promise<JoinClassResponse> {
  // ------- 請在此處實作 API 呼叫 -------
  // const res = await fetch(`${API_BASE}/api/class/join`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(req),
  // });
  // return res.json();
  // ------- Mock -------
  console.log("[API] joinClass:", req.invite_code);
  await new Promise((r) => setTimeout(r, 300));
  return { success: true, class_name: "高二甲班" };
}

/**
 * 生成班級代碼，並要求後端儲存
 * TODO: 實作 POST ${API_BASE}/api/class/code
 */
export async function generateClassCode(req: GenerateCodeRequest): Promise<GenerateCodeResponse> {
  // ------- 請在此處實作 API 呼叫 -------
  // const res = await fetch(`${API_BASE}/api/class/code`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(req),
  // });
  // return res.json();
  // ------- Mock -------
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const p1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const p2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const code = `${p1}-${p2}`;
  console.log("[API] generateClassCode:", code);
  return { success: true, code, created_at: new Date().toISOString() };
}

// ============================================================
// 交通資訊
// ============================================================

/** Mock 交通資料 */
function createMockTransportData(): TransportDataResponse {
  const ts: TrainInfo[] = [
    { id: "272", type: "區間", destination: "嘉義", departure: "17:23", status: "準點" },
    { id: "174", type: "自強", destination: "高雄", departure: "17:45", status: "準點" },
    { id: "276", type: "區間", destination: "新營", departure: "18:02", status: "晚 3 分" },
  ];
  const tn: TrainInfo[] = [
    { id: "171", type: "自強", destination: "台北", departure: "17:15", status: "準點" },
    { id: "273", type: "區間", destination: "台南", departure: "17:38", status: "準點" },
    { id: "175", type: "自強", destination: "台中", departure: "18:10", status: "晚 5 分" },
  ];
  const buses: BusInfo[] = [
    { route: "綠1", destination: "台南火車站", eta: "3 分鐘", status: "進站中" },
    { route: "綠3", destination: "高鐵台南站", eta: "8 分鐘", status: "行駛中" },
    { route: "紅2", destination: "善化轉運站", eta: "15 分鐘", status: "行駛中" },
    { route: "橘12", destination: "新市火車站", eta: "22 分鐘", status: "行駛中" },
  ];
  const youbike: YouBikeStation[] = [
    { name: "南科實中站", available: 8, empty: 12, total: 20 },
    { name: "南科管理局站", available: 3, empty: 17, total: 20 },
    { name: "南科站 (台鐵)", available: 12, empty: 8, total: 20 },
  ];
  return {
    trains_south: ts,
    trains_north: tn,
    buses,
    youbike,
    updated_at: new Date().toISOString(),
  };
}

/**
 * 取得交通即時資訊
 * TODO: 實作 GET ${API_BASE}/api/transport
 * 資料來源：TDX 運輸資料平台 / YouBike 2.0
 * 此處應判斷快取是否超過 60 秒再進行 API 請求
 */
export async function fetchTransportData(): Promise<TransportDataResponse> {
  const cacheKey = "cache_transport";
  const cached = getCachedData<TransportDataResponse>(cacheKey);
  if (cached?.fresh) return cached.data;

  // ------- 請在此處實作 API 呼叫 -------
  // const [trainsRes, busesRes, bikeRes] = await Promise.all([
  //   fetch(`${API_BASE}/api/transport/trains`),
  //   fetch(`${API_BASE}/api/transport/buses`),
  //   fetch(`${API_BASE}/api/transport/youbike`),
  // ]);
  // const trains = await trainsRes.json();
  // const buses = await busesRes.json();
  // const bike = await bikeRes.json();
  // const data = { ...trains, buses, youbike: bike, updated_at: new Date().toISOString() };
  // setCachedData(cacheKey, data);
  // return data;
  // ------- Mock -------
  await new Promise((r) => setTimeout(r, 500));
  const data = createMockTransportData();
  setCachedData(cacheKey, data);
  return data;
}

// ============================================================
// 行事曆
// ============================================================

/** Mock 全校行事曆 */
function createMockSchoolCalendar(): SchoolCalendarEvent[] {
  return [
    { id: 1, date: "3/3", weekday: "一", title: "開學典禮", description: "全校集合於活動中心", tag: "全校活動", color: "bg-macaron-pink" },
    { id: 2, date: "3/7", weekday: "五", title: "社團博覽會", description: "午休時間於中庭進行社團招募", tag: "社團", color: "bg-macaron-green" },
    { id: 3, date: "3/10", weekday: "一", title: "第一次段考", description: "考試範圍依各科老師公告", tag: "考試", color: "bg-macaron-yellow" },
    { id: 4, date: "3/14", weekday: "五", title: "段考結束", description: "下午放學後恢復正常作息", tag: "考試", color: "bg-macaron-yellow" },
    { id: 5, date: "3/21", weekday: "五", title: "社團成果發表會", description: "各社團於活動中心展演", tag: "社團", color: "bg-macaron-green" },
    { id: 6, date: "3/28", weekday: "五", title: "校外教學", description: "高二年級前往台南市區文化踏查", tag: "校外", color: "bg-macaron-blue" },
    { id: 7, date: "4/4", weekday: "五", title: "清明連假", description: "4/4-4/7 放假四天", tag: "假期", color: "bg-macaron-pink" },
    { id: 8, date: "4/12", weekday: "六", title: "校慶運動會", description: "全日活動，請穿著體育服裝", tag: "全校活動", color: "bg-macaron-blue" },
  ];
}

/**
 * 取得全校行事曆 (由開發者/管理員從後端 CMS 設定)
 * TODO: 實作 GET ${API_BASE}/api/calendar/school
 * 此處應判斷快取是否超過 60 秒再進行 API 請求
 */
export async function fetchSchoolCalendar(): Promise<FetchSchoolCalendarResponse> {
  const cacheKey = "cache_school_calendar";
  const cached = getCachedData<FetchSchoolCalendarResponse>(cacheKey);
  if (cached?.fresh) return cached.data;

  // ------- 請在此處實作 API 呼叫 -------
  // const res = await fetch(`${API_BASE}/api/calendar/school`);
  // const data: FetchSchoolCalendarResponse = await res.json();
  // setCachedData(cacheKey, data);
  // return data;
  // ------- Mock -------
  await new Promise((r) => setTimeout(r, 400));
  const data: FetchSchoolCalendarResponse = {
    events: createMockSchoolCalendar(),
    semester: "113學年度第二學期",
    updated_at: new Date().toISOString(),
  };
  setCachedData(cacheKey, data);
  return data;
}

/** 從 localStorage 讀取私人行事曆 */
export function getLocalPrivateEvents(): PrivateCalendarEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("private_calendar_events");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 儲存私人行事曆至 localStorage */
export function saveLocalPrivateEvents(events: PrivateCalendarEvent[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("private_calendar_events", JSON.stringify(events));
}

/**
 * 將私人行事曆同步至後端 (自動儲存觸發)
 * TODO: 實作 POST ${API_BASE}/api/calendar/private
 */
export async function syncPrivateEvents(req: SavePrivateEventsRequest): Promise<SavePrivateEventsResponse> {
  // ------- 請在此處實作 API 呼叫 -------
  // const res = await fetch(`${API_BASE}/api/calendar/private`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(req),
  // });
  // return res.json();
  // ------- Mock -------
  console.log("[API] syncPrivateEvents:", req.events.length, "events");
  return { success: true };
}

// ============================================================
// 公告
// ============================================================

/** Mock 公告 */
function createMockAnnouncements(): Announcement[] {
  return [
    {
      post_id: 1, title: "第一次段考考程表公告",
      content: "一、考試日期：3/10 (一) - 3/14 (五)\n二、考試範圍依各科老師課堂公告為準\n三、請同學提早準備，如有疑問請洽教務處\n四、考試期間中午 12:30 放學\n五、考試座位表將於考前一週公佈於各班公佈欄",
      publish_date: "2026-02-25", category: "exam", importance: 1, author: "教務處",
      link: "https://www.nnkieh.tn.edu.tw",
      attachments: [{ name: "113-2 第一次段考考程表.pdf", url: "#" }, { name: "考試範圍一覽表.pdf", url: "#" }],
    },
    {
      post_id: 2, title: "社團博覽會報名開始",
      content: "本學期社團博覽會將於 3/7 (五) 午休時間在中庭舉行。\n各社團將設攤展示成果，歡迎同學們前來了解各社團活動內容。\n報名截止日期：3/14 (五)\n各社團簡介手冊已放置於學務處，歡迎索取。",
      publish_date: "2026-02-24", category: "activity", importance: 0, author: "學務處",
    },
    {
      post_id: 3, title: "113 學年度第二學期學習歷程檔案上傳提醒",
      content: "提醒各位同學，學習歷程檔案上傳期限將於本學期末截止。\n請盡早準備並上傳，如有操作問題可至輔導室諮詢。\n上傳系統：學習歷程檔案中央資料庫",
      publish_date: "2026-02-23", category: "learning", importance: 1, author: "輔導室",
      link: "https://ep.entry.edu.tw",
    },
    {
      post_id: 4, title: "校慶運動會籌備通知",
      content: "校慶運動會預定於 4/12 (六) 全日舉行。\n各班選手登記截止日為 3/28 (五)。\n比賽項目包含：100m、200m、400m 接力、跳高、跳遠、鉛球等。\n請各班體育股長於截止前完成線上登記。",
      publish_date: "2026-02-22", category: "activity", importance: 0, author: "體育組",
      attachments: [{ name: "運動會競賽規程.pdf", url: "#" }],
    },
    {
      post_id: 5, title: "114 學年度繁星推薦相關事宜",
      content: "114 學年度大學繁星推薦作業即將展開。\n符合資格之高三同學請於 3/5 前至輔導室確認推薦意願。\n詳細說明會將於 3/3 (一) 第 7 節在視聽教室舉行。",
      publish_date: "2026-02-21", category: "admission", importance: 1, author: "輔導室",
    },
    {
      post_id: 6, title: "清明連假放假通知",
      content: "清明連假期間為 4/4 (五) - 4/7 (一)，共四天。\n4/8 (二) 正常上課。\n連假作業由各科老師另行公告。",
      publish_date: "2026-02-20", category: "admin", importance: 0, author: "教務處",
    },
    {
      post_id: 7, title: "午餐菜單更新",
      content: "三月份午餐菜單已更新至校網，如有食物過敏或特殊飲食需求，請提前告知導師。",
      publish_date: "2026-02-19", category: "general", importance: 0, author: "總務處",
    },
    {
      post_id: 8, title: "教師專業學習社群研習公告",
      content: "本學期教師專業學習社群將於每月第二個週三下午辦理。\n第一次研習日期：3/12 (三) 14:00-16:00\n地點：第一會議室\n主題：差異化教學策略分享",
      publish_date: "2026-02-18", category: "teacher", importance: 0, author: "教務處",
    },
    {
      post_id: 9, title: "圖書館新書到館通知",
      content: "本次新書涵蓋文學、科普、社會科學等類別共 50 冊。\n詳細書目已張貼於圖書館公告欄，也可至圖書館網站查詢。\n借閱期限為 14 天，可續借一次。",
      publish_date: "2026-02-17", category: "general", importance: 0, author: "圖書館",
    },
  ];
}

/**
 * 取得公告列表
 * TODO: 實作 GET ${API_BASE}/api/announcements?page=1
 * 此處應判斷快取是否超過 60 秒再進行 API 請求
 */
export async function fetchAnnouncements(page = 1): Promise<FetchAnnouncementsResponse> {
  const cacheKey = `cache_announcements_p${page}`;
  const cached = getCachedData<FetchAnnouncementsResponse>(cacheKey);
  if (cached?.fresh) return cached.data;

  // ------- 請在此處實作 API 呼叫 -------
  // const res = await fetch(`${API_BASE}/api/announcements?page=${page}`);
  // const data: FetchAnnouncementsResponse = await res.json();
  // setCachedData(cacheKey, data);
  // return data;
  // ------- Mock -------
  await new Promise((r) => setTimeout(r, 500));
  const mockList = createMockAnnouncements();
  const data: FetchAnnouncementsResponse = {
    announcements: mockList,
    total: mockList.length,
    page,
    updated_at: new Date().toISOString(),
  };
  setCachedData(cacheKey, data);
  return data;
}

// ============================================================
// 公告已讀狀態 (純 localStorage)
// ============================================================

export function getReadAnnouncementIds(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem("news_read_ids");
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

export function markAnnouncementAsRead(id: number): void {
  const ids = getReadAnnouncementIds();
  ids.add(id);
  localStorage.setItem("news_read_ids", JSON.stringify([...ids]));
}

// ============================================================
// 課表私人備註 (localStorage + 自動儲存)
// ============================================================

export function getLocalPrivateNotes(): Record<string, Record<number, { text: string; category: string }[]>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("timetable_private_notes");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalPrivateNotes(
  store: Record<string, Record<number, { text: string; category: string }[]>>
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("timetable_private_notes", JSON.stringify(store));
}
