import type { ActivityType } from "../../types/manualLog";
import type { VoiceCaptureDraft, VoiceCaptureKind } from "../../types/voiceCapture";
import type { WeeklyTaskPriority, WeeklyTaskType } from "../../types/weeklyTask";
import type {
  IntentScoreBreakdown,
  ProjectMatch,
  VoiceCorrection,
  VoiceIntentCandidate,
  VoiceIntentKind,
  VoiceManualLogSlots,
  VoiceParseContext,
  VoiceParseIssue,
  VoiceParseResult,
  VoiceParseStatus,
  VoiceSlot,
  VoiceTaskSlots,
} from "./types";

type CaptureKind = Exclude<VoiceCaptureKind, "unknown">;

type TriggerMatch = {
  body: string;
  trigger: string;
  commandText: string;
};

const emptyBreakdown: IntentScoreBreakdown = {
  commandPhrase: 0,
  targetPhrase: 0,
  slotEvidence: 0,
  contentQuality: 0,
  contextPrior: 0,
  correctionPenalty: 0,
  conflictPenalty: 0,
};

const taskTriggers = [
  "remind me to",
  "create a task",
  "create tasks",
  "create task",
  "add a task",
  "add tasks",
  "add task",
  "new tasks",
  "new task",
  "make a task",
  "make tasks",
  "make task",
  "todo",
  "to do",
  "i'd tasks",
  "i'd task",
  "id tasks",
  "id task",
  "ad tasks",
  "ad task",
  "at tasks",
  "at task",
  "tasks",
  "task",
];

const manualLogTriggers = [
  "record a work log",
  "record work log",
  "capture a work log",
  "capture work log",
  "create a work log",
  "create work log",
  "add a work log",
  "add work log",
  "create a manual log",
  "create manual log",
  "add a manual log",
  "add manual log",
  "manual log",
  "work log",
  "worklog",
  "work clock",
  "worklock",
  "manuel log",
  "manual clock",
  "worked on",
  "meeting about",
  "log",
];

const activityKeywords: Array<{ value: ActivityType; patterns: RegExp[] }> = [
  { value: "Meeting", patterns: [/\bmeeting\b/i, /\bstandup\b/i] },
  { value: "Development", patterns: [/\bdevelopment\b/i, /\bcoding\b/i, /\bimplemented\b/i] },
  { value: "BugFix", patterns: [/\bbug ?fix\b/i, /\bfixed\b/i, /\bfixing\b/i] },
  { value: "Testing", patterns: [/\btesting\b/i, /\bqa\b/i] },
  { value: "Deployment", patterns: [/\bdeploy(?:ed|ment|ing)?\b/i, /\brelease\b/i] },
  { value: "Research", patterns: [/\bresearch\b/i, /\binvestigat(?:e|ed|ing|ion)\b/i] },
  { value: "Documentation", patterns: [/\bdocument(?:ed|ation|ing)?\b/i, /\bdocs?\b/i] },
  { value: "Planning", patterns: [/\bplanning\b/i, /\bplanned\b/i] },
  { value: "Support", patterns: [/\bsupport\b/i] },
  { value: "CodeReview", patterns: [/\bcode review\b/i, /\breviewed\b/i, /\bpr review\b/i] },
  { value: "ClientFeedback", patterns: [/\bclient feedback\b/i, /\bfeedback\b/i] },
  { value: "Debugging", patterns: [/\bdebug(?:ged|ging)?\b/i] },
  { value: "ClientCall", patterns: [/\bclient call\b/i, /\bcall with client\b/i] },
  { value: "AdminTask", patterns: [/\badmin\b/i, /\badministrative\b/i] },
];

