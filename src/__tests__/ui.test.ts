/**
 * Tests for pi-devin-fusion setup picker selection helpers (single executor).
 */

import { cycleMode, executorBadge, setupToolSelectionLabel, teamBadge, teamExecutorLabel, toggleExecutorSelection, toggleTeamExecutorSelection } from "../ui.ts";
import { eq, test } from "./_harness.ts";

test("toggleExecutorSelection toggles single executor and clears on same model", () => {
	eq(toggleExecutorSelection(undefined, "a"), "a", "set executor");
	eq(toggleExecutorSelection("a", "a"), undefined, "clear when same");
	eq(toggleExecutorSelection("a", "b"), "b", "replace executor");
});

test("toggleExecutorSelection returns a new value (immutable input)", () => {
	const current = "a";
	const next = toggleExecutorSelection(current, "b");
	eq(current, "a", "input unchanged");
	eq(next, "b", "output is new");
});

test("executorBadge shows badge only when isExecutor is true", () => {
	eq(executorBadge(false), "", "not executor");
	eq(executorBadge(true), "◆ executor", "executor");
});

test("cycleMode rotates setup mode", () => {
	eq(cycleMode("available", 1), "forced", "available -> forced");
	eq(cycleMode("forced", 1), "off", "forced -> off");
	eq(cycleMode("off", 1), "available", "off -> available");
	eq(cycleMode("available", -1), "off", "available <- off");
});

test("setupToolSelectionLabel preserves custom tool arrays", () => {
	eq(setupToolSelectionLabel("readonly"), "readonly", "mode label");
	eq(setupToolSelectionLabel(["read", "bash"]), "custom (read,bash)", "custom label");
});

test("toggleTeamExecutorSelection adds and removes model ids immutably", () => {
	eq(toggleTeamExecutorSelection([], "a"), ["a"], "add first");
	eq(toggleTeamExecutorSelection(["a"], "a"), [], "remove existing");
	eq(toggleTeamExecutorSelection(["a"], "b"), ["a", "b"], "add second");
	const original = ["a", "b"];
	toggleTeamExecutorSelection(original, "c");
	eq(original, ["a", "b"], "input unchanged");
});

test("toggleTeamExecutorSelection caps at six workers", () => {
	const six = ["a", "b", "c", "d", "e", "f"];
	eq(toggleTeamExecutorSelection(six, "g"), six, "capped at six");
});

test("teamBadge shows numbered badge for team members", () => {
	eq(teamBadge(0), "", "not in team");
	eq(teamBadge(1), "◆ team #1", "first team member");
	eq(teamBadge(3), "◆ team #3", "third team member");
});

test("teamExecutorLabel summarizes team executor list", () => {
	eq(teamExecutorLabel([]), "none", "empty team");
	eq(teamExecutorLabel(["openai/mini"]), "openai/mini", "single");
	eq(teamExecutorLabel(["openai/mini", "anthropic/haiku"]), "openai/mini +1", "multi with count");
});
