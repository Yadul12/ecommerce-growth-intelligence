"use client";

import React, { Suspense } from "react";
import { useDashboardFilters } from "@/hooks/use-filters";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { FilterBar } from "@/components/filters/filter-bar";
import { ExecutiveView } from "@/components/views/executive-view";
import { FunnelView } from "@/components/views/funnel-view";
import { RetentionView } from "@/components/views/retention-view";
import { EconomicsView } from "@/components/views/economics-view";
import { DataQualityView } from "@/components/views/data-quality-view";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardContent() {
  const { currentView } = useDashboardFilters();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-background">
      {currentView === "executive" && <ExecutiveView />}
      {currentView === "funnel" && <FunnelView />}
      {currentView === "retention" && <RetentionView />}
      {currentView === "economics" && <EconomicsView />}
      {currentView === "quality" && <DataQualityView />}
    </div>
  );
}

export function DashboardShell() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground antialiased">
      <Header />
      <Suspense fallback={<div className="h-10 bg-card border-b border-border animate-pulse" />}>
        <FilterBar />
      </Suspense>

      <div className="flex-1 flex overflow-hidden">
        <Suspense fallback={<div className="w-64 bg-card border-r border-border animate-pulse" />}>
          <Sidebar />
        </Suspense>

        <Suspense
          fallback={
            <div className="flex-1 p-6 space-y-4">
              <Skeleton className="h-8 w-64" />
              <div className="grid grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
              <Skeleton className="h-72 w-full" />
            </div>
          }
        >
          <DashboardContent />
        </Suspense>
      </div>
    </div>
  );
}
