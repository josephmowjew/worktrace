import type { CategoryDistribution } from "../../types/project";

const categoryColors: Record<string, string> = {
  Backend: "#8b5cf6",
  Frontend: "#3b82f6",
  Marketing: "#ec4899",
  Tools: "#06b6d4",
  Service: "#f59e0b",
  Company: "#3b82f6",
  Client: "#10b981",
  Internal: "#64748b",
  Personal: "#a855f7",
  "Manual Only": "#f97316",
  Other: "#475569",
};

function getCategoryColor(category: string): string {
  return categoryColors[category] || categoryColors["Other"];
}

function calculateDonutSegments(
  data: CategoryDistribution[],
  size: number,
  strokeWidth: number,
) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulativePercent = 0;
  const segments = data.map((item) => {
    const percent = item.percentage / 100;
    const dashArray = `${percent * circumference} ${circumference}`;
    const dashOffset = -cumulativePercent * circumference;
    cumulativePercent += percent;

    return {
      category: item.category,
      count: item.count,
      percentage: item.percentage,
      color: getCategoryColor(item.category),
      dashArray,
      dashOffset,
    };
  });

  return { segments, radius, center, circumference };
}

export function DonutChart({
  data,
  size = 120,
  strokeWidth = 20,
}: {
  data: CategoryDistribution[];
  size?: number;
  strokeWidth?: number;
}) {
  const { segments, radius, center } = calculateDonutSegments(
    data,
    size,
    strokeWidth,
  );

  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-slate-500">
        No data available
      </div>
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((segment) => (
        <circle
          key={segment.category}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={segment.color}
          strokeWidth={strokeWidth}
          strokeDasharray={segment.dashArray}
          strokeDashoffset={segment.dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          className="transition-all duration-300"
        />
      ))}
    </svg>
  );
}

export function CategoryLegend({
  data,
  total,
}: {
  data: CategoryDistribution[];
  total: number;
}) {
  if (data.length === 0) {
    return (
      <div className="text-center text-xs text-slate-500">No categories</div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div
          key={item.category}
          className="flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: getCategoryColor(item.category) }}
            />
            <span className="text-slate-300">{item.category}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{item.count}</span>
            <span className="text-slate-500">({item.percentage}%)</span>
          </div>
        </div>
      ))}
      <div className="border-t border-white/8 pt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">Active Repos</span>
          <span className="text-lg font-semibold text-white">{total}</span>
        </div>
      </div>
    </div>
  );
}
