"use client";

import React, { useEffect, useState } from "react";
import { useDashboardFilters } from "@/hooks/use-filters";
import { formatCompactInr, formatInr, formatPct, formatInt } from "@/lib/utils";
import type {
  ChannelEconomicsRow,
  RevenueLeakageRow,
  CategoryProfitabilityRow,
  PaymentMethodRiskRow,
} from "@/lib/server/queries/economics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DollarSign,
  AlertTriangle,
  CreditCard,
  Layers,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Percent,
} from "lucide-react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

export function EconomicsView() {
  const { filters } = useDashboardFilters();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [channelEconomics, setChannelEconomics] = useState<ChannelEconomicsRow[]>([]);
  const [leakage, setLeakage] = useState<{
    rows: RevenueLeakageRow[];
    page: number;
    pageSize: number;
    total: number;
  }>({ rows: [], page: 1, pageSize: 10, total: 0 });
  const [profitability, setProfitability] = useState<CategoryProfitabilityRow[]>([]);
  const [paymentRisk, setPaymentRisk] = useState<PaymentMethodRiskRow[]>([]);

  const [leakPage, setLeakPage] = useState(1);

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
        params.set("page", String(leakPage));
        params.set("pageSize", "10");

        const res = await fetch(`/api/analytics/economics?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!ignore) {
          setChannelEconomics(data.channelEconomics || []);
          setLeakage(data.leakage || { rows: [], page: 1, pageSize: 10, total: 0 });
          setProfitability(data.profitability || []);
          setPaymentRisk(data.paymentRisk || []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load economics analytics");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchData();
    return () => {
      ignore = true;
    };
  }, [filters, leakPage]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle>Database Query Error</AlertTitle>
        <AlertDescription className="text-xs">{error}</AlertDescription>
      </Alert>
    );
  }

  const totalLeakPages = Math.max(1, Math.ceil(leakage.total / leakage.pageSize));

  // Channel scatter colors
  const channelColors: Record<string, string> = {
    Organic_Search: "#10b981",
    Direct: "#3b82f6",
    Referral: "#6366f1",
    Paid_Search: "#f59e0b",
    Paid_Social: "#ef4444",
    Influencer: "#ec4899",
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Channel Quality & Product Category Economics
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Unit economics, net ARPU, catalog profit margins, COD doorstep cancellations, and revenue leakage diagnostics.
          </p>
        </div>

        <Badge variant="outline" className="text-xs py-1 px-2.5 gap-1.5 border-primary/30 text-primary">
          <DollarSign className="w-3.5 h-3.5" />
          <span>Real COGS & Margins</span>
        </Badge>
      </div>

      {/* Top Grid: Channel Quality Matrix Bubble Chart & Payment Method Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Channel Quality Matrix (Scatter / Bubble) */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Channel Quality Matrix: Repeat Rate vs. Net ARPU (Bubble = GMV)
            </CardTitle>
            <CardDescription className="text-xs">
              Top-right quadrant indicates high-value channels (high repeat rate + high realized revenue per user).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 25, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      type="number"
                      dataKey="repeat_purchase_rate_pct"
                      name="Repeat Purchase Rate"
                      unit="%"
                      tick={{ fontSize: 10 }}
                      domain={["auto", "auto"]}
                    />
                    <YAxis
                      type="number"
                      dataKey="net_revenue_per_user_arpu_inr"
                      name="Net ARPU"
                      unit="₹"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `₹${v}`}
                    />
                    <ZAxis
                      type="number"
                      dataKey="gmv_inr"
                      range={[150, 900]}
                      name="Gross GMV"
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      formatter={(val: any, name: any) => [
                        name === "Net ARPU" || name === "Gross GMV" ? formatInr(Number(val)) : `${val}%`,
                        name,
                      ]}
                      labelFormatter={(_: any, payload: any) =>
                        payload?.[0]?.payload?.acquisition_channel || "Channel"
                      }
                    />
                    <Scatter name="Channels" data={channelEconomics}>
                      {channelEconomics.map((entry) => (
                        <Cell
                          key={entry.acquisition_channel}
                          fill={channelColors[entry.acquisition_channel] || "#3b82f6"}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Method Risk Profile */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Payment Method Performance & Cancellation Risk
            </CardTitle>
            <CardDescription className="text-xs">
              COD doorstep refusals vs digital prepaid retention and refund metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            {paymentRisk.map((pm) => (
              <div
                key={pm.payment_method}
                className={`p-2.5 rounded-lg border text-xs ${
                  pm.payment_method === "COD"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between font-semibold text-foreground">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{pm.payment_method}</span>
                  </div>
                  <span className="font-mono text-muted-foreground">{formatInt(pm.orders)} orders</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border/60 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Cancellation Rate</span>
                    <span
                      className={`font-bold ${
                        pm.cancellation_rate_pct > 12 ? "text-rose-500" : "text-foreground"
                      }`}
                    >
                      {pm.cancellation_rate_pct}%
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Refund Rate</span>
                    <span className="font-bold text-foreground">{pm.refund_rate_pct}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Retained Revenue</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {pm.retained_revenue_pct}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Channel Economics Full Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Acquisition Channel Unit Economics Breakdown
          </CardTitle>
          <CardDescription className="text-xs">
            Evaluating traffic acquisition channels by user conversion, repeat rate, gross GMV, realized revenue, and net ARPU.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2 px-3 font-semibold">Channel</th>
                  <th className="py-2 px-3 font-semibold text-right">Acquired</th>
                  <th className="py-2 px-3 font-semibold text-right">Converting</th>
                  <th className="py-2 px-3 font-semibold text-right">User CVR</th>
                  <th className="py-2 px-3 font-semibold text-right">Repeat %</th>
                  <th className="py-2 px-3 font-semibold text-right">Orders</th>
                  <th className="py-2 px-3 font-semibold text-right">GMV</th>
                  <th className="py-2 px-3 font-semibold text-right">Realized Net</th>
                  <th className="py-2 px-3 font-semibold text-right">Net AOV</th>
                  <th className="py-2 px-3 font-semibold text-right">Net ARPU</th>
                  <th className="py-2 px-3 font-semibold text-right">Discount %</th>
                  <th className="py-2 px-3 font-semibold text-right">Refund %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {channelEconomics.map((ch) => (
                  <tr key={ch.acquisition_channel} className="hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-foreground flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: channelColors[ch.acquisition_channel] || "#666" }}
                      />
                      {ch.acquisition_channel}
                    </td>
                    <td className="py-2.5 px-3 text-right">{formatInt(ch.acquired_users)}</td>
                    <td className="py-2.5 px-3 text-right">{formatInt(ch.converting_users)}</td>
                    <td className="py-2.5 px-3 text-right">{ch.user_conversion_rate_pct}%</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {ch.repeat_purchase_rate_pct}%
                    </td>
                    <td className="py-2.5 px-3 text-right">{formatInt(ch.total_orders)}</td>
                    <td className="py-2.5 px-3 text-right">{formatInr(ch.gmv_inr)}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {formatInr(ch.net_realized_revenue_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right">{formatInr(ch.net_aov_inr)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-foreground">
                      {formatInr(ch.net_revenue_per_user_arpu_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-500 font-mono">
                      {ch.avg_discount_pct}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-500 font-mono">
                      {ch.order_refund_rate_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Product Category Profitability with Real COGS */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Product Category Profitability & Margin Analysis
          </CardTitle>
          <CardDescription className="text-xs">
            Synthesized from line items and catalog costs (`products.cost_inr`), demonstrating gross margins and promotional discounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2 px-3 font-semibold">Category</th>
                  <th className="py-2 px-3 font-semibold text-right">Units Sold</th>
                  <th className="py-2 px-3 font-semibold text-right">Gross Revenue</th>
                  <th className="py-2 px-3 font-semibold text-right">COGS</th>
                  <th className="py-2 px-3 font-semibold text-right">Gross Profit</th>
                  <th className="py-2 px-3 font-semibold text-right">Gross Margin %</th>
                  <th className="py-2 px-3 font-semibold text-right">Discounts</th>
                  <th className="py-2 px-3 font-semibold text-right">Realized Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profitability.map((p) => (
                  <tr key={p.category} className="hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-foreground">{p.category}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatInt(p.items_sold)}</td>
                    <td className="py-2.5 px-3 text-right">{formatInr(p.gross_revenue_inr)}</td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground">{formatInr(p.cogs_inr)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {formatInr(p.gross_profit_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Badge variant="outline" className="text-[10px]">
                        {p.gross_margin_pct}%
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-500 font-mono">
                      -{formatInr(p.discounts_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-foreground">
                      {p.realized_margin_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Top Revenue Leakage Segments (Paginated) */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold">
                Revenue Leakage Decomposition by Category, Payment & Coupon
              </CardTitle>
              <CardDescription className="text-xs">
                Ranking the largest sources of lost revenue across discounts, cancellations, and processed refunds.
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              Total Segments: {leakage.total} | Page {leakage.page} of {totalLeakPages}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2 px-3 font-semibold">Category</th>
                  <th className="py-2 px-3 font-semibold">Payment</th>
                  <th className="py-2 px-3 font-semibold">Coupon</th>
                  <th className="py-2 px-3 font-semibold text-right">Orders</th>
                  <th className="py-2 px-3 font-semibold text-right">Gross Amount</th>
                  <th className="py-2 px-3 font-semibold text-right">Discount</th>
                  <th className="py-2 px-3 font-semibold text-right">Cancelled</th>
                  <th className="py-2 px-3 font-semibold text-right">Refunded</th>
                  <th className="py-2 px-3 font-semibold text-right">Total Leakage</th>
                  <th className="py-2 px-3 font-semibold text-right">Retained Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leakage.rows.map((row, idx) => (
                  <tr key={`${row.product_category}-${row.payment_method}-${row.coupon_segment}-${idx}`} className="hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-foreground">{row.product_category}</td>
                    <td className="py-2.5 px-3">{row.payment_method}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                      {row.coupon_segment}
                    </td>
                    <td className="py-2.5 px-3 text-right">{formatInt(row.total_orders)}</td>
                    <td className="py-2.5 px-3 text-right">{formatInr(row.gross_amount_inr)}</td>
                    <td className="py-2.5 px-3 text-right text-rose-500 font-mono">
                      -{formatInr(row.discount_leakage_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-500 font-mono">
                      -{formatInr(row.cancellation_leakage_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-purple-500 font-mono">
                      -{formatInr(row.refund_leakage_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                      -{formatInr(row.total_leakage_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {formatInr(row.retained_net_revenue_inr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Showing {(leakPage - 1) * leakage.pageSize + 1} to{" "}
              {Math.min(leakPage * leakage.pageSize, leakage.total)} of {leakage.total}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={leakPage <= 1}
                onClick={() => setLeakPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={leakPage >= totalLeakPages}
                onClick={() => setLeakPage((p) => Math.min(totalLeakPages, p + 1))}
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
