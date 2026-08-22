"use client";

import { useSyncExternalStore } from "react";

export interface ChartColors {
  primary: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  success: string;
  warning: string;
  destructive: string;
  info: string;
  border: string;
  mutedForeground: string;
  foreground: string;
  /** The guaranteed-contrasting inverse of `foreground` -- used as tooltip text against a `foreground`-colored tooltip body. */
  background: string;
}

const FALLBACK: ChartColors = {
  primary: "#6366f1",
  chart1: "#6366f1",
  chart2: "#ec4899",
  chart3: "#8b8b9a",
  chart4: "#5c5c6b",
  chart5: "#3a3a45",
  success: "#22c55e",
  warning: "#eab308",
  destructive: "#ef4444",
  info: "#3b82f6",
  border: "#e5e5ea",
  mutedForeground: "#8a8a95",
  foreground: "#18181b",
  background: "#ffffff",
};

/**
 * useSyncExternalStore requires getSnapshot to return a referentially
 * stable value when nothing has changed -- returning a fresh object
 * literal on every call (as this used to) makes React treat every render
 * as a store change, which throws "The result of getSnapshot should be
 * cached" and loops. `cachedColors` is only replaced when the actual
 * resolved token values differ from last time, so repeated calls between
 * real theme changes return the exact same object reference.
 */
let cachedColors: ChartColors = FALLBACK;
let cachedKey: string | null = null;

function readChartColors(): ChartColors {
  if (typeof window === "undefined") return FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  const read = (token: string): string => styles.getPropertyValue(token).trim();

  const primary = read("--primary") || FALLBACK.primary;
  const chart1 = read("--chart-1") || FALLBACK.chart1;
  const chart2 = read("--chart-2") || FALLBACK.chart2;
  const chart3 = read("--chart-3") || FALLBACK.chart3;
  const chart4 = read("--chart-4") || FALLBACK.chart4;
  const chart5 = read("--chart-5") || FALLBACK.chart5;
  const success = read("--success") || FALLBACK.success;
  const warning = read("--warning") || FALLBACK.warning;
  const destructive = read("--destructive") || FALLBACK.destructive;
  const info = read("--info") || FALLBACK.info;
  const border = read("--border") || FALLBACK.border;
  const mutedForeground = read("--muted-foreground") || FALLBACK.mutedForeground;
  const foreground = read("--foreground") || FALLBACK.foreground;
  const background = read("--background") || FALLBACK.background;

  const key = [primary, chart1, chart2, chart3, chart4, chart5, success, warning, destructive, info, border, mutedForeground, foreground, background].join("|");

  if (key === cachedKey) return cachedColors;

  cachedKey = key;
  cachedColors = {
    primary,
    chart1,
    chart2,
    chart3,
    chart4,
    chart5,
    success,
    warning,
    destructive,
    info,
    border,
    mutedForeground,
    foreground,
    background,
  };
  return cachedColors;
}

/**
 * Same MutationObserver-on-documentElement-class pattern already
 * established in components/layout/dashboard-topbar.tsx's theme toggle --
 * re-reads the resolved token values (real oklch() strings, valid canvas
 * colors in modern browsers) whenever the `dark` class flips, so a chart
 * drawn before a theme toggle doesn't keep rendering in the old palette.
 */
function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getServerSnapshot(): ChartColors {
  return FALLBACK;
}

export function useChartColors(): ChartColors {
  return useSyncExternalStore(subscribe, readChartColors, getServerSnapshot);
}

/** The N-color rotation used for multi-series bar/category charts. */
export function chartPalette(colors: ChartColors): string[] {
  return [colors.chart1, colors.chart2, colors.chart3, colors.chart4, colors.chart5];
}

/**
 * The design tokens (app/globals.css) are oklch(...) function-syntax
 * strings, not hex -- a hex alpha suffix (`${color}33`) would produce an
 * invalid color. CSS Color Level 4's slash-alpha syntax (`oklch(L C H / A)`)
 * is supported by every current-generation browser's canvas 2D context, so
 * inserting `/ alpha` before the closing paren works for any function-
 * syntax color this app's tokens might use (oklch/rgb/hsl alike).
 */
export function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  return trimmed.endsWith(")") ? `${trimmed.slice(0, -1)} / ${alpha})` : trimmed;
}
