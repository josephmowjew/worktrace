export function ProgressDonut({
  done,
  inProgress,
  planned,
  carryForward,
  progressPercent,
}: {
  done: number;
  inProgress: number;
  planned: number;
  carryForward: number;
  progressPercent: number;
}) {
  const total = done + inProgress + planned + carryForward;
  const percentage = Math.max(0, Math.min(100, Math.round(progressPercent)));

  const size = 100;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const segments = [
    { value: done, color: "#10b981", label: "Done" },
    { value: inProgress, color: "#8b5cf6", label: "In Progress" },
    { value: planned, color: "#3b82f6", label: "Planned" },
    { value: carryForward, color: "#f97316", label: "Carry Forward" },
  ].filter((s) => s.value > 0);

  let cumulativeOffset = 0;
  const renderedSegments = segments.map((segment) => {
    const segmentLength = (segment.value / total) * circumference;
    const dashArray = `${segmentLength} ${circumference}`;
    const dashOffset = -cumulativeOffset;
    cumulativeOffset += segmentLength;

    return { ...segment, dashArray, dashOffset };
  });

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {renderedSegments.map((segment) => (
            <circle
              key={segment.label}
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
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-white">{percentage}%</span>
          <span className="text-[10px] text-slate-500">Progress</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {[
          { label: "Done", color: "bg-emerald-400", count: done },
          { label: "In Progress", color: "bg-violet-400", count: inProgress },
          { label: "Planned", color: "bg-blue-400", count: planned },
          { label: "Carry Forward", color: "bg-orange-400", count: carryForward },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <div className={`h-2 w-2 rounded-full ${item.color}`} />
            <span className="text-slate-400">{item.label}</span>
            <span className="ml-auto font-semibold text-white">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
