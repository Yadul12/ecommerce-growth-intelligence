import { NextRequest, NextResponse } from "next/server";
import { parseFilters } from "@/lib/filters";
import {
  getChannelRetention,
  getCohortHeatmap,
  getUserEngagement,
  getRepeatPurchaseAndLtv,
  getCustomerSegmentation,
} from "@/lib/server/queries/retention";
import { DatabaseUnavailableError } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);

    const [channelRetention, cohortHeatmap, engagement, repeatAndLtv, segmentation] =
      await Promise.all([
        getChannelRetention(filters),
        getCohortHeatmap(filters),
        getUserEngagement(filters),
        getRepeatPurchaseAndLtv(filters),
        getCustomerSegmentation(filters),
      ]);

    return NextResponse.json({
      channelRetention,
      cohortHeatmap,
      engagement,
      repeatAndLtv,
      segmentation,
      filters,
    });
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
    }
    console.error("Retention analytics error:", err);
    return NextResponse.json({ error: "Failed to query retention analytics" }, { status: 500 });
  }
}