const routeTargets: Record<string, { path: string; label: string }> = {
  today: { path: "/", label: "Go to Today" },
  dashboard: { path: "/dashboard", label: "Go to Dashboard" },
  projects: { path: "/projects", label: "Go to Repositories" },
  repositories: { path: "/projects", label: "Go to Repositories" },
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

export function parseVoiceTranscript(
  transcript: string,
  context: VoiceParseContext = {},
): VoiceParseResult {
  const rawTranscript = normalizeDisplayTranscript(transcript);
  const { normalized, corrections } = normalizeForMatching(rawTranscript);
  const candidates = [
    ...parsePowerAndNavigationCandidates(rawTranscript, normalized),
    parseCaptureCandidate("task", rawTranscript, normalized, context),
    parseCaptureCandidate("manual_log", rawTranscript, normalized, context),
  ]
    .filter((candidate): candidate is VoiceIntentCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score);

  const topCandidate = candidates[0];
  const secondCandidate = candidates[1];
  const issues = collectIssues(candidates, rawTranscript);
  const status = classifyStatus(topCandidate, secondCandidate, issues);

  return {
    rawTranscript,
    normalizedTranscript: normalized,
    status,
    topCandidate,
    candidates,
    corrections,
    issues,
  };
}

export function toVoiceCaptureDraft(
  resultOrCandidate: VoiceParseResult | VoiceIntentCandidate,
): VoiceCaptureDraft {
  const candidate = "candidates" in resultOrCandidate
    ? resultOrCandidate.topCandidate
    : resultOrCandidate;
  if (candidate?.captureDraft) return candidate.captureDraft;

  const transcript = "rawTranscript" in resultOrCandidate ? resultOrCandidate.rawTranscript : "";
  const issues = "issues" in resultOrCandidate ? resultOrCandidate.issues : [];
  return unknownDraft(
    transcript,
    issues[0]?.message ?? "No task or manual log trigger matched.",
    "topCandidate" in resultOrCandidate ? resultOrCandidate.topCandidate?.score ?? 0 : 0,
    issues,
  );
}

export function inferVoiceCaptureKind(transcript: string): CaptureKind {
  const result = parseVoiceTranscript(transcript);
  if (result.topCandidate?.kind === "create_task") return "task";
  if (result.topCandidate?.kind === "create_manual_log") return "manual_log";
  const taskCandidate = result.candidates.find((candidate) => candidate.kind === "create_task");
  const logCandidate = result.candidates.find((candidate) => candidate.kind === "create_manual_log");
  return (taskCandidate?.score ?? 0) > (logCandidate?.score ?? 0) ? "task" : "manual_log";
}

export function extractVoiceCaptureContent(kind: CaptureKind, transcript: string): string {
  const raw = normalizeDisplayTranscript(transcript);
  const { normalized } = normalizeForMatching(raw);
  const triggers = kind === "task" ? taskTriggers : manualLogTriggers;
  const trigger = matchLeadingTrigger(raw, triggers);
  let body = stripRepeatedLeadingTriggers(trigger?.body ?? raw, triggers).body;

  if (!trigger && kind === "manual_log") {
    body = stripManualLogSpecialForms(body, normalized).body;
  }
  if (!trigger && kind === "task") {
    body = stripTaskSpecialForms(body).body;
  }

  return tidyContent(body) || raw;
}

function stripRepeatedLeadingTriggers(raw: string, triggers: string[]) {
  let body = raw;
  const commands: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const repeated = matchLeadingTrigger(body, triggers);
    if (!repeated) break;
    commands.push(repeated.commandText);
    body = repeated.body;
  }
  return { body, commandText: commands.join(", ") };
}

function parseCaptureCandidate(
  kind: CaptureKind,
  rawTranscript: string,
  normalized: string,
  context: VoiceParseContext,
): VoiceIntentCandidate | null {
  if (!rawTranscript) return null;

  const triggers = kind === "task" ? taskTriggers : manualLogTriggers;
  const trigger = matchLeadingTrigger(rawTranscript, triggers);
  const special = kind === "manual_log"
    ? stripManualLogSpecialForms(trigger?.body ?? rawTranscript, normalized)
    : stripTaskSpecialForms(trigger?.body ?? rawTranscript);
  const repeated = stripRepeatedLeadingTriggers(trigger ? trigger.body : special.body, triggers);
  const body = repeated.body;
  const hasStrongCommand = Boolean(trigger || special.trigger);
  const commandText = [
    trigger?.commandText ?? special.commandText,
    repeated.commandText,
  ].filter(Boolean).join(", ") || null;

  if (kind === "task") {
    const metadata = parseTaskSlots(body, context);
    return buildTaskCandidate(rawTranscript, normalized, hasStrongCommand, commandText, metadata);
  }

  const metadata = parseManualLogSlots(body, context);
  return buildManualLogCandidate(rawTranscript, normalized, hasStrongCommand, commandText, metadata);
}

function buildTaskCandidate(
  rawTranscript: string,
  normalized: string,
  hasStrongCommand: boolean,
  commandText: string | null,
  metadata: ParsedTaskSlots,
): VoiceIntentCandidate | null {
  const content = metadata.title;
  const scoreBreakdown = scoreCapture("task", {
    rawTranscript,
    normalized,
    hasStrongCommand,
    commandText,
    content,
    metadata,
  });
  const score = clampScore(Object.values(scoreBreakdown).reduce((total, value) => total + value, 0));
  if (score < 15 && !hasStrongCommand) return null;

  const issues = buildCandidateIssues("task", content, rawTranscript, commandText, metadata.projectIssue);
  const confidence = score >= 75 && content ? "high" : score >= 55 ? "medium" : "low";
  const captureDraft = taskDraft(rawTranscript, content, metadata, confidence, score, issues);

  return {
    id: "task",
    kind: "create_task",
    score,
    scoreBreakdown,
    label: `Review task: ${content || rawTranscript}`,
    captureDraft,
    requiresConfirmation: true,
    missingSlots: content ? [] : ["title"],
    evidence: [
      ...(commandText ? [`Heard command phrase: ${commandText}`] : []),
      ...(metadata.evidence ?? []),
    ],
    issues,
  };
}

