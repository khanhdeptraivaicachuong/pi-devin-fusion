/**
 * pi-devin-fusion: Devin sidekick planner/executor split for pi.
 *
 * The active model is the planner/reviewer. It delegates implementation and
 * exploration to a separate, cheaper executor model via the `sidekick` tool.
 * Mutating executor tools require one-time consent and run serialized.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyDefaults, generateConfigExample, loadConfig } from "./config.ts";
import { buildRecentContextFromEntries, type DevinContextMode, normalizeContextTurns } from "./context.ts";
import { runSidekick } from "./executor.ts";
import { resolveExecutorModel } from "./models.ts";
import { modelDisplay } from "./models.ts";
import { clampMaxToolCalls, isMutatingSelection, selectionLabel } from "./tools.ts";
import { selectDevinSetup, type DevinSetupState } from "./ui.ts";
import { PLANNER_FORCE_PROMPT_PREFIX } from "./prompts.ts";
import { SIDEKICK_SYSTEM_PROMPT } from "./prompts.ts";
import type { DevinConfig, DevinMode, FooterDisplay, SidekickOptions, ToolMode } from "./types.ts";

const SidekickParams = Type.Object({
	prompt: Type.String({
		description: "The task or question for the executor. Be specific enough to act on directly.",
	}),
	context_mode: Type.Optional(
		Type.Union([Type.Literal("none"), Type.Literal("recent")], {
			description: "Whether to include recent conversation context for the executor. Default 'none'.",
			default: "none",
		}),
	),
	context_turns: Type.Optional(
		Type.Integer({
			description: "Number of recent user turns to include when context_mode is 'recent' (1–10). Default 4.",
			minimum: 1,
			maximum: 10,
			default: 4,
		}),
	),
});

export function normalizeFooterDisplay(value: unknown): FooterDisplay {
	return value === "off" || value === "compact" || value === "full" ? value : "full";
}

function normalizeMode(state: DevinState | undefined): DevinMode {
	if (state?.mode) return state.mode;
	return "available";
}

function isForcePrompt(text: string): boolean {
	return text.startsWith("Delegate the following task to the sidekick executor before answering.");
}

function forceDevinPrompt(prompt: string): string {
	return [
		PLANNER_FORCE_PROMPT_PREFIX,
		"",
		"Delegate the following task to the sidekick executor before answering.",
		"After the sidekick returns, review the result before your final response.",
		"",
		"User task:",
		prompt.trim(),
	].join("\n");
}

interface DevinState {
	executorId?: string;
	executorAuto?: boolean;
	mode?: DevinMode;
	executorTools?: ToolMode;
	maxToolCalls?: number;
	toolsConsented?: boolean;
	footerDisplay?: FooterDisplay;
}

function persistSessionState(
	pi: ExtensionAPI,
	state: DevinState & { mode: DevinMode },
): void {
	pi.appendEntry("devin-state", {
		executorId: state.executorId,
		executorAuto: state.executorAuto ?? false,
		mode: state.mode,
		executorTools: state.executorTools,
		maxToolCalls: state.maxToolCalls,
		toolsConsented: state.toolsConsented ?? false,
		footerDisplay: state.footerDisplay ?? "full",
		timestamp: Date.now(),
	});
}

function restoreSessionState(ctx: ExtensionContext): DevinState | undefined {
	const entries = ctx.sessionManager.getBranch();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type === "custom" && entry.customType === "devin-state" && "data" in entry && entry.data) {
			const data = entry.data as {
				executorId?: string;
				executorAuto?: boolean;
				mode?: DevinMode;
				executorTools?: ToolMode;
				maxToolCalls?: number;
				toolsConsented?: boolean;
				footerDisplay?: FooterDisplay;
			};
			return {
				executorId: data.executorId,
				executorAuto: data.executorAuto ?? false,
				mode: normalizeMode(data),
				executorTools: data.executorTools,
				maxToolCalls: data.maxToolCalls,
				toolsConsented: data.toolsConsented ?? false,
				footerDisplay: normalizeFooterDisplay(data.footerDisplay),
			};
		}
	}
	return undefined;
}

function devinFooterText(mode: DevinMode, executorId: string | undefined, display: FooterDisplay): string | undefined {
	if (display === "off") return undefined;
	if (!executorId && mode !== "off") return undefined;
	if (mode === "off") return "Devin off";
	const base = `Devin ${mode} • executor ${executorId ?? "unset"}`;
	return display === "compact" ? base.replace(/ • .*/, " • executor set") : base;
}

