// --- 交通 ---
export interface TrainInfo { id: string; type: string; destination: string; departure: string; status: string; }
export interface BusInfo { route: string; destination: string; eta: string; status: string; }
export interface YouBikeStation { name: string; available: number; empty: number; total: number; }