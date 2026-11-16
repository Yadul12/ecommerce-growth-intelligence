import { NextRequest, NextResponse } from "next/server";
import { parseFilters } from "@/lib/filters";
import {
  getStrictFunnel,
  getFunnelBreakdown,
  getFrictionMatrix,
  getWorstSegments,
  getAppVersionCartToCheckout,
} from "@/lib/server/queries/funnel";
import { clampPage } from "@/lib/server/sql";
import { twoProportionZTest } from "@/lib/analytics";
import { DatabaseUnavailableError } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);
    const pageOpts = clampPage(
      req.nextUrl.searchParams.get("page"),
      req.nextUrl.searchParams.get("pageSize") || 10
    );

    const [funnel, breakdown, friction, worstSegments, appVersions] = await Promise.all([
      getStrictFunnel(filters),
      getFunnelBreakdown(filters),
      getFrictionMatrix(filters),
      getWorstSegments(filters, pageOpts),
      getAppVersionCartToCheckout(filters),
    ]);

    // Statistical test between Android legacy and stable
    let zTestResult = null;
    const legacy = appVersions.find((v) => v.app_version === "v4.1-legacy");
    const stable = appVersions.find((v) => v.app_version === "v4.8-stable");
    if (legacy && stable && legacy.cart_sessions > 0 && stable.cart_sessions > 0) {
      zTestResult = twoProportionZTest(
        legacy.checkout_sessions,
        legacy.cart_sessions,
        stable.checkout_sessions,
        stable.cart_sessions,
        "Android v4.1-legacy",
        "Android v4.8-stable"
      );
    }

    return NextResponse.json({
      funnel,
      breakdown,
      friction,
      worstSegments,
      appVersions,
      zTestResult,
      filters,
    });
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
    }
    console.error("Funnel analytics error:", err);
    return NextResponse.json({ error: "Failed to query funnel analytics" }, { status: 500 });
  }
}