function sessionConfigOverrides(state: DevinState | undefined): Pick<DevinConfig, "executor" | "executorTools" | "maxToolCalls" | "footerDisplay"> {
	const overrides: Pick<DevinConfig, "executor" | "executorTools" | "maxToolCalls" | "footerDisplay"> = {};
	if (state?.executorAuto) overrides.executor = "";
	else if (state?.executorId !== undefined) overrides.executor = state.executorId;
	if (state?.executorTools !== undefined) overrides.executorTools = state.executorTools;
	if (state?.maxToolCalls !== undefined) overrides.maxToolCalls = state.maxToolCalls;
	if (state?.footerDisplay !== undefined) overrides.footerDisplay = state.footerDisplay;
	return overrides;
}

function updateStatus(pi: ExtensionAPI, ctx: ExtensionContext, mode: DevinMode, executorId?: string, displayOverride?: FooterDisplay): void {
	const display = normalizeFooterDisplay(displayOverride ?? loadConfig(ctx.cwd, ctx.isProjectTrusted()).footerDisplay);
	const text = devinFooterText(mode, executorId, display);
	if (!text) {
		ctx.ui.setFooter(undefined);
		return;
	}
	ctx.ui.setFooter(() => ({
		dispose() {},
		invalidate() {},
		render: () => [text],
	}));
}

export function buildInitialState(
	ctx: ExtensionContext,
	resolvedExecutorId: string | undefined,
	configExecutorTools?: DevinConfig["executorTools"],
	configMaxToolCalls?: DevinConfig["maxToolCalls"],
	configFooterDisplay?: DevinConfig["footerDisplay"],
): DevinSetupState {
	const session = restoreSessionState(ctx);
	const configTools = typeof configExecutorTools === "string" ? configExecutorTools : undefined;
	return {
		executorId: session ? session.executorId : resolvedExecutorId,
		executorAuto: session ? (session.executorAuto ?? false) : !resolvedExecutorId,
		mode: normalizeMode(session),
		executorTools: session?.executorTools ?? configTools ?? "all",
		maxToolCalls: session?.maxToolCalls ?? configMaxToolCalls,
		toolsConsented: session?.toolsConsented ?? false,
		footerDisplay: session?.footerDisplay ?? normalizeFooterDisplay(configFooterDisplay),
	};
}