function buildManualLogCandidate(
  rawTranscript: string,
  normalized: string,
  hasStrongCommand: boolean,
  commandText: string | null,
  metadata: ParsedManualLogSlots,
): VoiceIntentCandidate | null {
  const content = metadata.summary;
  const scoreBreakdown = scoreCapture("manual_log", {
    rawTranscript,
    normalized,
    hasStrongCommand,
    commandText,
    content,
    metadata,
  });
  const score = clampScore(Object.values(scoreBreakdown).reduce((total, value) => total + value, 0));
  if (score < 15 && !hasStrongCommand) return null;

  const issues = buildCandidateIssues("manual_log", content, rawTranscript, commandText, metadata.projectIssue);
  const confidence = score >= 75 && content ? "high" : score >= 55 ? "medium" : "low";
  const captureDraft = manualLogDraft(rawTranscript, content, metadata, confidence, score, issues);

  return {
    id: "manual_log",
    kind: "create_manual_log",
    score,
    scoreBreakdown,
    label: `Review manual log: ${content || rawTranscript}`,
    captureDraft,
    requiresConfirmation: true,
    missingSlots: content ? [] : ["summary"],
    evidence: [
      ...(commandText ? [`Heard command phrase: ${commandText}`] : []),
      ...(metadata.evidence ?? []),
    ],
    issues,
  };
}

function parsePowerAndNavigationCandidates(
  rawTranscript: string,
  normalized: string,
): VoiceIntentCandidate[] {
  if (!normalized) return [];
  const candidates: VoiceIntentCandidate[] = [];
  const powerCommands: Array<{ phrases: string[]; command: string; label: string; kind: VoiceIntentKind }> = [
    {
      phrases: ["sync", "sync repositories", "sync repos", "sync now", "sink repositories"],
      command: "sync",
      label: "Sync repositories",
      kind: "sync_repositories",
    },
    {
      phrases: ["sync sparc force", "sync spark force", "sync support", "import sparc force", "import spark force"],
      command: "sparc_force_sync",
      label: "Sync Sparc Force",
      kind: "sync_sparc_force",
    },
    {
      phrases: ["report", "prepare report", "prepare weekly report", "weekly report"],
      command: "report",
      label: "Prepare weekly report",
      kind: "prepare_report",
    },
  ];

  for (const entry of powerCommands) {
    if (entry.phrases.includes(normalized)) {
      candidates.push(commandCandidate(entry.kind, rawTranscript, entry.label, 90, entry.command));
    }
  }

  const focus = parseLeadingValue(normalized, ["start focus on", "start focus", "focus on", "focus"]);
  if (focus) {
    candidates.push(commandCandidate("start_focus", rawTranscript, `Start focus: ${focus}`, 82, `focus: ${focus}`));
  }

  const target = normalized
    .replace(/^(go to|open|show|take me to)\s+/, "")
    .replace(/^the\s+/, "");
  const route = routeTargets[target];
  if (route && /^(go to|open|show|take me to)\b/.test(normalized)) {
    candidates.push({
      ...commandCandidate("navigate", rawTranscript, route.label, 88),
      path: route.path,
      requiresConfirmation: false,
    });
  }

  return candidates;
}

function commandCandidate(
  kind: VoiceIntentKind,
  rawTranscript: string,
  label: string,
  score: number,
  command?: string,
): VoiceIntentCandidate {
  return {
    id: kind,
    kind,
    score,
    scoreBreakdown: { ...emptyBreakdown, commandPhrase: score },
    label,
    command,
    requiresConfirmation: false,
    missingSlots: [],
    evidence: [`Matched command: ${rawTranscript}`],
    issues: [],
  };
}

