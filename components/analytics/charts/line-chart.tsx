"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";

import { useChartColors, withAlpha } from "../chart-theme";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

export interface LineChartSeries {
  label: string;
  data: number[];
}

/**
 * A single area-style trend line (submissions over time, activity over
 * time, etc.) -- labels/data are plain serializable arrays already
 * aggregated server-side (see lib/analytics/time-ranges.ts's
 * bucketTimestamps), never a raw row dump handed to the browser.
 */
export function LineChart({
  labels,
  series,
  height = 220,
}: {
  labels: string[];
  series: LineChartSeries;
  height?: number;
}) {
  const colors = useChartColors();

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: colors.foreground,
        titleColor: colors.background,
        bodyColor: colors.background,
        titleFont: { size: 12, weight: 600 },
        bodyFont: { size: 12, weight: 500 },
        padding: 12,
        boxPadding: 4,
        cornerRadius: 10,
        caretSize: 6,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: colors.mutedForeground, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 16 },
        border: { color: colors.border },
      },
      y: {
        beginAtZero: true,
        grid: { color: colors.border },
        ticks: { color: colors.mutedForeground, font: { size: 11 }, precision: 0 },
        border: { display: false },
      },
    },
  };

  const data = {
    labels,
    datasets: [
      {
        label: series.label,
        data: series.data,
        borderColor: colors.primary,
        backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
          const { ctx, chartArea } = context.chart;
          if (!chartArea) return withAlpha(colors.primary, 0.15);
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, withAlpha(colors.primary, 0.22));
          gradient.addColorStop(1, withAlpha(colors.primary, 0));
          return gradient;
        },
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: colors.primary,
        pointHoverBorderColor: colors.background,
        pointHoverBorderWidth: 2,
        fill: true,
        tension: 0.35,
      },
    ],
  };

  return (
    <div style={{ height }}>
      <Line options={options} data={data} aria-label={`${series.label} over time`} role="img" />
    </div>
  );
}
