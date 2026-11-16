import "server-only";

import { query, queryOne } from "@/lib/server/db";
import {
  DEVICES,
  CHANNELS,
  CITY_TIERS,
  CATEGORIES,
} from "@/lib/filters";

export interface FilterOptions {
  min_date: string;
  max_date: string;
  devices: string[];
  channels: string[];
  cities: string[];
  tiers: string[];
  categories: string[];
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const bounds = await queryOne<{ min_d: string; max_d: string }>(
    "SELECT MIN(session_start_ts)::date::text AS min_d, MAX(session_start_ts)::date::text AS max_d FROM sessions;"
  );

  const citiesRows = await query<{ city: string }>(
    "SELECT DISTINCT city FROM sessions ORDER BY city;"
  );

  return {
    min_date: bounds.min_d || "2025-01-01",
    max_date: bounds.max_d || "2025-06-30",
    devices: [...DEVICES],
    channels: [...CHANNELS],
    cities: citiesRows.map((r) => r.city),
    tiers: [...CITY_TIERS],
    categories: [...CATEGORIES],
  };
}