function scoreCapture(
  kind: CaptureKind,
  input: {
    rawTranscript: string;
    normalized: string;
    hasStrongCommand: boolean;
    commandText: string | null;
    content: string;
    metadata: ParsedTaskSlots | ParsedManualLogSlots;
  },
): IntentScoreBreakdown {
  const score = { ...emptyBreakdown };
  const contentWords = wordCount(input.content);
  const otherKindCommand = kind === "task" ? hasManualLogCommand(input.normalized) : hasTaskCommand(input.normalized);

  if (input.hasStrongCommand) score.commandPhrase += 48;
  if (kind === "manual_log" && /\b(spent|worked on|meeting|standup|call)\b/i.test(input.normalized)) {
    score.targetPhrase += 18;
  }
  if (kind === "task" && /\b(task|todo|to do|remind me|follow up|blocker|carry ?over)\b/i.test(input.normalized)) {
    score.targetPhrase += 18;
  }
  if (contentWords >= 2) score.contentQuality += 20;
  else if (contentWords === 1) score.contentQuality += 10;
  else score.contentQuality -= 20;

  if ("durationMinutes" in input.metadata && input.metadata.durationMinutes) score.slotEvidence += 18;
  if ("activityType" in input.metadata && input.metadata.activityType !== "Development") score.slotEvidence += 8;
  if ("priority" in input.metadata && input.metadata.priority !== "normal") score.slotEvidence += 8;
  if ("taskType" in input.metadata && input.metadata.taskType !== "planned_work") score.slotEvidence += 8;
  if (input.metadata.projectHint) score.slotEvidence += 5;

  if (!input.hasStrongCommand && kind === "manual_log" && /\bspent\s+.+\b(minutes?|mins?|hours?|hrs?|hr)\b/i.test(input.normalized)) {
    score.commandPhrase += 40;
  }
  if (!input.hasStrongCommand && kind === "manual_log" && /\bworked on\b/i.test(input.normalized)) {
    score.commandPhrase += 32;
  }
  if (!input.hasStrongCommand && kind === "task" && /^\s*(follow up|blocker|carry ?over)\b/i.test(input.normalized)) {
    score.commandPhrase += 26;
  }
  if (otherKindCommand) score.conflictPenalty -= input.hasStrongCommand ? 14 : 22;

  return score;
}

type ParsedTaskSlots = {
  title: string;
  taskType: WeeklyTaskType;
  priority: WeeklyTaskPriority;
  projectHint: string | null;
  projectMatch: ProjectMatch | null;
  estimatedMinutes: number | null;
  evidence: string[];
  projectIssue: VoiceParseIssue | null;
  slots: VoiceTaskSlots;
};

type ParsedManualLogSlots = {
  summary: string;
  activityType: ActivityType;
  durationMinutes: number | null;
  projectHint: string | null;
  projectMatch: ProjectMatch | null;
  evidence: string[];
  projectIssue: VoiceParseIssue | null;
  slots: VoiceManualLogSlots;
};

function parseTaskSlots(body: string, context: VoiceParseContext): ParsedTaskSlots {
  let text = body;
  const priority = parsePriority(text);
  text = priority.text;
  const taskType = parseTaskType(text);
  text = taskType.text;
  const duration = parseDuration(text);
  text = duration.text;
  const project = parseProjectHint(text, context);
  text = project.text;
  const title = tidyContent(text);

  return {
    title,
    taskType: taskType.value,
    priority: priority.value,
    projectHint: project.value,
    projectMatch: project.match,
    estimatedMinutes: duration.value,
    evidence: [
      ...(priority.source === "explicit" ? [`Priority: ${priority.value}`] : []),
      ...(taskType.source === "explicit" ? [`Task type: ${taskType.value}`] : []),
      ...(duration.value ? [`Estimated time: ${duration.value}m`] : []),
      ...(project.value ? [`Project hint: ${project.value}`] : []),
    ],
    projectIssue: project.issue,
    slots: {
      title: title ? slot(title, title, "explicit", 80) : undefined,
      taskType: slot(taskType.value, taskType.rawText, taskType.source, taskType.source === "explicit" ? 85 : 55),
      priority: slot(priority.value, priority.rawText, priority.source, priority.source === "explicit" ? 85 : 55),
      project: slot(project.match, project.value ?? "", project.match ? "explicit" : project.value ? "fuzzy" : "default", project.match ? 90 : 40),
      estimatedMinutes: slot(duration.value, duration.rawText, duration.value ? "explicit" : "default", duration.value ? 80 : 40),
    },
  };
}

