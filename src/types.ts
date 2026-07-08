/**
 * Shared types for pi-devin-fusion.
 */

import type { Api, Model } from "@earendil-works/pi-ai";

export type { Api, Model };

/** Named executor tool bundles, or an explicit list of tool names. */
export type ToolMode = "none" | "readonly" | "all";
export type ToolSelection = ToolMode | string[];
export type FooterDisplay = "off" | "compact" | "full";
export type DevinMode = "available" | "forced" | "off";

export interface DevinConfig {
	/** Explicit executor model identifier, e.g. "anthropic/claude-haiku-4-5". */
	executor?: string;
	/** Max tokens for the executor's final answer. */
	maxExecutorOutputTokens?: number;
	/** Sampling temperature for the executor. */
	temperature?: number;
	/** Executor tool access: "none", "readonly" (read/grep/find/ls), or "all" (adds bash/edit/write). */
	executorTools?: ToolSelection;
	/** Max tool-call steps the executor may take (1–100). */
	maxToolCalls?: number;
	/** Non-interactive consent for mutating executor tools (bash/edit/write). */
	executorToolsConsent?: boolean;
	/** Footer verbosity: "full" (default), "compact", or "off". */
	footerDisplay?: FooterDisplay;
}

/** A DevinConfig after `applyDefaults`: the numeric/tool knobs are guaranteed present. */
export type ResolvedDevinConfig = DevinConfig & {
	maxExecutorOutputTokens: number;
	temperature: number;
	executorTools: ToolSelection;
	maxToolCalls: number;
	footerDisplay: FooterDisplay;
};

/** Options accepted from a session/extension override (planner cannot override tools). */
export interface SidekickOptions {
	executor?: string;
	executorTools?: ToolSelection;
	maxToolCalls?: number;
	footerDisplay?: FooterDisplay;
	context_text?: string;
}

export interface SidekickResult {
	content: Array<{ type: "text"; text: string }>;
	details: SidekickDetails;
}

export interface SidekickDetails {
	status: "ok" | "error";
	executor_model?: string;
	turns?: number;
	tool_calls?: Array<{ name: string; ok: boolean }>;
	capped?: boolean;
	warnings?: string[];
	output?: string;
	error?: string;
	failure_reason?:
		| "mutation_consent_required"
		| "mutation_requires_trusted_project"
		| "no_executor_model"
		| "rate_limited"
		| "insufficient_credits"
		| "unexpected_error";
}
