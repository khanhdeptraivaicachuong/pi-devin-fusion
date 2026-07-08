/**
 * Tests for pi-devin-fusion index module helpers.
 * Uses the exported pure helpers (no extension registration).
 */

import { test, eq } from "./_harness.ts";
import { buildInitialState, devinArgumentCompletions, executorStatusLabel, normalizeFooterDisplay } from "../index.ts";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// --- normalizeFooterDisplay ---

test("normalizeFooterDisplay accepts known footer modes", () => {
	eq(normalizeFooterDisplay("full"), "full", "full is accepted");
	eq(normalizeFooterDisplay("compact"), "compact", "compact is accepted");
	eq(normalizeFooterDisplay("off"), "off", "off is accepted");
});

test("normalizeFooterDisplay falls back to full", () => {
	eq(normalizeFooterDisplay(undefined), "full", "missing footer display falls back");
	eq(normalizeFooterDisplay("bad"), "full", "invalid footer display falls back");
});

// --- buildInitialState ---

function fakeContext(branch: unknown[] = []): ExtensionContext {
	return {
		sessionManager: {
			getBranch: () => branch,
		},
	} as unknown as ExtensionContext;
}

test("buildInitialState returns defaults when no session or config", () => {
	const state = buildInitialState(fakeContext(), undefined);
	eq(state.executorId, undefined, "no executor");
	eq(state.executorAuto, true, "auto when no executor");
	eq(state.mode, "available", "default mode");
	eq(state.executorTools, "all", "default tools");
	eq(state.maxToolCalls, undefined, "no max calls override");
	eq(state.footerDisplay, "full", "default footer");
});

test("buildInitialState uses session executor when available", () => {
	const branch = [{
		type: "custom",
		customType: "devin-state",
		data: {
			executorId: "openai/gpt-4.1-mini",
			mode: "forced",
			footerDisplay: "compact",
		},
	}];
	const state = buildInitialState(fakeContext(branch), undefined, undefined, undefined, "full");
	eq(state.executorId, "openai/gpt-4.1-mini", "session executor");
	eq(state.mode, "forced", "session mode");
	eq(state.footerDisplay, "compact", "session footer wins over config");
});

test("buildInitialState falls back to config when session has no executor", () => {
	const state = buildInitialState(fakeContext(), undefined, "readonly", 8, "compact");
	eq(state.executorId, undefined, "no executor from session");
	eq(state.executorTools, "readonly", "config tools fill in");
	eq(state.maxToolCalls, 8, "config max calls fill in");
	eq(state.footerDisplay, "compact", "config footer fill in");
});

test("buildInitialState preserves explicit config tool lists", () => {
	const state = buildInitialState(fakeContext(), undefined, ["read", "bash"], 8, "compact");
	eq(state.executorTools, ["read", "bash"], "custom tools preserved");
});

test("devinArgumentCompletions includes every accepted mode alias", () => {
	const completions = devinArgumentCompletions("")?.map((i) => i.value).sort();
	eq(completions, ["auto", "available", "disable", "disabled", "force", "forced", "off", "on"].sort(), "aliases");
});

test("executorStatusLabel shows auto resolution when available", () => {
	eq(executorStatusLabel(undefined, "openai/gpt-4.1-mini"), "auto -> openai/gpt-4.1-mini", "auto resolved");
	eq(executorStatusLabel("anthropic/claude", "openai/gpt-4.1-mini"), "anthropic/claude", "configured label");
});
