/**
 * Executor tool resolution for pi-devin-fusion.
 *
 * Tool definitions are built from a hard-coded allowlist of pi's own tool
 * factories — never from the live extension registry — so the `sidekick` tool
 * can never leak into the executor's tool list (recursion guarantee).
 */

import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import { DEFAULT_MAX_TOOL_CALLS, MAX_TOOL_CALLS, MIN_TOOL_CALLS } from "./config.ts";
import type { ToolSelection } from "./types.ts";

/**
 * Subset of ToolDefinition used by the executor tool loop in llm.ts.
 * Intentionally structural and minimal — the factory return types are
 * heterogeneous TypeBox schemas we don't need to unify at the type level.
 */
export interface ExecutorToolDef {
	name: string;
	description: string;
	parameters: TSchema;
	execute(
		toolCallId: string,
		args: Record<string, unknown>,
		signal: AbortSignal | undefined,
		extra: unknown,
		ctx: unknown,
	): Promise<{ content: ToolResultMessage["content"]; isError: boolean }>;
}

export const READONLY_TOOL_NAMES = ["read", "grep", "find", "ls"] as const;
export const MUTATING_TOOL_NAMES = ["bash", "edit", "write"] as const;
export const ALL_TOOL_NAMES = [...READONLY_TOOL_NAMES, ...MUTATING_TOOL_NAMES] as const;

type ToolName = (typeof ALL_TOOL_NAMES)[number];

// Library boundary: the factory return types carry `any` TState from the
// coding-agent. We narrow to our structural ExecutorToolDef with `unknown`
// to keep source-level `any` out of this module.
function build(name: ToolName, cwd: string): ExecutorToolDef {
	switch (name) {
		case "read": return createReadToolDefinition(cwd) as unknown as ExecutorToolDef;
		case "grep": return createGrepToolDefinition(cwd) as unknown as ExecutorToolDef;
		case "find": return createFindToolDefinition(cwd) as unknown as ExecutorToolDef;
		case "ls": return createLsToolDefinition(cwd) as unknown as ExecutorToolDef;
		case "bash": return createBashToolDefinition(cwd) as unknown as ExecutorToolDef;
		case "edit": return createEditToolDefinition(cwd) as unknown as ExecutorToolDef;
		case "write": return createWriteToolDefinition(cwd) as unknown as ExecutorToolDef;
	}
}

function isToolName(value: string): value is ToolName {
	return (ALL_TOOL_NAMES as readonly string[]).includes(value);
}

/** Normalize a selection (mode or explicit list) into an ordered, deduped tool-name list. */
export function selectionToNames(selection: ToolSelection | undefined): ToolName[] {
	if (!selection || selection === "none") return [];
	if (selection === "readonly") return [...READONLY_TOOL_NAMES];
	if (selection === "all") return [...ALL_TOOL_NAMES];
	if (Array.isArray(selection)) {
		const seen = new Set<string>();
		const out: ToolName[] = [];
		for (const raw of selection) {
			const name = String(raw).toLowerCase();
			if (isToolName(name) && !seen.has(name)) {
				seen.add(name);
				out.push(name);
			}
		}
		return out;
	}
	return [];
}

/** Build executable tool definitions for the resolved selection. */
export function resolveToolDefs(selection: ToolSelection | undefined, cwd: string): ExecutorToolDef[] {
	return selectionToNames(selection).map((n) => build(n, cwd));
}

/** True when the selection includes a tool that can mutate the filesystem or run commands. */
export function isMutatingSelection(selection: ToolSelection | undefined): boolean {
	return selectionToNames(selection).some((n) => (MUTATING_TOOL_NAMES as readonly string[]).includes(n));
}

/** A short, stable label for a selection (for footers, status, diagnostics). */
export function selectionLabel(selection: ToolSelection | undefined): string {
	if (!selection || selection === "none") return "none";
	if (selection === "readonly" || selection === "all") return selection;
	const names = selectionToNames(selection);
	return names.length ? names.join(",") : "none";
}

/** Clamp a max-tool-calls value into the supported range, defaulting when absent. */
export function clampMaxToolCalls(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_TOOL_CALLS;
	return Math.max(MIN_TOOL_CALLS, Math.min(MAX_TOOL_CALLS, Math.floor(value)));
}
