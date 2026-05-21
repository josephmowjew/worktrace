import type { TopContributor } from "../../types/project";

const avatarColors = [
  "from-blue-500 to-blue-600",
  "from-emerald-500 to-emerald-600",
  "from-violet-500 to-violet-600",
  "from-orange-500 to-orange-600",
  "from-pink-500 to-pink-600",
  "from-cyan-500 to-cyan-600",
];

function getAvatarColor(index: number): string {
  return avatarColors[index % avatarColors.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

export function ContributorsList({
  contributors,
  onViewAll,
}: {
  contributors: TopContributor[];
  onViewAll?: () => void;
}) {
  if (contributors.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-slate-500">
        No contributors this week
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {contributors.map((contributor, index) => (
        <div
          key={contributor.authorName}
          className="flex items-center gap-3 rounded-xl border border-white/8 bg-slate-950/35 p-2.5"
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarColor(index)} text-xs font-semibold text-white`}
          >
            {getInitials(contributor.authorName)}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {contributor.authorName}
            </p>
            {contributor.authorEmail && (
              <p className="truncate text-[10px] text-slate-500">
                {contributor.authorEmail}
              </p>
            )}
          </div>

          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-white">
              {contributor.commitCount}
            </p>
            <p className="text-[10px] text-slate-500">commits</p>
          </div>
        </div>
      ))}

      {onViewAll && (
        <div className="flex justify-center pt-1">
          <button
            onClick={onViewAll}
            className="text-xs font-medium text-blue-300 transition-colors hover:text-blue-200"
          >
            View all contributors →
          </button>
        </div>
      )}
    </div>
  );
}