function parseManualLogSlots(body: string, context: VoiceParseContext): ParsedManualLogSlots {
  let text = body;
  const duration = parseDuration(text);
  text = duration.text;
  const project = parseProjectHint(text, context);
  text = project.text;
  const activityType = parseActivityType(body);
  const summary = tidyContent(text);

  return {
    summary,
    activityType: activityType.value,
    durationMinutes: duration.value,
    projectHint: project.value,
    projectMatch: project.match,
    evidence: [
      ...(duration.value ? [`Duration: ${duration.value}m`] : []),
      ...(activityType.source === "keyword" ? [`Activity type: ${activityType.value}`] : []),
      ...(project.value ? [`Project hint: ${project.value}`] : []),
    ],
    projectIssue: project.issue,
    slots: {
      summary: summary ? slot(summary, summary, "explicit", 80) : undefined,
      activityType: slot(activityType.value, activityType.rawText, activityType.source, activityType.source === "keyword" ? 80 : 50),
      durationMinutes: slot(duration.value, duration.rawText, duration.value ? "explicit" : "default", duration.value ? 85 : 40),
      project: slot(project.match, project.value ?? "", project.match ? "explicit" : project.value ? "fuzzy" : "default", project.match ? 90 : 40),
    },
  };
}

function slot<T>(
  value: T,
  rawText: string,
  source: VoiceSlot<T>["source"],
  confidence: number,
): VoiceSlot<T> {
  return {
    value,
    rawText,
    normalizedText: normalizeForMatching(rawText).normalized,
    source,
    confidence,
  };
}

function taskDraft(
  rawTranscript: string,
  title: string,
  parsed: ParsedTaskSlots,
  confidence: VoiceCaptureDraft["confidence"],
  score: number,
  issues: VoiceParseIssue[],
): VoiceCaptureDraft {
  return {
    kind: "task",
    transcript: rawTranscript,
    cleanedContent: title,
    confidence,
    score,
    reason: issues[0]?.message ?? null,
    issues: issues.map((issue) => issue.message),
    task: {
      title: title || rawTranscript,
      taskType: parsed.taskType,
      priority: parsed.priority,
      projectHint: parsed.projectHint,
    },
    manualLog: null,
  };
}

function manualLogDraft(
  rawTranscript: string,
  summary: string,
  parsed: ParsedManualLogSlots,
  confidence: VoiceCaptureDraft["confidence"],
  score: number,
  issues: VoiceParseIssue[],
): VoiceCaptureDraft {
  return {
    kind: "manual_log",
    transcript: rawTranscript,
    cleanedContent: summary,
    confidence,
    score,
    reason: issues[0]?.message ?? null,
    issues: issues.map((issue) => issue.message),
    task: null,
    manualLog: {
      summary: summary || rawTranscript,
      activityType: parsed.activityType,
      durationMinutes: parsed.durationMinutes,
      projectHint: parsed.projectHint,
    },
  };
}

function unknownDraft(
  transcript: string,
  reason: string,
  score: number,
  issues: VoiceParseIssue[],
): VoiceCaptureDraft {
  return {
    kind: "unknown",
    transcript: normalizeDisplayTranscript(transcript),
    cleanedContent: tidyContent(transcript),
    confidence: "low",
    score,
    reason,
    issues: issues.map((issue) => issue.message),
    task: null,
    manualLog: null,
  };
}

function buildCandidateIssues(
  kind: CaptureKind,
  content: string,
  rawTranscript: string,
  commandText: string | null,
  projectIssue: VoiceParseIssue | null,
): VoiceParseIssue[] {
  const issues: VoiceParseIssue[] = [];
  if (!content) {
    issues.push({
      code: "missing_content",
      severity: "warning",
      message: kind === "task" ? "Task trigger was heard without a title." : "Manual log trigger was heard without a summary.",
    });
  }
  if (commandText && tidyContent(rawTranscript) !== content) {
    issues.push({
      code: "trigger_removed",
      severity: "info",
      message: `Removed command words: ${commandText}.`,
    });
  }
  if (projectIssue) issues.push(projectIssue);
  return issues;
}

function collectIssues(candidates: VoiceIntentCandidate[], rawTranscript: string): VoiceParseIssue[] {
  const issues = candidates.flatMap((candidate) => candidate.issues);
  if (!rawTranscript) {
    issues.push({ code: "missing_content", severity: "error", message: "No speech was transcribed." });
  }
  if (hasMultipleCommandHeads(rawTranscript)) {
    issues.push({
      code: "multiple_commands",
      severity: "warning",
      message: "Multiple command phrases were heard. Review before saving.",
    });
  }
  const top = candidates[0];
  const second = candidates[1];
  if (top && second && top.score - second.score < 15) {
    issues.push({
      code: "ambiguous_intent",
      severity: "warning",
      message: "Task and manual log intent are close. Choose the right kind before saving.",
    });
  }
  if (!top || top.score < 55) {
    issues.push({
      code: "low_confidence",
      severity: "warning",
      message: "The transcript needs review before saving.",
    });
  }
  return dedupeIssues(issues);
}

