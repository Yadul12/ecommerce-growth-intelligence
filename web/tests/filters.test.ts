import { describe, it, expect } from "vitest";
import {
  parseFilters,
  filtersToSearchParams,
  filtersKey,
  activeFilterCount,
} from "@/lib/filters";

describe("Filter Model & Parsing", () => {
  it("parses empty or missing parameters to empty filter state", () => {
    const f = parseFilters(new URLSearchParams());
    expect(f.from).toBeNull();
    expect(f.to).toBeNull();
    expect(f.devices).toEqual([]);
    expect(f.channels).toEqual([]);
    expect(f.cities).toEqual([]);
    expect(f.tiers).toEqual([]);
    expect(f.categories).toEqual([]);
    expect(activeFilterCount(f)).toBe(0);
  });

  it("validates and parses dates correctly", () => {
    const f = parseFilters({
      from: "2025-01-15",
      to: "2025-03-31",
    });
    expect(f.from).toBe("2025-01-15");
    expect(f.to).toBe("2025-03-31");
    expect(activeFilterCount(f)).toBe(1);
  });

  it("swaps inverted date ranges automatically", () => {
    const f = parseFilters({
      from: "2025-06-30",
      to: "2025-01-01",
    });
    expect(f.from).toBe("2025-01-01");
    expect(f.to).toBe("2025-06-30");
  });

  it("drops invalid enum values to prevent injection", () => {
    const f = parseFilters({
      device: "Android,MaliciousDevice,iOS",
      channel: "Organic_Search,'; DROP TABLE users;--",
      tier: "Tier_1,InvalidTier",
    });
    expect(f.devices).toEqual(["Android", "iOS"]);
    expect(f.channels).toEqual(["Organic_Search"]);
    expect(f.tiers).toEqual(["Tier_1"]);
  });

  it("serialises filters to stable search params and cache key", () => {
    const f = parseFilters({
      device: "iOS,Android",
      channel: "Paid_Search",
      from: "2025-01-01",
    });
    const params = filtersToSearchParams(f);
    // Devices should be sorted stably
    expect(params.get("device")).toBe("Android,iOS");
    expect(params.get("channel")).toBe("Paid_Search");
    expect(params.get("from")).toBe("2025-01-01");
    expect(filtersKey(f)).toContain("device=Android%2CiOS");
  });
});
