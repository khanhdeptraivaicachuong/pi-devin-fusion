/**
 * Tests for pi-devin-fusion executor tool resolution helpers.
 */

import {
	clampMaxToolCalls,
	isMutatingSelection,
	resolveToolDefs,
	selectionLabel,
	selectionToNames,
} from "../tools.ts";
import { eq, test } from "./_harness.ts";

test("selectionToNames resolves named bundles", () => {
	eq(selectionToNames("none"), [], "none");
	eq(selectionToNames(undefined), [], "undefined");
	eq(selectionToNames("readonly"), ["read", "grep", "find", "ls"], "readonly");
	eq(selectionToNames("all"), ["read", "grep", "find", "ls", "bash", "edit", "write"], "all");
});

test("selectionToNames handles explicit lists: dedupe, order, unknown filtering", () => {
	eq(selectionToNames(["read", "grep"]), ["read", "grep"], "explicit");
	eq(selectionToNames(["read", "read", "grep"]), ["read", "grep"], "dedup");
	eq(selectionToNames(["READ", "Bash"]), ["read", "bash"], "case-insensitive");
	eq(selectionToNames(["read", "nope", "fly"]), ["read"], "unknown filtered");
	eq(selectionToNames([]), [], "empty list");
});

test("isMutatingSelection only true when bash/edit/write present", () => {
	if (isMutatingSelection("none")) throw new Error("none should not be mutating");
	if (isMutatingSelection("readonly")) throw new Error("readonly should not be mutating");
	if (!isMutatingSelection("all")) throw new Error("all should be mutating");
	if (!isMutatingSelection(["read", "write"])) throw new Error("list with write should be mutating");
	if (isMutatingSelection(["read", "grep"])) throw new Error("readonly list should not be mutating");
});

test("selectionLabel summarizes the selection", () => {
	eq(selectionLabel("none"), "none", "none");
	eq(selectionLabel(undefined), "none", "undefined");
	eq(selectionLabel("readonly"), "readonly", "readonly");
	eq(selectionLabel("all"), "all", "all");
	eq(selectionLabel(["read", "bash"]), "read,bash", "list");
	eq(selectionLabel(["nope"]), "none", "all-unknown list");
});

test("clampMaxToolCalls clamps to [1,100] with default 16", () => {
	eq(clampMaxToolCalls(undefined), 16, "default");
	eq(clampMaxToolCalls(0), 1, "below min");
	eq(clampMaxToolCalls(250), 100, "above max");
	eq(clampMaxToolCalls(99), 99, "in range (high)");
	eq(clampMaxToolCalls(6), 6, "in range");
	eq(clampMaxToolCalls(6.9), 6, "floored");
	eq(clampMaxToolCalls(Number.NaN), 16, "NaN -> default");
});

test("resolveToolDefs builds real tool definitions for the selection", () => {
	eq(resolveToolDefs("none", "/tmp").length, 0, "none -> empty");
	const ro = resolveToolDefs("readonly", "/tmp");
	eq(ro.map((d) => d.name), ["read", "grep", "find", "ls"], "readonly names");
	const all = resolveToolDefs("all", "/tmp");
	eq(all.length, 7, "all has 7");
	for (const d of all) {
		if (typeof d.execute !== "function") throw new Error(`tool ${d.name} missing execute`);
		if (!d.parameters) throw new Error(`tool ${d.name} missing parameters schema`);
	}
});
