/**
 * Model resolution and executor selection for pi-devin-fusion.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

export function modelDisplay(model: Model<Api>): string {
	return `${model.provider}/${model.id}`;
}

export function resolveModelIdentifier(registry: ModelRegistry, identifier: string): Model<Api> | undefined {
	const slash = identifier.indexOf("/");
	if (slash > 0) {
		const provider = identifier.slice(0, slash);
		const id = identifier.slice(slash + 1);
		return registry.getAll().find((m) => m.provider === provider && m.id === id);
	}
	// No provider prefix: search by exact id across all models.
	return registry.getAll().find((m) => m.id === identifier);
}

/** Choose the executor model: configured first, else first non-current text authed model. */
export function resolveExecutorModel(
	registry: ModelRegistry,
	currentModel: Model<Api> | undefined,
	configuredExecutor: string | undefined,
	warnings: string[],
): Model<Api> | undefined {
	if (configuredExecutor) {
		const resolved = resolveModelIdentifier(registry, configuredExecutor);
		if (resolved && resolved.input.includes("text") && registry.hasConfiguredAuth(resolved)) {
			return resolved;
		}
		warnings.push(
			resolved && registry.hasConfiguredAuth(resolved)
				? `Configured executor ${configuredExecutor} is not a text-capable model; falling back to auto-selection.`
				: `Configured executor ${configuredExecutor} is not authed; falling back to auto-selection.`,
		);
	}

	const available = registry.getAvailable().filter((m) => m.input.includes("text"));
	if (available.length === 0) return undefined;

	const nonCurrent = currentModel
		? available.filter((m) => modelDisplay(m) !== modelDisplay(currentModel))
		: available;

	if (nonCurrent.length > 0) return nonCurrent[0];

	warnings.push("Executor fell back to the current planner model; cost savings are not guaranteed.");
	return available[0];
}

export function resolveTeamExecutors(
	registry: ModelRegistry,
	currentModel: Model<Api> | undefined,
	configuredTeamExecutors: string[] | undefined,
	fallbackExecutor: string | undefined,
	teamSize: number,
	warnings: string[],
): Model<Api>[] {
	const configured = configuredTeamExecutors?.filter(Boolean) ?? [];
	if (configured.length > 0) {
		const seen = new Set<string>();
		const out: Model<Api>[] = [];
		for (const identifier of configured) {
			const resolved = resolveModelIdentifier(registry, identifier);
			if (!resolved) {
				warnings.push(`Configured team executor ${identifier} was not found; skipping.`);
				continue;
			}
			if (!resolved.input.includes("text")) {
				warnings.push(`Configured team executor ${identifier} is not text-capable; skipping.`);
				continue;
			}
			if (!registry.hasConfiguredAuth(resolved)) {
				warnings.push(`Configured team executor ${identifier} is not authed; skipping.`);
				continue;
			}
			const key = modelDisplay(resolved);
			if (!seen.has(key)) {
				seen.add(key);
				out.push(resolved);
			}
		}
		if (out.length > 0) return out.slice(0, Math.max(1, teamSize));
	}

	const fallback = resolveExecutorModel(registry, currentModel, fallbackExecutor, warnings);
	return fallback ? [fallback] : [];
}
