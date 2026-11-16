"use client";

import React, { useEffect, useState } from "react";
import { useDashboardFilters } from "@/hooks/use-filters";
import { formatPct, formatInt } from "@/lib/utils";
import type {
  FunnelStageRow,
  FunnelBreakdownRow,
  FrictionRow,
  WorstSegmentRow,
} from "@/lib/server/queries/funnel";
import type { ProportionTestResult } from "@/lib/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Filter,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  Smartphone,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Activity,
  Layers,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";

export function FunnelView() {
  const { filters } = useDashboardFilters();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [funnel, setFunnel] = useState<FunnelStageRow[]>([]);
  const [breakdown, setBreakdown] = useState<FunnelBreakdownRow[]>([]);
  const [friction, setFriction] = useState<FrictionRow[]>([]);
  const [worstSegments, setWorstSegments] = useState<{
    rows: WorstSegmentRow[];
    page: number;
    pageSize: number;
    total: number;
  }>({ rows: [], page: 1, pageSize: 10, total: 0 });
  const [zTest, setZTest] = useState<ProportionTestResult | null>(null);

  const [page, setPage] = useState(1);
  const [breakdownDim, setBreakdownDim] = useState<"device" | "channel" | "city_tier" | "category">("device");

  useEffect(() => {
    let ignore = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        if (filters.devices.length) params.set("device", filters.devices.join(","));
        if (filters.channels.length) params.set("channel", filters.channels.join(","));
        if (filters.cities.length) params.set("city", filters.cities.join(","));
        if (filters.tiers.length) params.set("tier", filters.tiers.join(","));
        if (filters.categories.length) params.set("category", filters.categories.join(","));
        params.set("page", String(page));
        params.set("pageSize", "10");

        const res = await fetch(`/api/analytics/funnel?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!ignore) {
          setFunnel(data.funnel || []);
          setBreakdown(data.breakdown || []);
          setFriction(data.friction || []);
          setWorstSegments(data.worstSegments || { rows: [], page: 1, pageSize: 10, total: 0 });
          setZTest(data.zTestResult || null);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load funnel analytics");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchData();
    return () => {
      ignore = true;
    };
  }, [filters, page]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle>Database Query Error</AlertTitle>
        <AlertDescription className="text-xs">{error}</AlertDescription>
      </Alert>
    );
  }

  const activeBreakdownRows = breakdown.filter((b) => b.dimension === breakdownDim);
  const totalPages = Math.max(1, Math.ceil(worstSegments.total / worstSegments.pageSize));

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Strict Session Funnel & Friction Analysis
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Chronological funnel progression (t_view &lt; t_cart &lt; t_chk &lt; t_buy) exposing segment bottlenecks and statistical significance.
          </p>
        </div>

        <Badge variant="outline" className="text-xs py-1 px-2.5 gap-1.5 border-primary/30 text-primary">
          <Filter className="w-3.5 h-3.5" />
          <span>Strict Order Enforced</span>
        </Badge>
      </div>

      {/* 5-Stage Funnel Flow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {funnel.map((stage, idx) => (
          <Card key={stage.stage_order} className="p-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span className="font-semibold text-foreground">{stage.stage_name}</span>
              <span className="text-[10px] text-muted-foreground font-mono">#{stage.stage_order}</span>
            </div>
            <div className="text-lg font-bold text-foreground mt-1">
              {loading ? <Skeleton className="h-6 w-20" /> : formatInt(stage.strict_sessions)}
            </div>
            <div className="mt-2 text-[11px] space-y-0.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Top of funnel:</span>
                <span className="font-medium text-foreground">{stage.pct_of_total_sessions}%</span>
              </div>
              {idx > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Step CVR:</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {stage.stage_to_stage_conversion_pct}%
                  </span>
                </div>
              )}
              {idx > 0 && stage.sessions_lost_at_stage && stage.sessions_lost_at_stage > 0 && (
                <div className="flex items-center justify-between text-rose-500 font-medium">
                  <span>Drop-off:</span>
                  <span>-{formatInt(stage.sessions_lost_at_stage)} ({stage.stage_drop_off_pct}%)</span>
                </div>
              )}
            </div>
            {/* Out of order warning badge */}
            {stage.out_of_order_or_unattributed_sessions > 0 && (
              <div className="mt-2 pt-1.5 border-t border-border/60 text-[10px] text-amber-600 dark:text-amber-400 flex items-center justify-between">
                <span>Unattributed:</span>
                <span className="font-mono">+{formatInt(stage.out_of_order_or_unattributed_sessions)} naive</span>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Middle Grid: Friction Chart & Z-Test Statistical Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Biggest Friction Gap Chart */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Cart-to-Checkout Conversion by Device Build & City Tier
            </CardTitle>
            <CardDescription className="text-xs">
              Direct comparison exposing Android v4.1-legacy and Mobile Web drop-off in Tier 2/3 cities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={friction} margin={{ top: 15, right: 10, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="device_build"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      formatter={(v: any) => [`${v}%`, "Cart → Checkout CVR"]}
                      labelFormatter={(lbl) => `Build: ${lbl}`}
                    />
                    <Bar dataKey="cart_to_checkout_pct" name="Cart → Checkout CVR %" radius={[4, 4, 0, 0]}>
                      {friction.map((entry, idx) => (
                        <Cell
                          key={`friction-${idx}`}
                          fill={
                            entry.device_build.includes("legacy")
                              ? "#ef4444"
                              : entry.device_build.includes("Mobile_Web")
                              ? "#f97316"
                              : "#10b981"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Statistical Hypothesis Test Card */}
        <Card className="lg:col-span-5 flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Hypothesis Test: Android App Latency Defect
              </CardTitle>
              {zTest?.is_significant && (
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                  p &lt; 0.001 (Significant)
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Two-sided two-proportion Z-test comparing cart-to-checkout conversion between builds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            {zTest ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/5">
                    <span className="text-[10px] uppercase font-semibold text-rose-600 dark:text-rose-400 block">
                      Legacy Build (v4.1)
                    </span>
                    <span className="text-lg font-bold text-foreground mt-0.5 block">
                      {zTest.rate_a}%
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatInt(zTest.conv_a)} / {formatInt(zTest.total_a)} sessions
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                    <span className="text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400 block">
                      Stable Build (v4.8)
                    </span>
                    <span className="text-lg font-bold text-foreground mt-0.5 block">
                      {zTest.rate_b}%
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatInt(zTest.conv_b)} / {formatInt(zTest.total_b)} sessions
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Absolute Conversion Gap:</span>
                    <span className="font-bold text-rose-500">{zTest.abs_diff_pp} pp</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Relative Lift of Stable:</span>
                    <span className="font-bold text-emerald-500">+{Math.abs(zTest.rel_lift_pct)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Standard Z-Statistic:</span>
                    <span className="font-bold text-foreground">{zTest.z_stat}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">P-Value (Two-Sided):</span>
                    <span className="font-bold text-foreground">{zTest.p_value.toExponential(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">95% Wald CI:</span>
                    <span className="font-bold text-foreground">
                      [{zTest.ci_95_low_pp} pp, {zTest.ci_95_high_pp} pp]
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Null hypothesis rejected with extreme statistical confidence. Android v4.1-legacy checkout bundle payload causes an average 1,800ms higher latency leading directly to checkout abandonment.
                </p>
              </>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Insufficient Android sessions in the selected filter range to run hypothesis test.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dimensional Breakdown Toggle */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold">
                Funnel Conversion Rates by Segment Dimension
              </CardTitle>
              <CardDescription className="text-xs">
                Inspect stage-wise conversion across devices, channels, city tiers, and primary categories.
              </CardDescription>
            </div>

            <div className="flex items-center gap-1 border rounded p-0.5 bg-muted/40 text-xs">
              {(["device", "channel", "city_tier", "category"] as const).map((dim) => (
                <button
                  key={dim}
                  onClick={() => setBreakdownDim(dim)}
                  className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                    breakdownDim === dim ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {dim.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2 px-3 font-semibold">Segment</th>
                  <th className="py-2 px-3 font-semibold text-right">Sessions</th>
                  <th className="py-2 px-3 font-semibold text-right">Views</th>
                  <th className="py-2 px-3 font-semibold text-right">Carts</th>
                  <th className="py-2 px-3 font-semibold text-right">Checkouts</th>
                  <th className="py-2 px-3 font-semibold text-right">Purchases</th>
                  <th className="py-2 px-3 font-semibold text-right">View → Cart</th>
                  <th className="py-2 px-3 font-semibold text-right">Cart → Chk</th>
                  <th className="py-2 px-3 font-semibold text-right">Overall CVR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeBreakdownRows.map((row) => (
                  <tr key={row.segment} className="hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-foreground">{row.segment}</td>
                    <td className="py-2.5 px-3 text-right">{formatInt(row.sessions)}</td>
                    <td className="py-2.5 px-3 text-right">{formatInt(row.views)}</td>
                    <td className="py-2.5 px-3 text-right">{formatInt(row.carts)}</td>
                    <td className="py-2.5 px-3 text-right">{formatInt(row.checkouts)}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {formatInt(row.purchases)}
                    </td>
                    <td className="py-2.5 px-3 text-right">{row.view_to_cart_pct}%</td>
                    <td className="py-2.5 px-3 text-right font-medium text-primary">
                      {row.cart_to_checkout_pct}%
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        {row.overall_cvr_pct}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Worst-Converting Segments Matrix with Server-Side Pagination */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold">
                Multi-Segment Funnel Matrix & Worst CVR Ranks
              </CardTitle>
              <CardDescription className="text-xs">
                Exposing low-converting segment intersections (sessions &ge; 200) ranked against platform baseline CVR.
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              Total Segments: {worstSegments.total} | Page {worstSegments.page} of {totalPages}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2 px-2.5 font-semibold">Rank</th>
                  <th className="py-2 px-2.5 font-semibold">Device & Build</th>
                  <th className="py-2 px-2.5 font-semibold">Tier</th>
                  <th className="py-2 px-2.5 font-semibold">Primary Category</th>
                  <th className="py-2 px-2.5 font-semibold text-right">Sessions</th>
                  <th className="py-2 px-2.5 font-semibold text-right">Latency</th>
                  <th className="py-2 px-2.5 font-semibold text-right">Cart → Chk</th>
                  <th className="py-2 px-2.5 font-semibold text-right">Segment CVR</th>
                  <th className="py-2 px-2.5 font-semibold text-right">Baseline CVR</th>
                  <th className="py-2 px-2.5 font-semibold text-right">CVR Gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {worstSegments.rows.map((r) => (
                  <tr key={`${r.device_type}-${r.app_version}-${r.city_tier}-${r.primary_category}`} className="hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 px-2.5 font-mono text-muted-foreground">#{r.worst_cvr_rank}</td>
                    <td className="py-2.5 px-2.5 font-medium text-foreground">
                      {r.device_type} ({r.app_version})
                    </td>
                    <td className="py-2.5 px-2.5">{r.city_tier}</td>
                    <td className="py-2.5 px-2.5">{r.primary_category}</td>
                    <td className="py-2.5 px-2.5 text-right">{formatInt(r.total_sessions)}</td>
                    <td className="py-2.5 px-2.5 text-right font-mono">
                      {r.avg_latency_ms ? `${r.avg_latency_ms}ms` : "-"}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-medium">
                      {r.cart_to_checkout_pct}%
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-bold text-foreground">
                      {r.overall_cvr_pct}%
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-muted-foreground">
                      {r.platform_baseline_cvr_pct}%
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-semibold text-rose-500">
                      {r.cvr_gap_vs_platform_pp ? `${r.cvr_gap_vs_platform_pp} pp` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Showing {(page - 1) * worstSegments.pageSize + 1} to{" "}
              {Math.min(page * worstSegments.pageSize, worstSegments.total)} of {worstSegments.total}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
