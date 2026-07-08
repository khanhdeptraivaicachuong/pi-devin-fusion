/**
 * Single-executor (sidekick) pipeline: resolve executor, run its tool loop.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { applyDefaults, loadConfig } from "./config.ts";
import { buildSidekickTaskText } from "./context.ts";
import { SIDEKICK_SYSTEM_PROMPT } from "./prompts.ts";
import { callModelWithTools, getTextContent } from "./llm.ts";
import { resolveExecutorModel } from "./models.ts";
import { sanitizeErrorMessage } from "./sanitize.ts";
import { clampMaxToolCalls, isMutatingSelection, resolveToolDefs } from "./tools.ts";
import type { SidekickOptions, SidekickResult } from "./types.ts";

/** Serialize runs that can mutate shared filesystem/state to avoid clobbered writes. */
let mutationQueue: Promise<unknown> = Promise.resolve();
function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
	const run = mutationQueue.then(fn, fn);
	// Keep the chain alive even if a run rejects.
	mutationQueue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

function classifyError(message: string): SidekickResult["details"]["failure_reason"] {
	const lower = message.toLowerCase();
	if (lower.includes("credit") || lower.includes("quota") || lower.includes("billing")) {
		return "insufficient_credits";
	}
	if (lower.includes("rate limit") || lower.includes("429")) {
		return "rate_limited";
	}
	return "unexpected_error";
}

export { sanitizeErrorMessage } from "./sanitize.ts";

export async function runSidekick(
	cwd: string,
	registry: ModelRegistry,
	currentModel: Model<Api> | undefined,
	task: string,
	projectTrusted: boolean,
	overrides: SidekickOptions,
	ctx: ExtensionContext,
	consented: boolean,
	signal: AbortSignal | undefined,
	onUpdate?: (partial: { content: Array<{ type: "text"; text: string }>; details: unknown }) => void,
): Promise<SidekickResult> {
	const config = applyDefaults(loadConfig(cwd, projectTrusted), overrides);
	const warnings: string[] = [];

	const executor = resolveExecutorModel(registry, currentModel, config.executor, warnings);
	if (!executor) {
		const details = {
			status: "error" as const,
			error: "no authed text executor model available",
			failure_reason: "no_executor_model" as const,
			warnings,
		};
		return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
	}

	// Fail-closed: mutating executor tools require a trusted project and explicit consent.
	const mutating = isMutatingSelection(config.executorTools);
	if (mutating && !projectTrusted) {
		const details = {
			status: "error" as const,
			executor_model: undefined,
			error: "executor mutating tools require a trusted project",
			failure_reason: "mutation_requires_trusted_project" as const,
			warnings,
		};
		return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
	}
	const hasConsent = consented || config.executorToolsConsent === true;
	if (mutating && !hasConsent) {
		const details = {
			status: "error" as const,
			executor_model: undefined,
			error: "executor mutating tools require consent",
			failure_reason: "mutation_consent_required" as const,
			warnings,
		};
		return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
	}

	const taskText = buildSidekickTaskText(task, overrides.context_text);
	const toolDefs = resolveToolDefs(config.executorTools, cwd);
	const executorModel = modelDisplayLocal(executor);
	const label = `Sidekick: ${executorModel} | tools: ${config.executorTools}${mutating ? " (serialized)" : ""}`;

	onUpdate?.({ content: [{ type: "text", text: label }], details: { phase: "executing" } });

	const runLoop = () =>
		callModelWithTools(
			registry,
			executor,
			SIDEKICK_SYSTEM_PROMPT,
			taskText,
			config.maxExecutorOutputTokens,
			config.temperature,
			signal,
			toolDefs,
			clampMaxToolCalls(config.maxToolCalls),
			ctx,
		);

	try {
		const result = mutating ? await runSerialized(runLoop) : await runLoop();
		const output = getTextContent(result.message);
		const details = {
			status: "ok" as const,
			executor_model: executorModel,
			output,
			turns: result.turns,
			tool_calls: result.toolCalls,
			capped: result.cappedOut,
			warnings,
		};
		return { content: [{ type: "text", text: output }], details };
	} catch (err) {
		const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
		const details = {
			status: "error" as const,
			executor_model: executorModel,
			error: message,
			failure_reason: classifyError(message),
			warnings,
		};
		return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
	}
}

function modelDisplayLocal(model: Model<Api>): string {
	return `${model.provider}/${model.id}`;
}
