import { describe, expect, it } from "vitest";
import type { ActivityItem } from "../types/activity";
import type { ActivityGroup } from "../types/activityGroup";
import type { WeeklyTask } from "../types/weeklyTask";
import { buildStoryDays, summarizeStoryDay, type MixedTimelineDay, type TimelineEntry } from "../components/timeline/storyTimelineModel";

describe("story timeline model", () => {
  it("sorts story days chronologically", () => {
    const days = buildStoryDays([
      { date: "2026-05-20", items: [activityEntry("a2", "2026-05-20T10:00:00Z", "Reviewed UI polish")] },
      { date: "2026-05-18", items: [activityEntry("a1", "2026-05-18T10:00:00Z", "Started notification fixes")] },
    ]);

    expect(days.map((day) => day.date)).toEqual(["2026-05-18", "2026-05-20"]);
  });

  it("prefers group report summaries over summaries and titles", () => {
    const summary = summarizeStoryDay([
      groupEntry({
        id: "g1",
        title: "Fallback title",
        summary: "Generic summary",
        reportSummary: "Prepared stakeholder demo notes",
      }),
    ]);

    expect(summary).toBe("Prepared stakeholder demo notes.");
  });

  it("uses grouped work as one story beat without requiring raw child commits", () => {
    const group = groupEntry({
      id: "g1",
      title: "Notification fixes",
      summary: "Fixed notification delivery edge cases",
      reportSummary: "Fixed notification delivery edge cases",
      items: [
        { id: "gi1", sourceId: "commit-1", summarySnapshot: "fix: notification retry" },
        { id: "gi2", sourceId: "commit-2", summarySnapshot: "fix: notification status" },
      ],
    });
    const days = buildStoryDays([{ date: "2026-05-18", items: [group] }]);

    expect(days[0].summary).toBe("Fixed notification delivery edge cases.");
    expect(days[0].entries).toHaveLength(1);
    expect(days[0].evidenceCount).toBe(2);
  });

  it("includes manual logs and weekly tasks in the day story", () => {
    const day: MixedTimelineDay = {
      date: "2026-05-19",
      items: [
        activityEntry("m1", "2026-05-19T09:00:00Z", "Reviewed QA feedback", "Meeting"),
        taskEntry("t1", "2026-05-19", "Verify escalation behavior", "completed"),
      ],
    };

    const [storyDay] = buildStoryDays([day]);

    expect(storyDay.summary).toContain("Meeting: Reviewed QA feedback");
    expect(storyDay.summary).toContain("Completed Verify escalation behavior");
    expect(storyDay.reportReadyCount).toBe(2);
  });

  it("surfaces weak groups as needing review", () => {
    const [storyDay] = buildStoryDays([
      {
        date: "2026-05-21",
        items: [
          groupEntry({
            id: "g1",
            title: "Fallback module changes",
            reviewStatus: "needs_review",
            confidenceLabel: "needs_review",
            titleQualityLabel: "fallback_only",
          }),
        ],
      },
    ]);

    expect(storyDay.needsReviewCount).toBe(1);
  });
});

function activityEntry(
  id: string,
  occurredAt: string,
  summary: string,
  activityType = "commit",
): TimelineEntry {
  return {
    kind: "activity",
    id,
    occurredAt,
    item: {
      id,
      projectId: "project-1",
      projectName: "WorkTrace",
      workspaceId: null,
      workspaceName: null,
      workspaceRelativePath: null,
      activityType,
      summary,
      occurredAt,
      includedInReport: true,
      commitHash: activityType === "commit" ? id : null,
      authorName: null,
      authorEmail: null,
      branch: null,
      filesChanged: null,
      insertions: null,
      deletions: null,
      refs: [],
      worktree: null,
    } satisfies ActivityItem,
  };
}

function groupEntry(input: {
  id: string;
  title: string;
  summary?: string | null;
  reportSummary?: string | null;
  reviewStatus?: string;
  confidenceLabel?: string;
  titleQualityLabel?: string | null;
  items?: Array<{ id: string; sourceId: string; summarySnapshot: string }>;
}): TimelineEntry {
  const occurredAt = "2026-05-18T10:00:00Z";
  return {
    kind: "group",
    id: input.id,
    occurredAt,
    group: {
      id: input.id,
      projectId: "project-1",
      projectName: "WorkTrace",
      workspaceId: null,
      workspaceName: null,
      projectCount: 1,
      projects: [{ projectId: "project-1", projectName: "WorkTrace" }],
      title: input.title,
      summary: input.summary ?? null,
      startDate: "2026-05-18",
      endDate: "2026-05-18",
      source: "local_rule",
      confidence: 0.8,
      includedInReport: true,
      confidenceLabel: input.confidenceLabel ?? "strong",
      rationaleJson: null,
      reportSummary: input.reportSummary ?? null,
      locked: false,
      reviewStatus: input.reviewStatus ?? "reviewed",
      titleConfidence: null,
      titleConfidenceLabel: null,
      titleQualityLabel: input.titleQualityLabel ?? "report_ready",
      titleStrategy: null,
      titleRationaleJson: null,
      titleCandidatesJson: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      items: (input.items ?? [{ id: "gi1", sourceId: "commit-1", summarySnapshot: input.title }]).map((item) => ({
        id: item.id,
        groupId: input.id,
        sourceType: "commit",
        sourceId: item.sourceId,
        occurredAt,
        summarySnapshot: item.summarySnapshot,
        activity: null,
        createdAt: occurredAt,
      })),
    } satisfies ActivityGroup,
  };
}

function taskEntry(
  id: string,
  occurredAt: string,
  title: string,
  status: WeeklyTask["status"],
): TimelineEntry {
  return {
    kind: "task",
    id,
    occurredAt,
    task: {
      id,
      projectId: "project-1",
      projectName: "WorkTrace",
      taskType: "completed_checklist",
      status,
      title,
      details: null,
      weekStartDate: "2026-05-18",
      targetDate: occurredAt,
      completedAt: occurredAt,
      priority: "normal",
      includedInReport: true,
      progressPercent: null,
      estimatedMinutes: null,
      createdAt: `${occurredAt}T00:00:00Z`,
      updatedAt: `${occurredAt}T00:00:00Z`,
    } satisfies WeeklyTask,
  };
}
