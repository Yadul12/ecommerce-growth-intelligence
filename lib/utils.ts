import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatInr(val: number | null | undefined): string {
  if (val === null || val === undefined) return "₹0";
  return `₹${val.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function formatCompactInr(val: number | null | undefined): string {
  if (val === null || val === undefined) return "₹0";
  if (Math.abs(val) >= 1e7) {
    return `₹${(val / 1e7).toFixed(2)} Cr`;
  }
  if (Math.abs(val) >= 1e6) {
    return `₹${(val / 1e6).toFixed(2)}M`;
  }
  if (Math.abs(val) >= 1e5) {
    return `₹${(val / 1e5).toFixed(2)}L`;
  }
  if (Math.abs(val) >= 1e3) {
    return `₹${(val / 1e3).toFixed(1)}k`;
  }
  return `₹${val.toFixed(0)}`;
}

export function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "0.0%";
  return `${val.toFixed(1)}%`;
}

export function formatInt(val: number | null | undefined): string {
  if (val === null || val === undefined) return "0";
  return Math.round(val).toLocaleString("en-IN");
}
