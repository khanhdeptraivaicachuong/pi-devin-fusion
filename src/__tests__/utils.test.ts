/**
 * Tests for shared utilities.
 */

import { extractJson, mapWithConcurrencyLimit, truncateToBytes } from "../utils.ts";
import { eq, test } from "./_harness.ts";

test("truncateToBytes does not split UTF-8 characters", () => {
	eq(truncateToBytes("a😀b", 2, "…"), "a…", "emoji boundary");
	eq(truncateToBytes("abc", 3, "…"), "abc", "unchanged at limit");
});

test("mapWithConcurrencyLimit preserves result order", async () => {
	const seen: number[] = [];
	const result = await mapWithConcurrencyLimit([3, 1, 2], 2, async (value, index) => {
		seen.push(index);
		return value * 2;
	});
	eq(result, [6, 2, 4], "result order");
	eq(seen.sort(), [0, 1, 2], "every item visited");
});

test("extractJson parses whole text, fenced json, and object substring", () => {
	eq(extractJson('{"a":1}'), { a: 1 }, "whole json");
	eq(extractJson('```json\n{"b":2}\n```'), { b: 2 }, "fenced json");
	eq(extractJson('prefix {"c":3} suffix'), { c: 3 }, "substring json");
});
