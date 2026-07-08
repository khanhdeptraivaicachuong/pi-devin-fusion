/**
 * Tests for pi-devin-fusion setup picker selection helpers (single executor).
 */

import { cycleMode, executorBadge, setupToolSelectionLabel, toggleExecutorSelection } from "../ui.ts";
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
