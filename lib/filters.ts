/**
 * Global dashboard filters — shared by server (SQL builders) and client (URL state).
 *
 * Mirrors the Streamlit sidebar (`python/app/streamlit_app.py::build_where_clause`):
 *   date range (session_start_ts), device type, acquisition channel, city, product category
 * plus city tier, which the schema supports on both `sessions` and `users`.
 *
 * Every value is validated here. Enumerations come straight from the CHECK
 * constraints in `sql/00_schema.sql`, so anything else is dropped before it can
 * reach a query. Values are still bound as parameters, never concatenated.
 */

export const DEVICES = ["Android", "iOS", "Mobile_Web", "Desktop_Web"] as const;
export const CHANNELS = [
  "Organic_Search",
  "Paid_Search",
  "Paid_Social",
  "Referral",
  "Direct",
  "Influencer",
] as const;
export const CITY_TIERS = ["Tier_1", "Tier_2", "Tier_3"] as const;
export const CATEGORIES = [
  "Electronics",
  "Fashion & Apparel",
  "Home & Kitchen",
  "Beauty & Personal Care",
  "Grocery & Essentials",
  "Footwear & Accessories",
] as const;

export interface Filters {
  /** Inclusive start date, YYYY-MM-DD. `null` = earliest available. */
  from: string | null;
  /** Inclusive end date, YYYY-MM-DD. `null` = latest available. */
  to: string | null;
  devices: string[];
  channels: string[];
  cities: string[];
  tiers: string[];
  categories: string[];
}

export const EMPTY_FILTERS: Filters = {
  from: null,
  to: null,
  devices: [],
  channels: [],
  cities: [],
  tiers: [],
  categories: [],
};

/** URL query keys. Lists are comma-separated, e.g. `?device=Android,iOS`. */
export const FILTER_KEYS = {
  from: "from",
  to: "to",
  devices: "device",
  channels: "channel",
  cities: "city",
  tiers: "tier",
  categories: "category",
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// City is free text in the schema (VARCHAR(48)); allow letters, spaces and a few separators.
const CITY_RE = /^[\p{L} .&'-]{1,48}$/u;
const MAX_LIST = 64;

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function read(raw: RawParams, key: string): string | undefined {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? undefined;
  const v = raw[key];
  return Array.isArray(v) ? v.join(",") : v;
}

function isValidDate(value: string | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function list(raw: RawParams, key: string, allowed?: readonly string[], re?: RegExp): string[] {
  const value = read(raw, key);
  if (!value) return [];
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => (allowed ? allowed.includes(s) : re ? re.test(s) : false));
  return Array.from(new Set(items)).sort().slice(0, MAX_LIST);
}

export function parseFilters(raw: RawParams): Filters {
  let from = read(raw, FILTER_KEYS.from);
  let to = read(raw, FILTER_KEYS.to);
  from = isValidDate(from) ? from : undefined;
  to = isValidDate(to) ? to : undefined;
  if (from && to && from > to) [from, to] = [to, from];

  return {
    from: from ?? null,
    to: to ?? null,
    devices: list(raw, FILTER_KEYS.devices, DEVICES),
    channels: list(raw, FILTER_KEYS.channels, CHANNELS),
    cities: list(raw, FILTER_KEYS.cities, undefined, CITY_RE),
    tiers: list(raw, FILTER_KEYS.tiers, CITY_TIERS),
    categories: list(raw, FILTER_KEYS.categories, CATEGORIES),
  };
}

/** Serialise to a stable query string (sorted, so it doubles as a cache key). */
export function filtersToSearchParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.from) p.set(FILTER_KEYS.from, f.from);
  if (f.to) p.set(FILTER_KEYS.to, f.to);
  const lists: [keyof typeof FILTER_KEYS, string[]][] = [
    ["devices", f.devices],
    ["channels", f.channels],
    ["cities", f.cities],
    ["tiers", f.tiers],
    ["categories", f.categories],
  ];
  for (const [k, v] of lists) if (v.length) p.set(FILTER_KEYS[k], [...v].sort().join(","));
  return p;
}

export function filtersKey(f: Filters): string {
  return filtersToSearchParams(f).toString() || "all";
}

export function activeFilterCount(f: Filters): number {
  return (
    (f.from || f.to ? 1 : 0) +
    f.devices.length +
    f.channels.length +
    f.cities.length +
    f.tiers.length +
    f.categories.length
  );
}

/** Human labels for raw enum values (`Paid_Social` → `Paid Social`). */
export function label(value: string): string {
  return value.replace(/_/g, " ");
}