function classifyStatus(
  topCandidate: VoiceIntentCandidate | undefined,
  secondCandidate: VoiceIntentCandidate | undefined,
  issues: VoiceParseIssue[],
): VoiceParseStatus {
  if (!topCandidate || topCandidate.score < 55) return "unknown_review";
  if (issues.some((issue) => issue.code === "multiple_commands" || issue.code === "ambiguous_intent")) {
    return "ambiguous";
  }
  if (secondCandidate && topCandidate.score - secondCandidate.score < 15) return "ambiguous";
  if (issues.some((issue) => issue.code === "project_ambiguous" || issue.code === "project_unmatched")) {
    return "review";
  }
  if (topCandidate.score >= 75) return "actionable";
  return "review";
}

function matchLeadingTrigger(raw: string, triggers: string[]): TriggerMatch | null {
  const source = stripInvocation(raw);
  const sorted = [...triggers].sort((left, right) => right.length - left.length);
  for (const trigger of sorted) {
    const tokenMatch = matchLeadingTriggerByTokens(source, trigger);
    if (tokenMatch) return tokenMatch;
    const pattern = new RegExp(`^\\s*${triggerToPattern(trigger)}(?:\\s*(?:[.:,;!?-]+|that\\b|about\\b|on\\b)?\\s*)`, "i");
    const match = source.match(pattern);
    if (!match) continue;
    const body = source.slice(match[0].length);
    if (!body.trim() && normalizeLoose(source) !== normalizeLoose(trigger)) return null;
    return {
      body,
      trigger,
      commandText: source.slice(0, match[0].length).trim().replace(/[.:,;!?-]+$/g, ""),
    };
  }
  return null;
}

