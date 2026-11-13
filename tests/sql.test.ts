import { describe, it, expect } from "vitest";
import { Params, sessionWhere, userWhere, clampPage } from "@/lib/server/sql";
import { parseFilters } from "@/lib/filters";

describe("SQL Parameterization & Query Builder", () => {
  it("collects positional parameters safely without string interpolation", () => {
    const p = new Params();
    const p1 = p.add("val1");
    const p2 = p.add(42);
    const p3 = p.add(["a", "b"]);

    expect(p1).toBe("$1");
    expect(p2).toBe("$2");
    expect(p3).toBe("$3");
    expect(p.values).toEqual(["val1", 42, ["a", "b"]]);
  });

  it("builds index-friendly half-open date range in sessionWhere", () => {
    const f = parseFilters({
      from: "2025-02-01",
      to: "2025-02-28",
      device: "Android",
    });
    const p = new Params();
    const clause = sessionWhere(f, p, "s");

    expect(clause).toContain("s.session_start_ts >= $1::date");
    expect(clause).toContain("s.session_start_ts < ($2::date + 1)");
    expect(clause).toContain("s.device_type = ANY($3::text[])");
    expect(p.values[0]).toBe("2025-02-01");
    expect(p.values[1]).toBe("2025-02-28");
    expect(p.values[2]).toEqual(["Android"]);
  });

  it("handles empty filters by returning TRUE predicate", () => {
    const f = parseFilters({});
    const p = new Params();
    const clause = sessionWhere(f, p, "s");

    expect(clause).toBe("TRUE");
    expect(p.values.length).toBe(0);
  });

  it("clamps pagination boundaries to prevent out-of-memory or negative offsets", () => {
    expect(clampPage(0, 10)).toEqual({ page: 1, pageSize: 10, offset: 0 });
    expect(clampPage(-5, 0)).toEqual({ page: 1, pageSize: 10, offset: 0 });
    expect(clampPage(3, 25)).toEqual({ page: 3, pageSize: 25, offset: 50 });
    expect(clampPage(1, 500, 100)).toEqual({ page: 1, pageSize: 100, offset: 0 });
  });
});
