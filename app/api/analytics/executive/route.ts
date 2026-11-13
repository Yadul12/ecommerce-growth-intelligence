import { NextRequest, NextResponse } from "next/server";
import { parseFilters } from "@/lib/filters";
import {
  getExecutiveKpis,
  getRevenueTrend,
  getCategoryContribution,
} from "@/lib/server/queries/executive";
import { DatabaseUnavailableError } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);
    const grain = req.nextUrl.searchParams.get("grain") === "month" ? "month" : "week";

    const [kpis, trend, categories] = await Promise.all([
      getExecutiveKpis(filters),
      getRevenueTrend(filters, grain),
      getCategoryContribution(filters),
    ]);

    return NextResponse.json({
      kpis,
      trend,
      categories,
      filters,
    });
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
    }
    console.error("Executive analytics error:", err);
    return NextResponse.json({ error: "Failed to query executive analytics" }, { status: 500 });
  }
}
