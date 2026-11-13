"use client";

import React, { useEffect, useState } from "react";
import { useDashboardFilters } from "@/hooks/use-filters";
import { formatCompactInr, formatInr, formatPct, formatInt } from "@/lib/utils";
import type {
  ChannelRetentionRow,
  CohortHeatmapRow,
  EngagementRow,
  RepeatCategoryLtvRow,
  CustomerSegmentRow,
} from "@/lib/server/queries/retention";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Users,
  AlertTriangle,
  Flame,
  Calendar,
  Layers,
  Award,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export function RetentionView() {
  const { filters } = useDashboardFilters();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [channelRetention, setChannelRetention] = useState<ChannelRetentionRow[]>([]);
  const [cohortHeatmap, setCohortHeatmap] = useState<CohortHeatmapRow[]>([]);
  const [engagement, setEngagement] = useState<EngagementRow[]>([]);
  const [repeatAndLtv, setRepeatAndLtv] = useState<RepeatCategoryLtvRow[]>([]);
  const [segmentation, setSegmentation] = useState<CustomerSegmentRow[]>([]);

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

        const res = await fetch(`/api/analytics/retention?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!ignore) {
          setChannelRetention(data.channelRetention || []);
          setCohortHeatmap(data.cohortHeatmap || []);
          setEngagement(data.engagement || []);
          setRepeatAndLtv(data.repeatAndLtv || []);
          setSegmentation(data.segmentation || []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load retention analytics");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchData();
    return () => {
      ignore = true;
    };
  }, [filters]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle>Database Query Error</AlertTitle>
        <AlertDescription className="text-xs">{error}</AlertDescription>
      </Alert>
    );
  }

  // Filter out the total row for the bar chart
  const channelBars = channelRetention.filter((c) => c.acquisition_channel !== "ALL_CHANNELS_TOTAL");

  // Helper function to color cohort heatmap cells
  const getHeatmapColor = (pct: number) => {
    if (pct >= 40) return "bg-emerald-600 text-white";
    if (pct >= 25) return "bg-emerald-500/80 text-white";
    if (pct >= 15) return "bg-emerald-400/40 text-emerald-950 dark:text-emerald-100";
    if (pct >= 8) return "bg-emerald-300/30 text-foreground";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Retention & Cohort Intelligence
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            D1/D7/D14/D30 user retention horizons, DAU/WAU/MAU product stickiness, and customer lifetime value curves.
          </p>
        </div>

        <Badge variant="outline" className="text-xs py-1 px-2.5 gap-1.5 border-primary/30 text-primary">
          <Flame className="w-3.5 h-3.5" />
          <span>Right-Censoring Guarded</span>
        </Badge>
      </div>

      {/* Top Grid: Channel Retention Bar Chart & DAU Stickiness Line Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Retention by Channel */}
        <Card className="lg:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Exact D1 / D7 / D14 / D30 Retention by Acquisition Channel
            </CardTitle>
            <CardDescription className="text-xs">
              Direct comparison of post-signup user retention curves across traffic sources.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelBars} margin={{ top: 15, right: 10, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="acquisition_channel"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: any) => [`${v}%`]} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                    <Bar dataKey="d1_retention_pct" name="D1 Retention" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="d7_retention_pct" name="D7 Retention" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="d14_retention_pct" name="D14 Retention" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="d30_retention_pct" name="D30 Retention" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* DAU and Rolling Stickiness */}
        <Card className="lg:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Daily Active Users (DAU) & 7-Day Rolling Average
            </CardTitle>
            <CardDescription className="text-xs">
              Daily platform engagement with DAU/MAU stickiness trendline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={engagement} margin={{ top: 15, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="activity_date" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="dau" tick={{ fontSize: 10 }} />
                    <YAxis
                      yAxisId="stickiness"
                      orientation="right"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(v: any, name: any) => [
                        name.includes("Stickiness") ? `${v}%` : formatInt(Number(v)),
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                    <Bar
                      yAxisId="dau"
                      dataKey="dau"
                      name="DAU"
                      fill="#3b82f6"
                      opacity={0.3}
                      radius={[2, 2, 0, 0]}
                    />
                    <Line
                      yAxisId="dau"
                      type="monotone"
                      dataKey="dau_7d_moving_avg"
                      name="7D Rolling DAU"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="stickiness"
                      type="monotone"
                      dataKey="dau_to_mau_stickiness_pct"
                      name="DAU/MAU Stickiness %"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cohort Heatmap Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Weekly Signup Cohort Retention Heatmap
          </CardTitle>
          <CardDescription className="text-xs">
            Tracking exact D1, D7, D14, and D30 retention milestones across weekly signup cohorts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Cohort Week</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Eligible Users</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Day 1 (D1)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Day 7 (D7)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Day 14 (D14)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Day 30 (D30)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cohortHeatmap.slice(0, 12).map((row) => (
                    <tr key={row.cohort_week} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-medium text-foreground">{row.cohort_week}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatInt(row.cohort_size)}</td>
                      <td className="py-1 px-2 text-center">
                        <span
                          className={`inline-block w-16 py-1 rounded text-[11px] font-semibold ${getHeatmapColor(
                            row.d1_pct
                          )}`}
                        >
                          {row.d1_pct}%
                        </span>
                      </td>
                      <td className="py-1 px-2 text-center">
                        <span
                          className={`inline-block w-16 py-1 rounded text-[11px] font-semibold ${getHeatmapColor(
                            row.d7_pct
                          )}`}
                        >
                          {row.d7_pct}%
                        </span>
                      </td>
                      <td className="py-1 px-2 text-center">
                        <span
                          className={`inline-block w-16 py-1 rounded text-[11px] font-semibold ${getHeatmapColor(
                            row.d14_pct
                          )}`}
                        >
                          {row.d14_pct}%
                        </span>
                      </td>
                      <td className="py-1 px-2 text-center">
                        <span
                          className={`inline-block w-16 py-1 rounded text-[11px] font-semibold ${getHeatmapColor(
                            row.d30_pct
                          )}`}
                        >
                          {row.d30_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom Grid: Repeat Purchase & LTV by Category + Customer Frequency Segmentation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Repeat Purchase and LTV by First Category */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Repeat Purchase Behavior & Realized LTV by First-Order Category
            </CardTitle>
            <CardDescription className="text-xs">
              Analyzes how the customer acquisition category dictates repeat frequency and inter-purchase intervals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2 px-3 font-semibold">First Category</th>
                    <th className="py-2 px-3 font-semibold text-right">Buyers</th>
                    <th className="py-2 px-3 font-semibold text-right">Repeat %</th>
                    <th className="py-2 px-3 font-semibold text-right">Orders/Buyer</th>
                    <th className="py-2 px-3 font-semibold text-right">Realized LTV</th>
                    <th className="py-2 px-3 font-semibold text-right">Days Between Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {repeatAndLtv.map((r) => (
                    <tr key={r.first_order_category} className="hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-foreground">{r.first_order_category}</td>
                      <td className="py-2.5 px-3 text-right">{formatInt(r.total_buyers)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {r.repeat_purchase_rate_pct}%
                      </td>
                      <td className="py-2.5 px-3 text-right">{r.avg_orders_per_buyer}</td>
                      <td className="py-2.5 px-3 text-right font-medium">{formatInr(r.avg_customer_ltv_inr)}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {r.avg_inter_purchase_days ? `${r.avg_inter_purchase_days}d` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Customer Segmentation */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Buyer Segmentation: Frequency vs Revenue Share
            </CardTitle>
            <CardDescription className="text-xs">
              Demonstrating customer concentration and power-buyer economics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 pt-1">
              {segmentation.map((seg) => (
                <div key={seg.segment_tier} className="p-3 rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{seg.segment_tier}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {seg.revenue_share_pct}% Revenue
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border/60 text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Customers</span>
                      <span className="font-bold text-foreground">
                        {formatInt(seg.user_count)} ({seg.user_pct}%)
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Total Revenue</span>
                      <span className="font-bold text-foreground">{formatCompactInr(seg.total_revenue_inr)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Avg Realized LTV</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatInr(seg.avg_ltv_inr)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
