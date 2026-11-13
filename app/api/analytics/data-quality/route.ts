import { NextRequest, NextResponse } from "next/server";
import {
  getDataQualityAudit,
  getTableVolumes,
  runExplainBenchmarks,
} from "@/lib/server/queries/data-quality";
import { calculateAbSampleSize } from "@/lib/analytics";
import { DatabaseUnavailableError } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const runBenchmarks = searchParams.get("benchmarks") === "true";

    const [audit, volumes, benchmarks] = await Promise.all([
      getDataQualityAudit(),
      getTableVolumes(),
      runBenchmarks ? runExplainBenchmarks() : Promise.resolve(null),
    ]);

    // Optional A/B test calculation parameter handling
    const baselineRate = parseFloat(searchParams.get("baselineRate") || "0.483");
    const relativeMde = parseFloat(searchParams.get("relativeMde") || "0.08");
    const alpha = parseFloat(searchParams.get("alpha") || "0.05");
    const power = parseFloat(searchParams.get("power") || "0.80");

    let abPlan = null;
    try {
      abPlan = calculateAbSampleSize(baselineRate, relativeMde, alpha, power);
    } catch {
      // Ignore calculation error if params are invalid
    }

    const passedChecks = audit.filter((c) => c.status === "PASS").length;
    const totalChecks = audit.length;
    const healthScorePct = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0;

    return NextResponse.json({
      audit,
      volumes,
      benchmarks,
      healthScore: {
        passed: passedChecks,
        total: totalChecks,
        percentage: healthScorePct,
        isHealthy: passedChecks === totalChecks,
      },
      abPlan,
    });
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
    }
    console.error("Data quality analytics error:", err);
    return NextResponse.json({ error: "Failed to query data quality audit" }, { status: 500 });
  }
}
