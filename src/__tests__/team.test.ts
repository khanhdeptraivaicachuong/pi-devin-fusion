/**
 * Tests for team sidekick orchestration helpers.
 */

import type { Model } from "../types.ts";
import {
	assignExecutorsToParts,
	buildWorkerPrompt,
	formatTeamResult,
	normalizeTeamParts,
	parseWorkerResult,
	runTeamWorkers,
	teamStatus,
} from "../team.ts";
import { eq, fakeModel, test } from "./_harness.ts";

test("normalizeTeamParts preserves explicit parts", () => {
	const parts = normalizeTeamParts("overall", [
		{ name: "config", prompt: "read config" },
		{ prompt: "read tests" },
	], 3);
	eq(parts, [
		{ name: "config", prompt: "read config" },
		{ name: "worker-2", prompt: "read tests" },
	], "explicit parts");
});

test("normalizeTeamParts caps explicit parts to six", () => {
	const parts = normalizeTeamParts("overall", Array.from({ length: 8 }, (_, i) => ({ name: `p${i}`, prompt: `part ${i}` })), 8);
	eq(parts.length, 6, "explicit parts cap");
});

test("normalizeTeamParts uses heuristic fallback workers", () => {
	const parts = normalizeTeamParts("review config, UI, and tests", undefined, 3);
	eq(parts.map((p) => p.name), ["core", "ui", "tests"], "heuristic names");
	if (!parts[0].prompt.includes("config/runtime")) throw new Error("expected core scope prompt");
});

test("normalizeTeamParts falls back to perspective workers", () => {
	const parts = normalizeTeamParts("review this repository", undefined, 3);
	eq(parts.map((p) => p.name), ["architecture", "risk", "tests"], "fallback names");
});

test("assignExecutorsToParts round-robins executors", () => {
	const executors: Model<never>[] = [fakeModel("openai", "mini") as Model<never>, fakeModel("anthropic", "haiku") as Model<never>];
	const assigned = assignExecutorsToParts([
		{ name: "a", prompt: "A" },
		{ name: "b", prompt: "B" },
		{ name: "c", prompt: "C" },
	], executors);
	eq(assigned.map((a) => `${a.executor.provider}/${a.executor.id}`), ["openai/mini", "anthropic/haiku", "openai/mini"], "round-robin");
});

test("teamStatus reflects ok partial and error", () => {
	eq(teamStatus([{ name: "a", status: "ok" }]), "ok", "all ok");
	eq(teamStatus([{ name: "a", status: "ok" }, { name: "b", status: "error" }]), "partial", "partial");
	eq(teamStatus([{ name: "a", status: "error" }]), "error", "all error");
});

test("formatTeamResult includes synthesis and worker sections", () => {
	const formatted = formatTeamResult({
		status: "partial",
		team: [
			{ name: "core", executor_model: "openai/mini", status: "ok", summary: "Core good", findings: ["A"], files: ["src/config.ts"] },
			{ name: "ui", executor_model: "anthropic/haiku", status: "error", error: "failed" },
		],
		warnings: ["warn"],
	});
	if (!formatted.includes("# Team sidekick result")) throw new Error("missing title");
	if (!formatted.includes("## Worker: core — openai/mini")) throw new Error("missing worker section");
	if (!formatted.includes("Status: partial")) throw new Error("missing status");
});

test("buildWorkerPrompt includes shared objective, scope, and JSON contract", () => {
	const prompt = buildWorkerPrompt("review repo", { name: "core", prompt: "read runtime" }, "recent context");
	if (!prompt.includes("Shared objective:\nreview repo")) throw new Error("missing shared objective");
	if (!prompt.includes("Your assigned scope:\nread runtime")) throw new Error("missing scope");
	if (!prompt.includes('"handoff_notes"')) throw new Error("missing JSON contract");
});

test("runTeamWorkers preserves order and returns partial status", async () => {
	const assigned = [
		{ part: { name: "a", prompt: "A" }, executor: fakeModel("openai", "mini") },
		{ part: { name: "b", prompt: "B" }, executor: fakeModel("anthropic", "haiku") },
	];
	const result = await runTeamWorkers(assigned, 2, async ({ part, executor }) => {
		if (part.name === "b") throw new Error("Bearer sk-1234567890abcdef failed");
		return { name: part.name, executor_model: `${executor.provider}/${executor.id}`, status: "ok", summary: "done" };
	});
	eq(result.status, "partial", "partial status");
	eq(result.team.map((r) => r.name), ["a", "b"], "result order");
	eq(result.team[1].error, "Bearer [redacted] failed", "sanitized error");
});

test("parseWorkerResult accepts JSON and falls back to summary", () => {
	eq(parseWorkerResult("core", "openai/mini", '{"status":"ok","summary":"done","findings":["A"],"files":["src/team.ts"]}'), {
		name: "core",
		executor_model: "openai/mini",
		status: "ok",
		summary: "done",
		findings: ["A"],
		files: ["src/team.ts"],
	}, "json result");
	eq(parseWorkerResult("risk", "openai/mini", "plain text"), {
		name: "risk",
		executor_model: "openai/mini",
		status: "ok",
		summary: "plain text",
	}, "fallback summary");
});

test("parseWorkerResult reads fenced JSON errors", () => {
	eq(parseWorkerResult("core", "openai/mini", '```json\n{"status":"error","error":"Bearer sk-1234567890abcdef"}\n```'), {
		name: "core",
		executor_model: "openai/mini",
		status: "error",
		error: "Bearer [redacted]",
	}, "fenced error json");
});
