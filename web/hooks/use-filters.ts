"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import {
  parseFilters,
  filtersToSearchParams,
  activeFilterCount,
  EMPTY_FILTERS,
  type Filters,
} from "@/lib/filters";

export function useDashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const filters = useMemo(() => {
    return parseFilters(searchParams);
  }, [searchParams]);

  const activeCount = useMemo(() => activeFilterCount(filters), [filters]);

  const setFilters = useCallback(
    (updater: Partial<Filters> | ((prev: Filters) => Filters)) => {
      const next = typeof updater === "function" ? updater(filters) : { ...filters, ...updater };
      const nextParams = filtersToSearchParams(next);
      // Preserve active view if present
      const view = searchParams.get("view");
      if (view) nextParams.set("view", view);

      startTransition(() => {
        router.push(`${pathname}?${nextParams.toString()}`, { scroll: false });
      });
    },
    [filters, pathname, router, searchParams]
  );

  const resetFilters = useCallback(() => {
    const nextParams = new URLSearchParams();
    const view = searchParams.get("view");
    if (view) nextParams.set("view", view);

    startTransition(() => {
      router.push(`${pathname}?${nextParams.toString()}`, { scroll: false });
    });
  }, [pathname, router, searchParams]);

  const currentView = searchParams.get("view") || "executive";

  const setView = useCallback(
    (view: string) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("view", view);
      startTransition(() => {
        router.push(`${pathname}?${nextParams.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  return {
    filters,
    setFilters,
    resetFilters,
    activeCount,
    isPending,
    currentView,
    setView,
  };
}
