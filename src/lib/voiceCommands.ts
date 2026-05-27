export type NormalizedVoiceCommand =
  | {
      kind: "power";
      command: string;
      label: string;
      requiresConfirmation: boolean;
    }
  | {
      kind: "navigation";
      path: string;
      label: string;
      requiresConfirmation: boolean;
    }
  | {
      kind: "unknown";
      transcript: string;
      label: string;
      requiresConfirmation: true;
    };

const fillerPattern = /^(please\s+|worktrace\s+|hey\s+worktrace\s+)/i;

export function normalizeVoiceTranscript(transcript: string): NormalizedVoiceCommand {
  const cleaned = transcript
    .trim()
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(fillerPattern, "");
  const normalized = cleaned.toLowerCase();

  if (!normalized) {
    return unknownCommand(transcript);
  }

  if (["sync", "sync repositories", "sync repos", "sync now"].includes(normalized)) {
    return powerCommand("sync", "Sync repositories", false);
  }

  if (
    [
      "sync sparc force",
      "sync spark force",
      "sync support",
      "import sparc force",
      "import spark force",
    ].includes(normalized)
  ) {
    return powerCommand("sparc_force_sync", "Sync Sparc Force", false);
  }

  if (
    ["report", "prepare report", "prepare weekly report", "weekly report"].includes(normalized)
  ) {
    return powerCommand("report", "Prepare weekly report", false);
  }

  const navigation = parseNavigation(normalized);
  if (navigation) {
    return navigation;
  }

  const task = parseCapture(normalized, ["add task", "new task", "create task"]);
  if (task) {
    return powerCommand(`task: ${task}`, `Add task: ${task}`, true);
  }

  const log = parseLog(normalized);
  if (log) {
    return powerCommand(`log: ${log}`, `Create manual log: ${log}`, true);
  }

  const focus = parseCapture(normalized, [
    "start focus on",
    "start focus",
    "focus on",
    "focus",
  ]);
  if (focus) {
    return powerCommand(`focus: ${focus}`, `Start focus: ${focus}`, true);
  }

  return unknownCommand(cleaned);
}

function parseNavigation(normalized: string): NormalizedVoiceCommand | null {
  const target = normalized
    .replace(/^(go to|open|show|take me to)\s+/, "")
    .replace(/^the\s+/, "");

  const routes: Record<string, { path: string; label: string }> = {
    today: { path: "/", label: "Go to Today" },
    dashboard: { path: "/dashboard", label: "Go to Dashboard" },
    projects: { path: "/projects", label: "Go to Projects" },
    "activity timeline": { path: "/activity", label: "Go to Activity Timeline" },
    activity: { path: "/activity", label: "Go to Activity Timeline" },
    backup: { path: "/backup", label: "Go to Backup" },
    "manual log": { path: "/manual-log", label: "Go to Manual Log" },
    "weekly plan": { path: "/weekly-plan", label: "Go to Weekly Plan" },
    reports: { path: "/reports", label: "Go to Reports" },
    guide: { path: "/guide", label: "Go to Guide" },
    settings: { path: "/settings", label: "Go to Settings" },
    "sparc force": { path: "/settings", label: "Go to Sparc Force" },
    "spark force": { path: "/settings", label: "Go to Sparc Force" },
    "support integration": { path: "/settings", label: "Go to Sparc Force" },
  };

  const route = routes[target];
  if (!route) return null;

  return {
    kind: "navigation",
    path: route.path,
    label: route.label,
    requiresConfirmation: false,
  };
}

function parseCapture(normalized: string, prefixes: string[]) {
  for (const prefix of prefixes) {
    if (normalized === prefix) return null;
    if (normalized.startsWith(`${prefix} `)) {
      return normalized.slice(prefix.length).trim();
    }
  }

  return null;
}

function parseLog(normalized: string) {
  const direct = parseCapture(normalized, ["log", "create log", "add log", "manual log"]);
  if (!direct) return null;

  const durationFirst = direct.match(/^(\d+)\s*(minutes?|mins?|hours?|hrs?)\s+(.+)$/);
  if (!durationFirst) return direct;

  const [, amount, unit, summary] = durationFirst;
  const suffix = unit.startsWith("hour") || unit.startsWith("hr") ? "h" : "m";
  return `${summary.trim()} ${amount}${suffix}`;
}

function powerCommand(
  command: string,
  label: string,
  requiresConfirmation: boolean,
): NormalizedVoiceCommand {
  return {
    kind: "power",
    command,
    label,
    requiresConfirmation,
  };
}

function unknownCommand(transcript: string): NormalizedVoiceCommand {
  return {
    kind: "unknown",
    transcript,
    label: transcript.trim() ? `Unknown command: ${transcript.trim()}` : "No command heard",
    requiresConfirmation: true,
  };
}
