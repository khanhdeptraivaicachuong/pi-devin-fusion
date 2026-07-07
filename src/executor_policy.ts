/**
 * Pure executor tool-selection policy, extracted so tests can assert the
 * fail-closed behavior without invoking models or tools.
 */

import { applyDefaults } from "./config.ts";
import { isMutatingSelection } from "./tools.ts";
import type { SidekickOptions } from "./types.ts";

export interface ExecutorPolicy {
	executor?: string;
	toolSelectionConsentRequired: boolean;
}

/**
 * Decide whether running the executor needs mutating-tool consent.
 * Returns the resolved executor id and whether mutation consent is required.
 */
export function resolveExecutorPolicy(
	cwd: string,
	projectTrusted: boolean,
	overrides: SidekickOptions,
	consented: boolean,
): ExecutorPolicy {
	const config = applyDefaults(loadConfigLocal(cwd, projectTrusted), overrides);
	const mutating = isMutatingSelection(config.executorTools);
	const hasConsent = consented || config.executorToolsConsent === true;
	return {
		executor: config.executor,
		toolSelectionConsentRequired: mutating && !hasConsent,
	};
}

// Local import avoids a cycle with config's own loader name.
import { loadConfig } from "./config.ts";
function loadConfigLocal(cwd: string, projectTrusted: boolean) {
	return loadConfig(cwd, projectTrusted);
}
