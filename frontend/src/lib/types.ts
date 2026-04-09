/** Bölüm kodu (SAG_ON vb.); ayarlardan yönetilir */
export type Team = string;

export type Worker = {
  id: number;
  name: string;
  team: Team;
  process: string;
  created_at?: string;
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
  team: string;
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
  team: string;
  process: string;
  production: number;
};

export type HourFilter = "" | "t1000" | "t1300" | "t1600" | "t1830";

/** Sunucu ile aynı anahtarlar (JWT ve PATCH) */
export type AppPermissions = {
  analysis: boolean;
  karsilastirma: boolean;
  ayarlar: boolean;
  hedefTakip: boolean;
  ekran1: boolean;
  ekran2: boolean;
  ekran3: boolean;
  loglar: boolean;
};

export type User = {
  id: number;
  username: string;
  role: string;
  created_at?: string;
  permissions?: AppPermissions;
};
