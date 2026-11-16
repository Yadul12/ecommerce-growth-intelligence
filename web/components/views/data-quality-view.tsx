"use client";

import React, { useEffect, useState } from "react";
import { formatInt } from "@/lib/utils";
import type {
  DataQualityCheckRow,
  TableVolumeRow,
  ExplainBenchmarkResult,
} from "@/lib/server/queries/data-quality";
import type { ABSamplePlan } from "@/lib/analytics";
import { calculateAbSampleSize } from "@/lib/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Database,
  Cpu,
  Calculator,
  Play,
  RotateCcw,
} from "lucide-react";

export function DataQualityView() {
  const [loading, setLoading] = useState(true);
  const [runningBenchmarks, setRunningBenchmarks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [audit, setAudit] = useState<DataQualityCheckRow[]>([]);
  const [volumes, setVolumes] = useState<TableVolumeRow[]>([]);
  const [benchmarks, setBenchmarks] = useState<ExplainBenchmarkResult[] | null>(null);
  const [healthScore, setHealthScore] = useState({
    passed: 0,
    total: 10,
    percentage: 100,
    isHealthy: true,
  });

  // A/B Calculator State
  const [baseCvr, setBaseCvr] = useState(48.3);
  const [relMde, setRelMde] = useState(8.0);
  const [power, setPower] = useState(0.8);
  const [abPlan, setAbPlan] = useState<ABSamplePlan | null>(null);

  useEffect(() => {
    try {
      const plan = calculateAbSampleSize(baseCvr / 100.0, relMde / 100.0, 0.05, power);
      setAbPlan(plan);
    } catch {
      setAbPlan(null);
    }
  }, [baseCvr, relMde, power]);

  const loadData = async (runBench = false) => {
    if (runBench) setRunningBenchmarks(true);
    else setLoading(true);
    setError(null);
    try {
      const url = runBench
        ? "/api/analytics/data-quality?benchmarks=true"
        : "/api/analytics/data-quality";
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAudit(data.audit || []);
      setVolumes(data.volumes || []);
      if (data.benchmarks) setBenchmarks(data.benchmarks);
      if (data.healthScore) setHealthScore(data.healthScore);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data quality checks");
    } finally {
      setLoading(false);
      setRunningBenchmarks(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle>Database Audit Error</AlertTitle>
        <AlertDescription className="text-xs">{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Data Quality Audit & SQL Benchmarks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            10-point automated database integrity audit, table row volume verification, and live PostgreSQL EXPLAIN (ANALYZE, BUFFERS) benchmarks.
          </p>
        </div>

        {healthScore.isHealthy ? (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs py-1 px-3 gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Health Score: {healthScore.passed}/{healthScore.total} Passing ({healthScore.percentage.toFixed(0)}%)</span>
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-xs py-1 px-3 gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Health Score: {healthScore.passed}/{healthScore.total} Passing ({healthScore.percentage.toFixed(0)}%)</span>
          </Badge>
        )}
      </div>

      {/* 10-Point Data Quality Audit Checklist Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Automated 10-Point SQL Data Quality & Financial Reconciliation Audit
          </CardTitle>
          <CardDescription className="text-xs">
            Directly executing `sql/09_data_quality_and_reconciliation.sql` across uniqueness, completeness, referential integrity, and revenue formulas.
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
                    <th className="py-2.5 px-3 font-semibold">#</th>
                    <th className="py-2.5 px-3 font-semibold">Category</th>
                    <th className="py-2.5 px-3 font-semibold">Assertion Description</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Failing Records</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {audit.map((check) => (
                    <tr key={check.check_id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-medium text-muted-foreground">
                        {check.check_id}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {check.check_category}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-foreground">{check.check_description}</td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {check.failing_records_count === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">0</span>
                        ) : (
                          <span className="text-rose-500 font-bold">{check.failing_records_count}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {check.status === "PASS" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                            PASS
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            FAIL
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Synthetic Dataset Table Row Volumes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Database Volume Requirements vs. Actual Scale (Fixed Seed = 42)
          </CardTitle>
          <CardDescription className="text-xs">
            Verifying that all relational tables strictly meet or exceed portfolio analytics volume standards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {volumes.map((v) => (
              <div key={v.table_name} className="p-3 rounded-lg border border-border bg-card">
                <span className="text-[11px] font-mono font-semibold uppercase text-muted-foreground block">
                  {v.table_name}
                </span>
                <span className="text-base font-bold text-foreground mt-1 block">
                  {formatInt(v.actual_count)}
                </span>
                <div className="flex items-center justify-between text-[10px] mt-1 text-muted-foreground">
                  <span>Req: &ge;{formatInt(v.required_minimum)}</span>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 border-emerald-500/30 text-emerald-600">
                    {v.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Interactive A/B Test Sample Size Calculator */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">
              Interactive A/B Test Power & Sample Size Calculator
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Determines the minimum required session volume per arm to detect funnel conversion lifts with statistical significance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="text-muted-foreground font-medium">Baseline Conversion Rate (%):</label>
                <span className="font-bold text-foreground">{baseCvr}%</span>
              </div>
              <input
                type="range"
                min="10.0"
                max="80.0"
                step="0.5"
                value={baseCvr}
                onChange={(e) => setBaseCvr(parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground">Range: 10% to 80%</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="text-muted-foreground font-medium">Minimum Detectable Lift (MDE %):</label>
                <span className="font-bold text-foreground">{relMde}%</span>
              </div>
              <input
                type="range"
                min="2.0"
                max="20.0"
                step="0.5"
                value={relMde}
                onChange={(e) => setRelMde(parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground">Relative lift over baseline</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="text-muted-foreground font-medium">Statistical Power (1 - β):</label>
                <span className="font-bold text-foreground">{(power * 100).toFixed(0)}%</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {[0.8, 0.85, 0.9].map((p) => (
                  <Button
                    key={p}
                    variant={power === p ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setPower(p)}
                  >
                    {(p * 100).toFixed(0)}%
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {abPlan && (
            <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 text-xs text-foreground leading-relaxed">
              <span className="font-semibold text-primary block mb-1">
                Required Experiment Sample Size (50/50 Split, Two-Sided α = 0.05):
              </span>
              Need <span className="font-bold font-mono text-foreground">{formatInt(abPlan.sample_size_per_variant)}</span> sessions per variant (<span className="font-bold font-mono text-foreground">{formatInt(abPlan.total_sample_size_50_50)}</span> total sessions) to reliably detect a conversion lift from <span className="font-semibold">{abPlan.baseline_rate_pct}%</span> to <span className="font-semibold">{abPlan.target_rate_pct}%</span> (+{abPlan.absolute_mde_pp} percentage points) with {(abPlan.power * 100).toFixed(0)}% statistical power.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live EXPLAIN (ANALYZE, BUFFERS) Benchmark Runner */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  Live PostgreSQL EXPLAIN (ANALYZE, BUFFERS) Benchmarks
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Executes live query analysis directly on the database engine, demonstrating B-Tree index scan efficiency over 295,000+ rows.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => loadData(true)}
              disabled={runningBenchmarks}
              className="h-8 text-xs gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{runningBenchmarks ? "Executing EXPLAIN..." : "Run Live Benchmarks"}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {benchmarks ? (
            <div className="space-y-4">
              {benchmarks.map((bench, idx) => (
                <div key={idx} className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground text-xs">{bench.query_name}</span>
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="text-muted-foreground">Planning: {bench.planning_time_ms}ms</span>
                      <span className="text-muted-foreground">|</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        Execution: {bench.execution_time_ms}ms
                      </span>
                    </div>
                  </div>
                  <pre className="p-2.5 rounded bg-muted/80 text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-48 leading-relaxed">
                    {bench.plan_lines.join("\n")}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg p-6">
              Click &quot;Run Live Benchmarks&quot; above to execute live `EXPLAIN (ANALYZE, BUFFERS)` against PostgreSQL and inspect buffer hits, heap scans, and execution plans.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
