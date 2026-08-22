interface DonutSegment {
  name: string;
  color: string;
  count: number;
}

/**
 * Plain SVG stroke-dasharray donut -- no charting dependency needed for
 * one shape. Server-renderable (no interactivity, so no "use client").
 * Every segment's size is the real count/total fraction from
 * getSubmissionStats; a zero-count status simply isn't drawn.
 */
export function StatusDonutChart({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const size = 132;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Pure fold (not a mutating loop): each step derives the next
  // accumulated offset from the previous one instead of reassigning a
  // captured variable during render.
  const { arcs } = segments.filter((segment) => segment.count > 0).reduce(
    (acc, segment) => {
      const fraction = total > 0 ? segment.count / total : 0;
      const dash = fraction * circumference;
      const offset = -acc.accumulated;
      return {
        accumulated: acc.accumulated + dash,
        arcs: [...acc.arcs, { ...segment, dash, offset }],
      };
    },
    { accumulated: 0, arcs: [] as (DonutSegment & { dash: number; offset: number })[] },
  );

  return (
    <div className="relative flex size-[132px] shrink-0 items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--muted)" strokeWidth={strokeWidth} />
        {arcs.map((arc) => (
          <circle
            key={arc.name}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={arc.offset}
            strokeLinecap={arcs.length > 1 ? "butt" : "round"}
          />
        ))}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{total}</span>
        <span className="text-[11px] text-muted-foreground">total</span>
      </div>
    </div>
  );
}
