/**
 * Devin configuration loading and validation.
 */

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DevinConfig, ResolvedDevinConfig } from "./types.ts";

export type { DevinConfig, ResolvedDevinConfig };

export const DEFAULT_MAX_EXECUTOR_OUTPUT_TOKENS = 4096;
export const MAX_EXECUTOR_OUTPUT_TOKENS = 65_536;
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_EXECUTOR_TOOLS: "all" = "all";
export const DEFAULT_MAX_TOOL_CALLS = 16;
export const MIN_TOOL_CALLS = 1;
export const MAX_TOOL_CALLS = 100;
/** Per tool result, before it re-enters the loop transcript (keeps executor context bounded). */
export const TOOL_OUTPUT_MAX_BYTES = 12_000;

const TOOL_NAMES = ["read", "grep", "find", "ls", "bash", "edit", "write"] as const;
const TOOL_MODES = ["none", "readonly", "all"] as const;
const FOOTER_MODES = ["off", "compact", "full"] as const;
const INVALID_TOOL_SELECTION = Symbol("invalid tool selection");

export function loadConfig(cwd: string, projectTrusted: boolean): DevinConfig {
	const paths: string[] = [];
	if (projectTrusted) {
		paths.push(join(cwd, ".pi", "devin.json"));
	}
	paths.push(join(getAgentDir(), "devin.json"));

	for (const path of paths) {
		if (!existsSync(path)) continue;
		try {
			return normalizeConfig(JSON.parse(readFileSync(path, "utf8")));
		} catch (err) {
			console.error(`[pi-devin-fusion] failed to parse ${path}:`, err);
		}
	}
	return {};
}

function normalizeConfig(raw: unknown): DevinConfig {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const input = raw as Record<string, unknown>;
	const out: DevinConfig = {};

	if (typeof input.executor === "string") out.executor = input.executor;
	const maxTokens = positiveInteger(input.maxExecutorOutputTokens);
	if (maxTokens !== undefined) out.maxExecutorOutputTokens = Math.min(maxTokens, MAX_EXECUTOR_OUTPUT_TOKENS);
	const temperature = finiteNumber(input.temperature);
	if (temperature !== undefined && temperature >= 0 && temperature <= 2) out.temperature = temperature;
	const tools = normalizeToolSelection(input.executorTools);
	if (tools === INVALID_TOOL_SELECTION) out.executorTools = "none";
	else if (tools !== undefined) out.executorTools = tools;
	const maxToolCalls = finiteNumber(input.maxToolCalls);
	if (maxToolCalls !== undefined) out.maxToolCalls = clampNumber(Math.floor(maxToolCalls), MIN_TOOL_CALLS, MAX_TOOL_CALLS);
	if (typeof input.executorToolsConsent === "boolean") out.executorToolsConsent = input.executorToolsConsent;
	if (isOneOf(input.footerDisplay, FOOTER_MODES)) out.footerDisplay = input.footerDisplay;

	return out;
}

function normalizeToolSelection(value: unknown): DevinConfig["executorTools"] | typeof INVALID_TOOL_SELECTION | undefined {
	if (value === undefined) return undefined;
	if (isOneOf(value, TOOL_MODES)) return value;
	if (!Array.isArray(value)) return INVALID_TOOL_SELECTION;
	const seen = new Set<string>();
	const names: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") continue;
		const name = item.toLowerCase();
		if (isOneOf(name, TOOL_NAMES) && !seen.has(name)) {
			seen.add(name);
			names.push(name);
		}
	}
	return names;
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
	return typeof value === "string" && allowed.includes(value);
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
	const n = finiteNumber(value);
	return n !== undefined && n > 0 ? Math.floor(n) : undefined;
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
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
	const normalized = normalizeConfig(merged);
	return {
		...normalized,
		executor: normalized.executor,
		maxExecutorOutputTokens: normalized.maxExecutorOutputTokens ?? DEFAULT_MAX_EXECUTOR_OUTPUT_TOKENS,
		temperature: normalized.temperature ?? DEFAULT_TEMPERATURE,
		executorTools: normalized.executorTools ?? DEFAULT_EXECUTOR_TOOLS,
		maxToolCalls: normalized.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
		footerDisplay: normalized.footerDisplay ?? "full",
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
