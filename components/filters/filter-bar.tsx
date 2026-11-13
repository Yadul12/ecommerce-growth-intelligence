"use client";

import React, { useState } from "react";
import { useDashboardFilters } from "@/hooks/use-filters";
import {
  DEVICES,
  CHANNELS,
  CITY_TIERS,
  CATEGORIES,
  label,
  type Filters,
} from "@/lib/filters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Calendar,
  Filter,
  RotateCcw,
  Share2,
  Check,
  X,
  Smartphone,
  Tag,
  MapPin,
  Layers,
} from "lucide-react";

interface MultiSelectProps {
  title: string;
  icon: React.ReactNode;
  options: readonly string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function MultiSelect({ title, icon, options, selected, onChange }: MultiSelectProps) {
  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((x) => x !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  const selectAll = () => onChange([...options]);
  const clear = () => onChange([]);

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 text-xs font-normal border-dashed gap-1.5" />}>
        {icon}
        <span>{title}</span>
        {selected.length > 0 && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4 rounded">
            {selected.length}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 text-xs" align="start">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
          <span className="font-semibold text-foreground">{title}</span>
          <div className="flex gap-1 text-[11px]">
            <button
              onClick={selectAll}
              className="text-muted-foreground hover:text-foreground underline px-1"
            >
              All
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={clear}
              className="text-muted-foreground hover:text-foreground underline px-1"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {options.map((opt) => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${
                  isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"
                }`}
              >
                <span className="truncate">{label(opt)}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar() {
  const { filters, setFilters, resetFilters, activeCount } = useDashboardFilters();
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const setDatePreset = (preset: "all" | "q1" | "q2" | "recent") => {
    if (preset === "all") {
      setFilters({ from: null, to: null });
    } else if (preset === "q1") {
      setFilters({ from: "2025-01-01", to: "2025-03-31" });
    } else if (preset === "q2") {
      setFilters({ from: "2025-04-01", to: "2025-06-30" });
    } else if (preset === "recent") {
      setFilters({ from: "2025-05-15", to: "2025-06-30" });
    }
  };

  return (
    <div className="w-full bg-card border-b border-border/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
      {/* Left: Filters Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
          <Filter className="w-3.5 h-3.5 text-primary" />
          <span className="font-semibold text-foreground">Global Filters:</span>
        </div>

        {/* Date Range Popover */}
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 text-xs font-normal border-dashed gap-1.5" />}>
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span>
              {filters.from && filters.to
                ? `${filters.from} → ${filters.to}`
                : filters.from
                ? `From ${filters.from}`
                : filters.to
                ? `To ${filters.to}`
                : "All Time (2025)"}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3 text-xs" align="start">
            <div className="space-y-3">
              <div className="font-semibold text-foreground pb-1 border-b border-border">
                Session Date Range
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDatePreset("all")}
                >
                  Full Dataset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDatePreset("q1")}
                >
                  Q1 (Jan–Mar)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDatePreset("q2")}
                >
                  Q2 (Apr–Jun)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDatePreset("recent")}
                >
                  Late Season
                </Button>
              </div>
              <div className="space-y-1.5 pt-1">
                <div>
                  <label className="text-[11px] text-muted-foreground">Start Date</label>
                  <input
                    type="date"
                    value={filters.from || ""}
                    onChange={(e) => setFilters({ from: e.target.value || null })}
                    className="w-full h-8 px-2 border rounded bg-background text-foreground text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">End Date</label>
                  <input
                    type="date"
                    value={filters.to || ""}
                    onChange={(e) => setFilters({ to: e.target.value || null })}
                    className="w-full h-8 px-2 border rounded bg-background text-foreground text-xs"
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Device Type */}
        <MultiSelect
          title="Device"
          icon={<Smartphone className="w-3.5 h-3.5 text-muted-foreground" />}
          options={DEVICES}
          selected={filters.devices}
          onChange={(devices) => setFilters({ devices })}
        />

        {/* Acquisition Channel */}
        <MultiSelect
          title="Channel"
          icon={<Tag className="w-3.5 h-3.5 text-muted-foreground" />}
          options={CHANNELS}
          selected={filters.channels}
          onChange={(channels) => setFilters({ channels })}
        />

        {/* City Tier */}
        <MultiSelect
          title="City Tier"
          icon={<MapPin className="w-3.5 h-3.5 text-muted-foreground" />}
          options={CITY_TIERS}
          selected={filters.tiers}
          onChange={(tiers) => setFilters({ tiers })}
        />

        {/* Product Category */}
        <MultiSelect
          title="Category"
          icon={<Layers className="w-3.5 h-3.5 text-muted-foreground" />}
          options={CATEGORIES}
          selected={filters.categories}
          onChange={(categories) => setFilters({ categories })}
        />

        {/* Reset Filters */}
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset ({activeCount})</span>
          </Button>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleShare}
          className="h-8 text-xs gap-1.5"
          title="Copy shareable URL with filters"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Share View</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
