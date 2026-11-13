"use client";

import React from "react";
import { useDashboardFilters } from "@/hooks/use-filters";
import {
  TrendingUp,
  Filter,
  Users,
  PieChart,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

export interface NavItem {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "executive",
    number: "1",
    title: "Executive Overview",
    subtitle: "GMV, Realized Net & Revenue Bridge",
    icon: <TrendingUp className="w-4 h-4" />,
  },
  {
    id: "funnel",
    number: "2",
    title: "Funnel & Friction",
    subtitle: "Chronological CVR & Bottlenecks",
    icon: <Filter className="w-4 h-4" />,
  },
  {
    id: "retention",
    number: "3",
    title: "Retention & Cohorts",
    subtitle: "D1–D30 Cohorts, DAU & Stickiness",
    icon: <Users className="w-4 h-4" />,
  },
  {
    id: "economics",
    number: "4",
    title: "Channel & Product",
    subtitle: "Unit Economics, ARPU & Leakage",
    icon: <PieChart className="w-4 h-4" />,
  },
  {
    id: "quality",
    number: "5",
    title: "Data Quality & Benchmarks",
    subtitle: "10-Point Audit & EXPLAIN ANALYZE",
    icon: <ShieldCheck className="w-4 h-4" />,
  },
];

export function Sidebar() {
  const { currentView, setView } = useDashboardFilters();

  return (
    <aside className="w-64 bg-card border-r border-border shrink-0 flex flex-col justify-between p-3.5 select-none">
      <div className="space-y-4">
        <div className="px-2 pt-1 pb-2">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Analytical Modules
          </p>
        </div>

        <nav className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`w-full group flex items-start gap-3 p-2.5 rounded-lg text-left transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs font-medium"
                    : "hover:bg-muted/70 text-foreground"
                }`}
              >
                <div
                  className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold leading-tight truncate">
                      {item.number}. {item.title}
                    </span>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-70" />}
                  </div>
                  <p
                    className={`text-[11px] mt-0.5 leading-tight truncate ${
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                    }`}
                  >
                    {item.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-3 rounded-lg border border-border/80 bg-muted/40 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground text-[11px]">PostgreSQL 16 Engine</p>
        <p className="text-[10px] leading-relaxed">
          100% parameterised SQL execution via connection pool with zero frontend credential exposure.
        </p>
      </div>
    </aside>
  );
}
