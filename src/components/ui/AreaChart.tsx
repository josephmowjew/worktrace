import type { DailyActivityHours } from "../../types/dashboard";

export function AreaChart({
  data,
  height = 200,
}: {
  data: DailyActivityHours[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-[var(--wt-border-strong)] bg-[var(--wt-surface-muted)]"
        style={{ height }}
      >
        <p className="text-xs text-[var(--wt-text-muted)]">No activity data for this week</p>
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = 600;
  const chartHeight = height - padding.top - padding.bottom;
  const maxHours = Math.max(...data.map((d) => d.hours), 1);
  const yTicks = generateYTicks(maxHours);

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1 || 1)) * (chartWidth - padding.left - padding.right),
    y: padding.top + chartHeight - (d.hours / maxHours) * chartHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${height}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--wt-chart-fill-start)" />
          <stop offset="100%" stopColor="var(--wt-chart-fill-end)" />
        </linearGradient>
      </defs>

      {yTicks.map((tick) => {
        const y = padding.top + chartHeight - (tick / maxHours) * chartHeight;
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              y1={y}
              x2={chartWidth - padding.right}
              y2={y}
              stroke="var(--wt-chart-grid)"
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              fill="var(--wt-chart-label)"
              fontSize="10"
            >
              {tick}h
            </text>
          </g>
        );
      })}

      <path d={areaPath} fill="url(#areaGradient)" />
      <path d={linePath} fill="none" stroke="var(--wt-accent)" strokeWidth="2" />

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="var(--wt-chart-point)" stroke="var(--wt-accent)" strokeWidth="2" />
          <text
            x={p.x}
            y={padding.top + chartHeight + 18}
            textAnchor="middle"
            fill="var(--wt-chart-label)"
            fontSize="10"
          >
            {data[i].day}
          </text>
          <text
            x={p.x}
            y={p.y - 10}
            textAnchor="middle"
            fill="var(--wt-text-strong)"
            fontSize="10"
            fontWeight="500"
          >
            {data[i].hours}h
          </text>
        </g>
      ))}
    </svg>
  );
}

function generateYTicks(max: number): number[] {
  const ticks: number[] = [];
  const step = Math.ceil(max / 5);
  for (let i = 0; i <= max + step; i += step) {
    ticks.push(i);
  }
  return ticks;
}
