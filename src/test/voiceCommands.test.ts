import { describe, expect, it } from "vitest";
import {
  extractVoiceCaptureContent,
  normalizeVoiceTranscript,
  parseVoiceCaptureDraft,
  parseVoiceTranscript,
} from "../lib/voiceCommands";

describe("voice command parsing", () => {
  it("keeps existing navigation and power commands", () => {
    expect(normalizeVoiceTranscript("sync repositories")).toMatchObject({
      kind: "power",
      command: "sync",
    });
    expect(normalizeVoiceTranscript("open weekly plan")).toMatchObject({
      kind: "navigation",
      path: "/weekly-plan",
    });
  });

  it("parses explicit task triggers into editable task drafts", () => {
    const command = normalizeVoiceTranscript("add task high priority blocker fix updater install");

    expect(command.kind).toBe("capture");
    if (command.kind !== "capture") return;
    expect(command.draft).toMatchObject({
      kind: "task",
      confidence: "high",
      task: {
        title: "fix updater install",
        taskType: "blocker",
        priority: "high",
      },
    });
  });

  it("parses todo and remind-me task triggers", () => {
    expect(parseVoiceCaptureDraft("todo follow up invoice review")).toMatchObject({
      kind: "task",
      task: { title: "invoice review", taskType: "follow_up" },
    });
    expect(parseVoiceCaptureDraft("remind me to write release notes")).toMatchObject({
      kind: "task",
      task: { title: "write release notes" },
    });
  });

  it("parses manual log duration and activity type", () => {
    expect(parseVoiceCaptureDraft("spent 30 minutes on deployment checks")).toMatchObject({
      kind: "manual_log",
      manualLog: {
        summary: "deployment checks",
        durationMinutes: 30,
        activityType: "Deployment",
      },
    });
  });

  it("parses number-word durations for manual logs", () => {
    expect(parseVoiceCaptureDraft("worked on two hours research for project WorkTrace")).toMatchObject({
      kind: "manual_log",
      manualLog: {
        summary: "research",
        durationMinutes: 120,
        activityType: "Research",
        projectHint: "WorkTrace",
      },
    });
  });

  it("strips work log trigger phrases across punctuation", () => {
    const transcripts = [
      "Add work log. Going to church tomorrow to praise with friends",
      "Add work log: Going to church tomorrow to praise with friends",
      "work log - Going to church tomorrow to praise with friends",
    ];

    for (const transcript of transcripts) {
      expect(parseVoiceCaptureDraft(transcript)).toMatchObject({
        kind: "manual_log",
        manualLog: {
          summary: "Going to church tomorrow to praise with friends",
        },
      });
    }
  });

  it("strips repeated trigger words from the selected capture kind", () => {
    expect(extractVoiceCaptureContent("manual_log", "add work log add work log deployment checks")).toBe(
      "deployment checks",
    );
    expect(extractVoiceCaptureContent("task", "add task work log cleanup")).toBe("work log cleanup");
  });

  it("returns a low-confidence draft when no capture trigger matches", () => {
    expect(parseVoiceCaptureDraft("maybe this should be saved somewhere")).toMatchObject({
      kind: "unknown",
      confidence: "low",
    });
  });

  it("infers task intent from imperfect speech-to-text task wording", () => {
    expect(parseVoiceCaptureDraft("I'd task. Talk to Blessings Monday morning")).toMatchObject({
      kind: "task",
      task: {
        title: "Talk to Blessings Monday morning",
      },
    });
  });

  it("marks command collisions as ambiguous instead of silently choosing", () => {
    const result = parseVoiceTranscript("add task fix updater then sync repositories");

    expect(result.status).toBe("ambiguous");
    expect(parseVoiceCaptureDraft("add task fix updater then sync repositories")).toMatchObject({
      kind: "unknown",
      confidence: "low",
    });
  });

  it("does not convert duration without a unit", () => {
    expect(parseVoiceCaptureDraft("spent for two on planning")).toMatchObject({
      kind: "manual_log",
      manualLog: {
        durationMinutes: null,
      },
    });
  });

  it("does not treat command-like content as a power command", () => {
    const draft = parseVoiceCaptureDraft("add task document sync process");

    expect(draft).toMatchObject({
      kind: "task",
      task: { title: "document sync process" },
    });
  });

  it("keeps fuzzy project hints in review instead of auto-selecting", () => {
    const result = parseVoiceTranscript("add task fix deployment for project API", {
      projects: [
        { id: "1", name: "API Platform" },
        { id: "2", name: "API Gateway" },
      ],
    });

    expect(result.topCandidate?.captureDraft).toMatchObject({
      kind: "task",
      task: { projectHint: "API" },
    });
    expect(result.issues.some((issue) => issue.code === "project_ambiguous")).toBe(true);
  });
});
