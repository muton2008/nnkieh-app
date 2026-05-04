// --- 交通 ---
export interface TrainInfo { 
    id: string; 
    type: string; 
    destination: string; 
    departure: string; 
    status: string; 
}
export interface DirectionInfo {
  id: string;
  subRouteName: string;
  destination: string;
  eta: string;
  status: string;
}

export interface BusInfo {
  routeName: string;
  outbound: DirectionInfo[]; // Direction: 0
  inbound: DirectionInfo[];  // Direction: 1
}

export const STSP_TARGET_STOPS = ["南科實中", "民生水塔", "台鐵南科站"];
export interface STSPBusInfo { 
    route: string; 
    destination: string; 
    eta: string; 
    status: string; 
}

export interface YouBikeData {
  StationID: string;
  AvailableRentBikes: number;
  AvailableReturnBikes: number;
}

export interface YouBikeStation { 
    name: string; 
    available: number; 
    empty: number; 
    total: number; 
}