function matchLeadingTriggerByTokens(source: string, trigger: string): TriggerMatch | null {
  const sourceTokens = [...source.matchAll(/[a-z0-9']+/gi)];
  const triggerTokens = normalizeLoose(trigger).split(/\s+/).filter(Boolean);
  if (!sourceTokens.length || !triggerTokens.length || sourceTokens.length < triggerTokens.length) return null;

  for (let index = 0; index < triggerTokens.length; index += 1) {
    if (normalizeLoose(sourceTokens[index][0]) !== triggerTokens[index]) return null;
  }

  const end = sourceTokens[triggerTokens.length - 1].index + sourceTokens[triggerTokens.length - 1][0].length;
  const commandText = source.slice(0, end).trim();
  const body = source
    .slice(end)
    .replace(/^\s*(?:[.:,;!?-]+|\b(?:that|about|on)\b)?\s*/i, "");
  return { body, trigger, commandText };
}

function stripManualLogSpecialForms(body: string, normalized: string): TriggerMatch {
  const spent = body.match(/^\s*spent\s+(.+?)\s+(?:on|working on)\s+(.+)$/i);
  if (spent) {
    return { body: `${spent[1]} ${spent[2]}`, trigger: "spent", commandText: "spent" };
  }
  const meeting = body.match(/^\s*meeting\s+about\s+(.+)$/i);
  if (meeting) {
    return { body: `meeting about ${meeting[1]}`, trigger: "meeting about", commandText: "meeting about" };
  }
  if (/^\s*worked on\b/i.test(body)) {
    return { body: body.replace(/^\s*worked on\b[\s:.,;-]*/i, ""), trigger: "worked on", commandText: "worked on" };
  }
  if (/^\s*spent\b/i.test(normalized)) {
    return { body, trigger: "spent", commandText: "spent" };
  }
  return { body, trigger: "", commandText: "" };
}

function stripTaskSpecialForms(body: string): TriggerMatch {
  const cleaned = body
    .replace(/^(i(?:'d| would| want to| need to)?\s+)?(?:add|create|make|new|ad|at)?\s*(?:a\s+)?(?:tasks?|todo|to do)\b[\s:.,;-]*/i, "")
    .replace(/^i(?:'d| would)?\s+/i, "");
  if (cleaned !== body) {
    return { body: cleaned, trigger: "task", commandText: body.slice(0, body.length - cleaned.length).trim() };
  }
  return { body, trigger: "", commandText: "" };
}

function parsePriority(body: string): {
  value: WeeklyTaskPriority;
  text: string;
  rawText: string;
  source: VoiceSlot<WeeklyTaskPriority>["source"];
} {
  const high = body.match(/\b(high priority|priority high|urgent|important)\b/i);
  if (high) return { value: "high", text: body.replace(high[0], ""), rawText: high[0], source: "explicit" };
  const low = body.match(/\b(low priority|priority low)\b/i);
  if (low) return { value: "low", text: body.replace(low[0], ""), rawText: low[0], source: "explicit" };
  const normal = body.match(/\b(normal priority|priority normal)\b/i);
  if (normal) return { value: "normal", text: body.replace(normal[0], ""), rawText: normal[0], source: "explicit" };
  return { value: "normal", text: body, rawText: "", source: "default" };
}

function parseTaskType(body: string): {
  value: WeeklyTaskType;
  text: string;
  rawText: string;
  source: VoiceSlot<WeeklyTaskType>["source"];
} {
  const entries: Array<{ value: WeeklyTaskType; pattern: RegExp }> = [
    { value: "blocker", pattern: /\bblocker\b/i },
    { value: "carryover", pattern: /\bcarry ?over\b/i },
    { value: "follow_up", pattern: /\bfollow up\b/i },
    { value: "completed_checklist", pattern: /\b(completed )?checklist\b/i },
  ];
  for (const entry of entries) {
    const match = body.match(entry.pattern);
    if (match) return { value: entry.value, text: body.replace(match[0], ""), rawText: match[0], source: "explicit" };
  }
  return { value: "planned_work", text: body, rawText: "", source: "default" };
}

function parseActivityType(body: string): {
  value: ActivityType;
  rawText: string;
  source: VoiceSlot<ActivityType>["source"];
} {
  for (const entry of activityKeywords) {
    const match = entry.patterns.map((pattern) => body.match(pattern)).find(Boolean);
    if (match) return { value: entry.value, rawText: match[0], source: "keyword" };
  }
  return { value: "Development", rawText: "", source: "default" };
}

function parseDuration(body: string): {
  value: number | null;
  text: string;
  rawText: string;
} {
  const match = body.match(
    /\b(?:(\d+(?:\.\d+)?)|(one|two|three|four|five|six|seven|eight|nine|ten|half))\s*(minutes?|mins?|hours?|hrs?|hour|hr)\b/i,
  );
  if (!match) return { value: null, text: body, rawText: "" };

  let amount = match[1] ? Number(match[1]) : numberWordToNumber(match[2] ?? "");
  const unit = match[3].toLowerCase();
  if (match[2]?.toLowerCase() === "half" && (unit.startsWith("hour") || unit.startsWith("hr"))) {
    amount = 0.5;
  }
  const minutes = unit.startsWith("hour") || unit.startsWith("hr") ? amount * 60 : amount;
  return {
    value: Math.max(1, Math.round(minutes)),
    text: body.replace(match[0], ""),
    rawText: match[0],
  };
}

function parseProjectHint(body: string, context: VoiceParseContext): {
  value: string | null;
  match: ProjectMatch | null;
  text: string;
  issue: VoiceParseIssue | null;
} {
  const explicit = body.match(/\b(?:for|on|in)\s+project\s+(.+)$/i);
  if (!explicit) return { value: null, match: null, text: body, issue: null };

  const value = tidyContent(explicit[1]);
  const matches = matchProjects(value, context);
  const text = body.slice(0, explicit.index).trim();
  if (matches.length === 1 && matches[0].matchKind !== "fuzzy") {
    return { value, match: matches[0], text, issue: null };
  }
  return {
    value,
    match: null,
    text,
    issue: {
      code: matches.length ? "project_ambiguous" : "project_unmatched",
      severity: "warning",
      message: matches.length
        ? `Project hint "${value}" has multiple possible matches.`
        : `Project hint "${value}" was not matched automatically.`,
    },
  };
}

function matchProjects(value: string, context: VoiceParseContext): ProjectMatch[] {
  const hint = normalizeLoose(value);
  if (!hint || !context.projects?.length) return [];
  const matches: ProjectMatch[] = [];
  for (const project of context.projects) {
    const names = [project.name, ...(project.aliases ?? [])];
    for (const name of names) {
      const normalized = normalizeLoose(name);
      if (normalized === hint) {
        matches.push({ projectId: project.id, name: project.name, matchKind: name === project.name ? "exact" : "alias" });
        break;
      }
      if (normalized.includes(hint) && hint.length >= 3) {
        matches.push({ projectId: project.id, name: project.name, matchKind: "contains" });
        break;
      }
    }
  }
  return matches;
}

function parseLeadingValue(normalized: string, prefixes: string[]) {
  for (const prefix of prefixes) {
    if (normalized === prefix) return null;
    if (normalized.startsWith(`${prefix} `)) {
      return normalized.slice(prefix.length).trim();
    }
  }
  return null;
}

function hasTaskCommand(normalized: string) {
  return taskTriggers.some((trigger) => new RegExp(`\\b${triggerToPattern(trigger)}\\b`, "i").test(normalized));
}

function hasManualLogCommand(normalized: string) {
  return manualLogTriggers.some((trigger) => new RegExp(`\\b${triggerToPattern(trigger)}\\b`, "i").test(normalized));
}

function hasMultipleCommandHeads(rawTranscript: string) {
  const normalized = normalizeForMatching(rawTranscript).normalized;
  const heads = [
    ...taskTriggers.filter((trigger) => new RegExp(`\\b${triggerToPattern(trigger)}\\b`, "i").test(normalized)),
    ...manualLogTriggers.filter((trigger) => new RegExp(`\\b${triggerToPattern(trigger)}\\b`, "i").test(normalized)),
    ...["sync", "open", "show", "report", "prepare report"].filter((trigger) => (
      new RegExp(`\\b${triggerToPattern(trigger)}\\b`, "i").test(normalized)
    )),
  ];
  return new Set(heads.map(normalizeLoose)).size > 1 && /\b(?:then|and then|also)\b/i.test(normalized);
}

function normalizeDisplayTranscript(transcript: string) {
  return transcript
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,!?]+$/g, "");
}

function normalizeForMatching(transcript: string): { normalized: string; corrections: VoiceCorrection[] } {
  let normalized = normalizeDisplayTranscript(transcript).toLowerCase();
  const corrections: VoiceCorrection[] = [];
  const replacements: Array<{ pattern: RegExp; original: string; corrected: string; kind: VoiceCorrection["kind"] }> = [
    { pattern: /\bi[' ]?d task\b/g, original: "I'd task", corrected: "add task", kind: "command_phrase" },
    { pattern: /\bi[' ]?d tasks\b/g, original: "I'd tasks", corrected: "add tasks", kind: "command_phrase" },
    { pattern: /\bad task\b/g, original: "ad task", corrected: "add task", kind: "asr_confusion" },
    { pattern: /\bad tasks\b/g, original: "ad tasks", corrected: "add tasks", kind: "asr_confusion" },
    { pattern: /\bat task\b/g, original: "at task", corrected: "add task", kind: "asr_confusion" },
    { pattern: /\bat tasks\b/g, original: "at tasks", corrected: "add tasks", kind: "asr_confusion" },
    { pattern: /\bto do\b/g, original: "to do", corrected: "todo", kind: "command_phrase" },
    { pattern: /\bwork ?clock\b/g, original: "work clock", corrected: "work log", kind: "asr_confusion" },
    { pattern: /\bworklock\b/g, original: "worklock", corrected: "work log", kind: "asr_confusion" },
    { pattern: /\bmanuel log\b/g, original: "manuel log", corrected: "manual log", kind: "asr_confusion" },
    { pattern: /\bspark force\b/g, original: "spark force", corrected: "sparc force", kind: "product_term" },
    { pattern: /\bsink repositories\b/g, original: "sink repositories", corrected: "sync repositories", kind: "asr_confusion" },
    { pattern: /\bcoat review\b/g, original: "coat review", corrected: "code review", kind: "asr_confusion" },
  ];
  for (const replacement of replacements) {
    if (!replacement.pattern.test(normalized)) continue;
    normalized = normalized.replace(replacement.pattern, replacement.corrected);
    corrections.push({
      original: replacement.original,
      corrected: replacement.corrected,
      kind: replacement.kind,
      confidence: 80,
      appliedTo: "scoring",
    });
  }
  normalized = stripInvocation(normalized).replace(/\s+/g, " ").trim();
  return { normalized, corrections };
}

function stripInvocation(value: string) {
  return value.replace(/^(?:please\s+|hey\s+worktrace\s+|worktrace\s+)+/i, "").trim();
}

function triggerToPattern(trigger: string) {
  return trigger.split(/\s+/).map(escapeRegex).join("\\s+");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLoose(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function applyContentCorrections(value: string) {
  return value.replace(/\blessons\b/gi, "Blessings");
}

function tidyContent(value: string) {
  return applyContentCorrections(value)
    .replace(/^[\s:.,;!?-]+/g, "")
    .replace(/[\s:.,;!?-]+$/g, "")
    .replace(/\bfor\s+$/i, "")
    .replace(/\bon\s+$/i, "")
    .replace(/\bin\s+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string) {
  return tidyContent(value).split(/\s+/).filter(Boolean).length;
}

function numberWordToNumber(value: string) {
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    half: 0.5,
  };
  return words[value.toLowerCase()] ?? 0;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dedupeIssues(issues: VoiceParseIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
