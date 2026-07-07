/**
 * Devin configuration loading and validation.
 */

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DevinConfig, ResolvedDevinConfig } from "./types.ts";

export type { DevinConfig, ResolvedDevinConfig };

export const DEFAULT_MAX_EXECUTOR_OUTPUT_TOKENS = 4096;
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_EXECUTOR_TOOLS: "all" = "all";
export const DEFAULT_MAX_TOOL_CALLS = 16;
export const MIN_TOOL_CALLS = 1;
export const MAX_TOOL_CALLS = 100;
/** Per tool result, before it re-enters the loop transcript (keeps executor context bounded). */
export const TOOL_OUTPUT_MAX_BYTES = 12_000;

export function loadConfig(cwd: string, projectTrusted: boolean): DevinConfig {
	const paths: string[] = [];
	if (projectTrusted) {
		paths.push(join(cwd, ".pi", "devin.json"));
	}
	paths.push(join(getAgentDir(), "devin.json"));

	for (const path of paths) {
		if (!existsSync(path)) continue;
		try {
			return JSON.parse(readFileSync(path, "utf8")) as DevinConfig;
		} catch (err) {
			console.error(`[pi-devin-fusion] failed to parse ${path}:`, err);
		}
	}
	return {};
}

export function applyDefaults(
	config: DevinConfig,
	overrides: Pick<DevinConfig, "executor" | "executorTools" | "maxToolCalls" | "footerDisplay"> = {},
): ResolvedDevinConfig {
	const merged: DevinConfig = { ...config };
	if (overrides.executor !== undefined) merged.executor = overrides.executor;
	if (overrides.executorTools !== undefined) merged.executorTools = overrides.executorTools;
	if (overrides.maxToolCalls !== undefined) merged.maxToolCalls = overrides.maxToolCalls;
	if (overrides.footerDisplay !== undefined) merged.footerDisplay = overrides.footerDisplay;

	// Single source of truth for defaults: callers can read these knobs directly.
	// The invoking model/tool can only choose context; executor, tools, max calls,
	// output tokens, and temperature are user config/session setup or defaults.
	return {
		...merged,
		executor: merged.executor,
		maxExecutorOutputTokens: merged.maxExecutorOutputTokens ?? DEFAULT_MAX_EXECUTOR_OUTPUT_TOKENS,
		temperature: merged.temperature ?? DEFAULT_TEMPERATURE,
		executorTools: merged.executorTools ?? DEFAULT_EXECUTOR_TOOLS,
		maxToolCalls: merged.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
		footerDisplay: merged.footerDisplay ?? "full",
	};
}

export function generateConfigExample(executor?: string): DevinConfig {
	return {
		...(executor ? { executor } : {}),
		maxExecutorOutputTokens: DEFAULT_MAX_EXECUTOR_OUTPUT_TOKENS,
		temperature: DEFAULT_TEMPERATURE,
		executorTools: DEFAULT_EXECUTOR_TOOLS,
		maxToolCalls: DEFAULT_MAX_TOOL_CALLS,
		executorToolsConsent: false,
		footerDisplay: "full",
	};
}
