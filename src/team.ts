/**
 * Team sidekick orchestration helpers.
 */

import { sanitizeErrorMessage } from "./sanitize.ts";
import type { Api, Model, TeamPart, TeamWorkerResult } from "./types.ts";
import { extractJson, mapWithConcurrencyLimit } from "./utils.ts";

export type TeamRunStatus = "ok" | "partial" | "error";

export interface NormalizedTeamPart {
	name: string;
	prompt: string;
}

export interface AssignedTeamPart {
	part: NormalizedTeamPart;
	executor: Model<Api>;
}

export interface TeamSidekickDetails {
	status: TeamRunStatus;
	team: TeamWorkerResult[];
	synthesis?: string;
	warnings?: string[];
}

export function normalizeTeamParts(prompt: string, parts: TeamPart[] | undefined, teamSize: number): NormalizedTeamPart[] {
	const wanted = Math.max(1, Math.min(6, Math.floor(teamSize || 3)));
	if (parts?.length) {
		return parts
			.filter((p) => p.prompt.trim())
			.slice(0, wanted)
			.map((p, i) => ({ name: p.name?.trim() || `worker-${i + 1}`, prompt: p.prompt.trim() }));
	}

	const lower = prompt.toLowerCase();
	const out: NormalizedTeamPart[] = [];
	// ponytail: rule-based split only; upgrade path is LLM decomposition once team mode proves useful.
	if (/(config|runtime|executor|llm|model|tool)/.test(lower)) {
		out.push({ name: "core", prompt: "Focus on config/runtime/executor/model/tool behavior. Read relevant core files and report risks, findings, and next steps." });
	}
	if (/(ui|frontend|setup|footer|command|status)/.test(lower)) {
		out.push({ name: "ui", prompt: "Focus on UI/setup/commands/footer/session state behavior. Report UX issues, edge cases, and next steps." });
	}
	if (/(test|coverage|verify|ci|check)/.test(lower)) {
		out.push({ name: "tests", prompt: "Focus on tests, coverage, verification gaps, and minimal test additions. Report concrete missing coverage and next steps." });
	}
	if (out.length > 0) return out.slice(0, wanted);

	return [
		{ name: "architecture", prompt: "Analyze architecture/runtime design. Identify seams, coupling, and simple improvement opportunities." },
		{ name: "risk", prompt: "Analyze edge cases, safety, security, and failure modes. Identify risks and mitigations." },
		{ name: "tests", prompt: "Analyze tests and docs. Identify missing coverage, verification gaps, and documentation needs." },
	].slice(0, wanted);
}

export function assignExecutorsToParts(parts: NormalizedTeamPart[], executors: Model<Api>[]): AssignedTeamPart[] {
	if (executors.length === 0) return [];
	return parts.map((part, i) => ({ part, executor: executors[i % executors.length] }));
}

export function teamStatus(results: Array<{ status: TeamWorkerResult["status"]; name?: string }>): TeamRunStatus {
	const ok = results.filter((r) => r.status === "ok").length;
	if (ok === results.length && results.length > 0) return "ok";
	if (ok > 0) return "partial";
	return "error";
}

export function buildWorkerPrompt(sharedObjective: string, part: NormalizedTeamPart, contextText: string | undefined): string {
	return [
		`You are Worker ${part.name} in a team-agent run.`,
		"",
		"Shared objective:",
		sharedObjective.trim(),
		...(contextText?.trim() ? ["", "Shared context:", contextText.trim()] : []),
		"",
		"Your assigned scope:",
		part.prompt.trim(),
		"",
		"Rules:",
		"- Stay in your scope.",
		"- Prefer read-only analysis in V1.",
		"- Return concise findings.",
		"- Include files/symbols read.",
		"- Do not make decisions outside your scope.",
		"- If your result affects another worker, add handoff_notes.",
		"",
		"Output JSON:",
		'{ "status": "ok", "summary": "...", "findings": ["..."], "files": ["..."], "handoff_notes": ["..."], "recommended_next_steps": ["..."] }',
	].join("\n");
}

export async function runTeamWorkers(
	assigned: AssignedTeamPart[],
	maxConcurrency: number,
	runner: (assigned: AssignedTeamPart, index: number) => Promise<TeamWorkerResult>,
): Promise<TeamSidekickDetails> {
	const team = await mapWithConcurrencyLimit(assigned, Math.max(1, Math.min(4, Math.floor(maxConcurrency || 1))), async (item, index) => {
		try {
			return await runner(item, index);
		} catch (err) {
			return {
				name: item.part.name,
				executor_model: `${item.executor.provider}/${item.executor.id}`,
				status: "error" as const,
				error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
			};
		}
	});
	return { status: teamStatus(team), team };
}

export function parseWorkerResult(name: string, executorModel: string, text: string): TeamWorkerResult {
	const extracted = extractJson(text);
	if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
		const parsed = extracted as Partial<TeamWorkerResult>;
		const status = parsed.status === "blocked" || parsed.status === "error" ? parsed.status : "ok";
		return {
			name,
			executor_model: executorModel,
			status,
			...(typeof parsed.summary === "string" ? { summary: parsed.summary } : {}),
			...(Array.isArray(parsed.findings) ? { findings: parsed.findings.filter((v): v is string => typeof v === "string") } : {}),
			...(Array.isArray(parsed.files) ? { files: parsed.files.filter((v): v is string => typeof v === "string") } : {}),
			...(Array.isArray(parsed.handoff_notes) ? { handoff_notes: parsed.handoff_notes.filter((v): v is string => typeof v === "string") } : {}),
			...(Array.isArray(parsed.recommended_next_steps) ? { recommended_next_steps: parsed.recommended_next_steps.filter((v): v is string => typeof v === "string") } : {}),
			...(typeof parsed.error === "string" ? { error: sanitizeErrorMessage(parsed.error) } : {}),
		};
	}
	return { name, executor_model: executorModel, status: "ok", summary: text.trim() };
}

export function formatTeamResult(details: TeamSidekickDetails): string {
	const lines = ["# Team sidekick result", "", `Status: ${details.status}`, ""];
	if (details.synthesis) lines.push("## Synthesis", details.synthesis, "");
	for (const worker of details.team) {
		lines.push(`## Worker: ${worker.name}${worker.executor_model ? ` — ${worker.executor_model}` : ""}`);
		lines.push(`Status: ${worker.status}`);
		if (worker.summary) lines.push("", worker.summary);
		if (worker.findings?.length) lines.push("", "Findings:", ...worker.findings.map((f) => `- ${f}`));
		if (worker.files?.length) lines.push("", `Files: ${worker.files.join(", ")}`);
		if (worker.handoff_notes?.length) lines.push("", "Handoff notes:", ...worker.handoff_notes.map((n) => `- ${n}`));
		if (worker.recommended_next_steps?.length) lines.push("", "Next steps:", ...worker.recommended_next_steps.map((n) => `- ${n}`));
		if (worker.error) lines.push("", `Error: ${worker.error}`);
		lines.push("");
	}
	if (details.warnings?.length) lines.push("## Warnings", ...details.warnings.map((w) => `- ${w}`), "");
	return lines.join("\n").trim();
}
