export type Team = "SAG_ON" | "SOL_ON" | "YAKA_HAZIRLIK" | "ARKA_HAZIRLIK" | "BITIM" | "ADET";

export type Worker = {
  id: number;
  name: string;
  team: Team;
  process: string;
};

export type ProductionRow = {
  workerId: number;
  name: string;
  team: Team;
  process: string;
  t1000: number;
  t1300: number;
  t1600: number;
  t1830: number;
};


export type TopWorkerAnalytics = {
  workerId: number;
  name: string;
  team: Team;
  process: string;
  activeDays: number;
  totalProduction: number;
};

export type DailyTrendPoint = {
  productionDate: string;
  totalProduction: number;
};

export type WorkerDailyAnalytics = {
  productionDate: string;
  workerId: number;
  name: string;
  team: Team;
  process: string;
  production: number;
};

export type HourFilter = "" | "t1000" | "t1300" | "t1600" | "t1830";

export type User = {
  id: number;
  username: string;
  created_at?: string;
};
