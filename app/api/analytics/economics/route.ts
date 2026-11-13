import { NextRequest, NextResponse } from "next/server";
import { parseFilters } from "@/lib/filters";
import {
  getChannelEconomics,
  getRevenueLeakage,
  getCategoryProfitability,
  getPaymentMethodRisk,
} from "@/lib/server/queries/economics";
import { clampPage } from "@/lib/server/sql";
import { DatabaseUnavailableError } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);
    const pageOpts = clampPage(
      req.nextUrl.searchParams.get("page"),
      req.nextUrl.searchParams.get("pageSize") || 10
    );

    const [channelEconomics, leakage, profitability, paymentRisk] = await Promise.all([
      getChannelEconomics(filters),
      getRevenueLeakage(filters, pageOpts),
      getCategoryProfitability(filters),
      getPaymentMethodRisk(filters),
    ]);

    return NextResponse.json({
      channelEconomics,
      leakage,
      profitability,
      paymentRisk,
      filters,
    });
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
    }
    console.error("Economics analytics error:", err);
    return NextResponse.json({ error: "Failed to query economics analytics" }, { status: 500 });
  }
}
