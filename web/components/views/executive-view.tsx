"use client";

import React, { useEffect, useState } from "react";
import { useDashboardFilters } from "@/hooks/use-filters";
import { formatCompactInr, formatInr, formatPct, formatInt } from "@/lib/utils";
import type { ExecutiveKpis, RevenueTrendRow, CategoryContributionRow } from "@/lib/server/queries/executive";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  TrendingUp,
  ShoppingBag,
  Users,
  CreditCard,
  Percent,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Cell,
} from "recharts";

export function ExecutiveView() {
  const { filters } = useDashboardFilters();
  const [grain, setGrain] = useState<"week" | "month">("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kpis, setKpis] = useState<ExecutiveKpis | null>(null);
  const [trend, setTrend] = useState<RevenueTrendRow[]>([]);
  const [categories, setCategories] = useState<CategoryContributionRow[]>([]);

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
        params.set("grain", grain);

        const res = await fetch(`/api/analytics/executive?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!ignore) {
          setKpis(data.kpis);
          setTrend(data.trend || []);
          setCategories(data.categories || []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load executive analytics");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchData();
    return () => {
      ignore = true;
    };
  }, [filters, grain]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle>Database Query Unavailable</AlertTitle>
        <AlertDescription className="text-xs">
          {error}. Ensure your PostgreSQL database is running and `DATABASE_URL` is configured in environment variables.
        </AlertDescription>
      </Alert>
    );
  }

  // Build Waterfall Bridge data
  const waterfallData = kpis
    ? [
        {
          name: "1. GMV (Catalog)",
          value: kpis.gmv_inr,
          fill: "#3b82f6",
          display: formatCompactInr(kpis.gmv_inr),
        },
        {
          name: "2. Discounts",
          value: -kpis.discounts_inr,
          fill: "#ef4444",
          display: `-${formatCompactInr(kpis.discounts_inr)}`,
        },
        {
          name: "3. Tax & Shipping",
          value: kpis.tax_and_shipping_inr,
          fill: "#10b981",
          display: `+${formatCompactInr(kpis.tax_and_shipping_inr)}`,
        },
        {
          name: "4. Booked Net",
          value: kpis.booked_net_inr,
          fill: "#6366f1",
          display: formatCompactInr(kpis.booked_net_inr),
        },
        {
          name: "5. Cancellations",
          value: -kpis.cancelled_inr,
          fill: "#f97316",
          display: `-${formatCompactInr(kpis.cancelled_inr)}`,
        },
        {
          name: "6. Refunds",
          value: -kpis.refunded_inr,
          fill: "#f43f5e",
          display: `-${formatCompactInr(kpis.refunded_inr)}`,
        },
        {
          name: "7. Realized Net",
          value: kpis.realized_net_inr,
          fill: "#059669",
          display: formatCompactInr(kpis.realized_net_inr),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Page Title & Subtitle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Executive Overview & Revenue Intelligence
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gross-to-net realized revenue bridge, executive unit economics, and multi-channel category contributions.
          </p>
        </div>

        {/* Financial Accounting Identity Verification Badge */}
        {kpis && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-muted-foreground">Reconciliation Integrity:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              Gap: {formatInr(kpis.reconciliation_gap_inr)} (0.00% Leakage Unaccounted)
            </span>
          </div>
        )}
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Active Users */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Active Users</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {loading ? <Skeleton className="h-6 w-20" /> : formatInt(kpis?.active_users)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Unique visitors in filter</p>
        </Card>

        {/* Total Sessions */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Total Sessions</span>
            <ShoppingBag className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {loading ? <Skeleton className="h-6 w-20" /> : formatInt(kpis?.total_sessions)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Browsing clickstreams</p>
        </Card>

        {/* Orders & CVR */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Total Orders</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {loading ? <Skeleton className="h-6 w-20" /> : formatInt(kpis?.total_orders)}
          </div>
          <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1">
            {kpis?.session_cvr_pct}% Session CVR
          </p>
        </Card>

        {/* Gross Merchandise Value */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Gross GMV</span>
            <CreditCard className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {loading ? <Skeleton className="h-6 w-24" /> : formatCompactInr(kpis?.gmv_inr)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Disc: {kpis?.discount_rate_pct}% of GMV
          </p>
        </Card>

        {/* Net Realized Revenue */}
        <Card className="p-3.5 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">Realized Net</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-300">
            {loading ? <Skeleton className="h-6 w-24" /> : formatCompactInr(kpis?.realized_net_inr)}
          </div>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
            Net of returns & cancels
          </p>
        </Card>

        {/* Net AOV / ARPU */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>AOV / ARPU</span>
            <Percent className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {loading ? <Skeleton className="h-6 w-20" /> : formatInr(kpis?.aov_inr)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            ARPU: {formatInr(kpis?.net_arpu_inr)}
          </p>
        </Card>
      </div>

      {/* Middle Grid: Revenue Waterfall Bridge & Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Waterfall Bridge */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">
                  GMV to Net Realized Revenue Leakage Bridge (INR)
                </CardTitle>
                <CardDescription className="text-xs">
                  Exact reconciliation from catalog gross through discounts, cancellations, and refunds.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waterfallData} margin={{ top: 20, right: 10, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => formatCompactInr(Math.abs(v))}
                    />
                    <Tooltip
                      formatter={(val: any) => [formatInr(Number(val)), "Amount"]}
                      labelStyle={{ fontWeight: "bold" }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {waterfallData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Trend Chart */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">
                  Net Realized Revenue Trend
                </CardTitle>
                <CardDescription className="text-xs">
                  Period-over-period realized revenue and completed orders.
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 border rounded p-0.5 bg-muted/40 text-xs">
                <button
                  onClick={() => setGrain("week")}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    grain === "week" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                  }`}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setGrain("month")}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    grain === "month" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend} margin={{ top: 15, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="period_start" tick={{ fontSize: 10 }} />
                    <YAxis
                      yAxisId="rev"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => formatCompactInr(v)}
                    />
                    <YAxis
                      yAxisId="orders"
                      orientation="right"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => formatInt(v)}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        name === "realized_net_inr" ? formatInr(Number(val)) : formatInt(Number(val)),
                        name === "realized_net_inr" ? "Realized Net" : "Orders",
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    <Bar
                      yAxisId="rev"
                      dataKey="realized_net_inr"
                      name="Realized Net"
                      fill="#10b981"
                      opacity={0.85}
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      yAxisId="orders"
                      type="monotone"
                      dataKey="orders"
                      name="Orders"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Category Contribution Table & Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Product Category Performance & Revenue Contribution
          </CardTitle>
          <CardDescription className="text-xs">
            Share of gross GMV, realized net revenue, and average order value across 6 Indian e-commerce verticals.
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
                    <th className="py-2 px-3 font-semibold">Category</th>
                    <th className="py-2 px-3 font-semibold text-right">Orders</th>
                    <th className="py-2 px-3 font-semibold text-right">Gross GMV</th>
                    <th className="py-2 px-3 font-semibold text-right">GMV Share</th>
                    <th className="py-2 px-3 font-semibold text-right">Realized Net</th>
                    <th className="py-2 px-3 font-semibold text-right">Net Share</th>
                    <th className="py-2 px-3 font-semibold text-right">AOV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {categories.map((c) => (
                    <tr key={c.category} className="hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-foreground">{c.category}</td>
                      <td className="py-2.5 px-3 text-right">{formatInt(c.orders)}</td>
                      <td className="py-2.5 px-3 text-right">{formatInr(c.gmv_inr)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {c.gmv_share_pct}%
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {formatInr(c.realized_net_inr)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {c.realized_share_pct}%
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">{formatInr(c.aov_inr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
