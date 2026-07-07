/**
 * Tests for pi-devin-fusion executor model resolution.
 */

import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { resolveExecutorModel } from "../models.ts";
import { eq, fakeModel, test } from "./_harness.ts";

function fakeRegistry(available: string[], allAuthed: string[]): ModelRegistry {
	const availableModels = available.map((id) => fakeModel(id.split("/")[0], id.split("/")[1]));
	const authedModels = allAuthed.map((id) => fakeModel(id.split("/")[0], id.split("/")[1]));
	return {
		getAvailable: () => availableModels,
		getAll: () => authedModels,
		hasConfiguredAuth: (m: { provider: string; id: string }) => authedModels.some((a) => a.provider === m.provider && a.id === m.id),
	} as unknown as ModelRegistry;
}

test("configured authed text executor is selected directly", () => {
	const registry = fakeRegistry(["anthropic/claude-haiku-4-5", "openai/gpt-4.1-mini"], ["anthropic/claude-haiku-4-5", "openai/gpt-4.1-mini"]);
	const warnings: string[] = [];
	const executor = resolveExecutorModel(registry, fakeModel("anthropic", "claude-opus"), "openai/gpt-4.1-mini", warnings);
	eq(executor?.provider, "openai", "provider");
	eq(executor?.id, "gpt-4.1-mini", "id");
});

test("configured but unauthed executor falls back to first available non-current", () => {
	const registry = fakeRegistry(["anthropic/claude-haiku-4-5", "openai/gpt-4.1-mini"], ["anthropic/claude-haiku-4-5"]);
	const warnings: string[] = [];
	const executor = resolveExecutorModel(registry, fakeModel("anthropic", "claude-opus"), "openai/gpt-4.1-mini", warnings);
	eq(executor?.id, "claude-haiku-4-5", "falls back to available non-current");
	if (warnings.length === 0) throw new Error("expected a fallback warning");
});

test("auto-selection picks first non-current text model in registry order", () => {
	const registry = fakeRegistry(["anthropic/claude-haiku-4-5", "openai/gpt-4.1-mini"], ["anthropic/claude-haiku-4-5", "openai/gpt-4.1-mini"]);
	const warnings: string[] = [];
	const executor = resolveExecutorModel(registry, fakeModel("openai", "gpt-4.1-mini"), undefined, warnings);
	eq(executor?.id, "claude-haiku-4-5", "excludes current model");
});

test("only current model available falls back to it with warning", () => {
	const registry = fakeRegistry(["anthropic/claude-opus"], ["anthropic/claude-opus"]);
	const warnings: string[] = [];
	const executor = resolveExecutorModel(registry, fakeModel("anthropic", "claude-opus"), undefined, warnings);
	eq(executor?.id, "claude-opus", "current model used");
	if (warnings.length === 0) throw new Error("expected a fallback warning");
});

test("no text model available returns undefined", () => {
	const registry = fakeRegistry([], []);
	const warnings: string[] = [];
	const executor = resolveExecutorModel(registry, undefined, undefined, warnings);
	if (executor !== undefined) throw new Error("expected undefined executor");
});
