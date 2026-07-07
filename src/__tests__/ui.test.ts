/**
 * Tests for pi-devin-fusion setup picker selection helpers (single executor).
 */

import { executorBadge, toggleExecutorSelection } from "../ui.ts";
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