async function applySetup(pi: ExtensionAPI, ctx: ExtensionContext, state: DevinSetupState): Promise<boolean> {
	const next: DevinState & { mode: DevinMode } = {
		executorId: state.executorId,
		executorAuto: !state.executorId,
		mode: state.mode ?? "available",
		executorTools: state.executorTools,
		maxToolCalls: state.maxToolCalls,
		toolsConsented: state.toolsConsented ?? false,
		footerDisplay: state.footerDisplay,
	};
	const warnings: string[] = [];
	if (isMutatingSelection(next.executorTools) && !next.toolsConsented) {
		const ok = await ctx.ui.confirm(
			"Enable sidekick mutating tools?",
			"The sidekick executor will be able to run bash and edit/write files in this project. Mutating runs are serialized. Continue?",
		);
		if (ok) next.toolsConsented = true;
		else {
			next.executorTools = "readonly";
			next.toolsConsented = false;
			warnings.push("Mutating tools declined; using read-only.");
		}
	}
	if (!isMutatingSelection(next.executorTools)) next.toolsConsented = false;

	persistSessionState(pi, next);
	const config = applyDefaults(loadConfig(ctx.cwd, ctx.isProjectTrusted()), sessionConfigOverrides(next));
	const resolvedExecutor = resolveExecutorModel(ctx.modelRegistry, ctx.model, config.executor, warnings);
	const activeExecutorId = resolvedExecutor ? modelDisplay(resolvedExecutor) : next.executorId;
	updateStatus(pi, ctx, next.mode, activeExecutorId, next.footerDisplay);
	const executorLabel = next.executorAuto ? "auto" : (next.executorId ?? "auto");
	ctx.ui.notify(
		[
			`Executor: ${executorLabel}`,
			`Tools: ${selectionLabel(next.executorTools)} (max ${clampMaxToolCalls(next.maxToolCalls)})`,
			`Footer: ${normalizeFooterDisplay(next.footerDisplay)}`,
			...(warnings.length ? [`Warnings: ${warnings.join("; ")}`] : []),
		].join("\n"),
		"info",
	);
	return true;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "sidekick",
		label: "Sidekick",
		description: [
			"Devin-fusion executor tool. Delegate mechanical implementation, refactors, lint/test fixes,",
			"and read-only exploration to a cheaper executor model. The active model stays the planner/reviewer.",
			"Use it for well-specified, low-judgment work; do not use it for design decisions or ambiguous requirements.",
		].join(" "),
		promptGuidelines: [
			"Use the sidekick tool for mechanical implementation, multi-file find-and-replace, lint/test fixes, and read-only exploration before code changes.",
			"Hand the sidekick a precise spec: exact files, exact changes, constraints to preserve.",
			"Do not use the sidekick tool for hard features with subtle intent, architecture decisions, or ambiguous requirements — keep those for yourself.",
		],
		parameters: SidekickParams,
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const state = restoreSessionState(ctx);
			if (normalizeMode(state) === "off") {
				return {
					content: [{ type: "text", text: JSON.stringify({ status: "error", error: "devin disabled" }, null, 2) }],
					details: { status: "error", error: "devin disabled", failure_reason: "unexpected_error" },
				};
			}

			const overrides = sessionConfigOverrides(state);
			const config = applyDefaults(loadConfig(ctx.cwd, ctx.isProjectTrusted()), overrides);
			const contextMode = (params.context_mode ?? "none") as DevinContextMode;
			const contextText = contextMode === "recent"
				? buildRecentContextFromEntries(ctx.sessionManager.getBranch(), normalizeContextTurns(params.context_turns))
				: undefined;

			// Consent for mutating executor tools.
			const mutatingEnabled = isMutatingSelection(config.executorTools);
			const consented = state?.toolsConsented || config.executorToolsConsent === true;
			let toolsConsented = consented;
			if (mutatingEnabled && !consented) {
				if (ctx.hasUI) {
					const ok = await ctx.ui.confirm(
						"Enable sidekick mutating tools?",
						"The sidekick executor will be able to run bash and edit/write files in this project. Continue?",
					);
					if (!ok) {
						return {
							content: [{
								type: "text",
								text: JSON.stringify({
									status: "error",
									error: "executor mutating tools require consent",
									failure_reason: "mutation_consent_required",
								}, null, 2),
							}],
							details: { status: "error", error: "executor mutating tools require consent", failure_reason: "mutation_consent_required" },
						};
					}
					toolsConsented = true;
					persistSessionState(pi, {
						executorId: state?.executorId ?? (state?.executorAuto ? undefined : config.executor),
						executorAuto: state?.executorAuto ?? false,
						mode: normalizeMode(state),
						executorTools: state?.executorTools ?? (typeof config.executorTools === "string" ? config.executorTools : undefined),
						maxToolCalls: state?.maxToolCalls ?? config.maxToolCalls,
						toolsConsented: true,
						footerDisplay: state?.footerDisplay ?? normalizeFooterDisplay(config.footerDisplay),
					});
				} else if (!config.executorToolsConsent) {
					return {
						content: [{
							type: "text",
							text: JSON.stringify({
								status: "error",
								error: "executor mutating tools require consent",
								failure_reason: "mutation_consent_required",
							}, null, 2),
						}],
						details: { status: "error", error: "executor mutating tools require consent", failure_reason: "mutation_consent_required" },
					};
				}
			}

			const options: SidekickOptions = { ...overrides, context_text: contextText };
			return runSidekick(
				ctx.cwd,
				ctx.modelRegistry,
				ctx.model,
				params.prompt,
				ctx.isProjectTrusted(),
				options,
				ctx,
				toolsConsented,
				signal,
				onUpdate,
			);
		},
	});

	pi.registerCommand("devin", {
		description: "Set Devin mode: /devin on | available | off (no arg toggles available/forced; /devin <prompt> forces once)",
		getArgumentCompletions: (prefix: string) => {
			const items = [
				{ value: "on", label: "on", description: "Force every prompt through the planner/sidekick split" },
				{ value: "available", label: "available", description: "Let the model decide when to delegate" },
				{ value: "off", label: "off", description: "Disable the sidekick tool for this session" },
			];
			const filtered = items.filter((i) => i.value.startsWith(prefix.trim().toLowerCase()));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const prompt = args.trim();
			const state = restoreSessionState(ctx);
			const lower = prompt.toLowerCase();
			const modeCommand: DevinMode | undefined =
				lower === "off" || lower === "disable" || lower === "disabled"
					? "off"
					: lower === "available" || lower === "auto"
						? "available"
						: lower === "forced" || lower === "force" || lower === "on"
							? "forced"
							: undefined;

			// Resolve the active executor for readiness display (session setup, config, or auto).
			const config = applyDefaults(loadConfig(ctx.cwd, ctx.isProjectTrusted()), sessionConfigOverrides(state));
			const warnings: string[] = [];
			const resolvedExecutor = resolveExecutorModel(ctx.modelRegistry, ctx.model, config.executor, warnings);
			const activeExecutorId = resolvedExecutor ? modelDisplay(resolvedExecutor) : config.executor || undefined;

			if (!prompt || modeCommand) {
				if (!activeExecutorId && (modeCommand === "forced" || (!prompt && !modeCommand))) {
					const message = "No devin setup yet. Run /devin-setup, /devin-init, or set an executor in .pi/devin.json.";
					if (ctx.mode === "print") console.log(message);
					else ctx.ui.notify(message, "warning");
					return;
				}
				const currentMode = normalizeMode(state);
				const nextMode = modeCommand ?? (currentMode === "forced" ? "available" : "forced");
				persistSessionState(pi, {
					executorId: state?.executorAuto ? undefined : activeExecutorId,
					executorAuto: state?.executorAuto ?? false,
					mode: nextMode,
					executorTools: state?.executorTools,
					maxToolCalls: state?.maxToolCalls,
					toolsConsented: state?.toolsConsented,
					footerDisplay: state?.footerDisplay,
				});
				updateStatus(pi, ctx, nextMode, activeExecutorId, normalizeFooterDisplay(config.footerDisplay));
				const summary = devinFooterText(nextMode, activeExecutorId, normalizeFooterDisplay(config.footerDisplay)) ?? modeLabel(nextMode);
				if (ctx.mode === "print") console.log(summary);
				else ctx.ui.notify(summary, "info");
				return;
			}

			if (normalizeMode(state) === "off") {
				const message = "Devin is off. Use /devin available or /devin forced before using /devin <prompt>.";
				if (ctx.mode === "print") console.log(message);
				else ctx.ui.notify(message, "warning");
				return;
			}

			if (ctx.mode === "print") {
				console.log(forceDevinPrompt(prompt));
				return;
			}
			pi.sendUserMessage(forceDevinPrompt(prompt));
		},
	});

	pi.registerCommand("devin-setup", {
		description: "Open the Devin sidekick setup UI",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("devin-setup requires interactive mode", "error");
				return;
			}

			const available = ctx.modelRegistry.getAvailable().filter((m) => m.input.includes("text"));
			if (available.length === 0) {
				ctx.ui.notify("No authed text models available.", "error");
				return;
			}

			const state = restoreSessionState(ctx);
			const config = loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const resolvedExecutor = resolveExecutorModel(
				ctx.modelRegistry,
				ctx.model,
				state?.executorAuto ? undefined : (state?.executorId ?? config.executor),
				[],
			);
			const initial = buildInitialState(
				ctx,
				resolvedExecutor ? modelDisplay(resolvedExecutor) : undefined,
				config.executorTools,
				config.maxToolCalls,
				config.footerDisplay,
			);

			const next = await selectDevinSetup(ctx, available, initial);
			if (!next) {
				ctx.ui.notify("Devin setup cancelled", "info");
				return;
			}

			if (!(await applySetup(pi, ctx, next))) return;
		},
	});

	pi.registerCommand("devin-init", {
		description: "Create a project-local .pi/devin.json template",
		handler: async (_args, ctx) => {
			if (!ctx.isProjectTrusted()) {
				ctx.ui.notify("Project is not trusted; cannot write project-local config", "error");
				return;
			}
			const configDir = join(ctx.cwd, ".pi");
			const configPath = join(configDir, "devin.json");
			let example = generateConfigExample();
			try {
				const executor = resolveExecutorModel(ctx.modelRegistry, ctx.model, loadConfig(ctx.cwd, ctx.isProjectTrusted()).executor, []);
				if (executor) example = generateConfigExample(modelDisplay(executor));
			} catch {
				// no authed text model; write template without executor
			}
			if (existsSync(configPath)) {
				const overwrite = await ctx.ui.confirm(".pi/devin.json already exists", `Overwrite ${configPath} with the template?`);
				if (!overwrite) {
					ctx.ui.notify("devin-init cancelled", "info");
					return;
				}
			}
			mkdirSync(configDir, { recursive: true });
			writeFileSync(configPath, JSON.stringify(example, null, 2) + "\n", "utf8");
			ctx.ui.notify(`Wrote ${configPath}`, "info");
		},
	});

	pi.registerCommand("devin-status", {
		description: "Show the current Devin mode and executor",
		handler: async (_args, ctx) => {
			const state = restoreSessionState(ctx);
			const config = loadConfig(ctx.cwd, ctx.isProjectTrusted());
			const mode = normalizeMode(state);
			const executorId = state?.executorId ?? config.executor ?? "auto";
			const tools = typeof state?.executorTools === "string" ? state.executorTools : config.executorTools ?? "all";
			const footer = normalizeFooterDisplay(state?.footerDisplay ?? config.footerDisplay);
			const maxCalls = clampMaxToolCalls(state?.maxToolCalls ?? config.maxToolCalls);
			const lines = [
				`Mode: ${mode}`,
				`Executor: ${executorId}`,
				`Tools: ${selectionLabel(tools)} (max ${maxCalls})`,
				`Consent: ${state?.toolsConsented || config.executorToolsConsent ? "granted" : "not granted"}`,
				`Footer: ${footer}`,
			];
			const text = lines.join("\n");
			if (ctx.mode === "print") console.log(text);
			else ctx.ui.notify(text, "info");
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "sidekick") return;
		const state = restoreSessionState(ctx);
		if (normalizeMode(state) === "off") {
			return { block: true, reason: "Devin is off for this session. Use /devin available or /devin forced to re-enable it." };
		}
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };
		if (event.text.trim().startsWith("/")) return { action: "continue" };
		if (isForcePrompt(event.text.trim())) return { action: "continue" };
		const state = restoreSessionState(ctx);
		if (normalizeMode(state) !== "forced") return { action: "continue" };
		return { action: "transform", text: forceDevinPrompt(event.text), images: event.images };
	});

	// Refresh the footer whenever the session/model changes.
	const refreshFooter = (ctx: ExtensionContext) => {
		const state = restoreSessionState(ctx);
		const mode = normalizeMode(state);
		if (mode === "off" || state?.executorId) {
			updateStatus(pi, ctx, mode, state?.executorId, state?.footerDisplay);
		}
	};
	pi.on("session_start", async (_event, ctx) => refreshFooter(ctx));
	pi.on("session_tree", async (_event, ctx) => refreshFooter(ctx));
	pi.on("model_select", async (_event, ctx) => refreshFooter(ctx));
}

function modeLabel(mode: DevinMode): string {
	if (mode === "forced") return "Devin forced";
	if (mode === "off") return "Devin off";
	return "Devin available";
}
