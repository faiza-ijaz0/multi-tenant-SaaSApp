"use client";

import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip, type ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";

import { chartPalette, useChartColors, withAlpha } from "../chart-theme";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

/**
 * A single-series category bar chart (category distribution, status usage,
 * etc.) -- `horizontal` swaps to indexAxis: "y" for long label sets
 * (category names) that would otherwise crowd a vertical x-axis.
 */
export function BarChart({
  labels,
  data,
  seriesLabel,
  horizontal = false,
  height = 240,
}: {
  labels: string[];
  data: number[];
  seriesLabel: string;
  horizontal?: boolean;
  height?: number;
}) {
  const colors = useChartColors();
  const palette = chartPalette(colors);

  const options: ChartOptions<"bar"> = {
    indexAxis: horizontal ? "y" : "x",
    responsive: true,
    maintainAspectRatio: false,
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
        grid: { display: !horizontal, color: colors.border },
        ticks: { color: colors.mutedForeground, font: { size: 11 }, precision: horizontal ? 0 : undefined },
        border: { color: colors.border },
      },
      y: {
        beginAtZero: true,
        grid: { display: horizontal, color: colors.border },
        ticks: { color: colors.mutedForeground, font: { size: 11 }, precision: horizontal ? undefined : 0 },
        border: { display: false },
      },
    },
  };

  const chartData = {
    labels,
    datasets: [
      {
        label: seriesLabel,
        data,
        backgroundColor: labels.map((_, index) => withAlpha(palette[index % palette.length], 0.85)),
        hoverBackgroundColor: labels.map((_, index) => palette[index % palette.length]),
        borderRadius: 6,
        maxBarThickness: 28,
      },
    ],
  };

  return (
    <div style={{ height }}>
      <Bar options={options} data={chartData} aria-label={seriesLabel} role="img" />
    </div>
  );
}
