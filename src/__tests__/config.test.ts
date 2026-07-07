/**
 * Tests for pi-devin-fusion config defaults and template generation.
 */

import { applyDefaults, generateConfigExample } from "../config.ts";
import { eq, test } from "./_harness.ts";

test("applyDefaults fills every knob from empty config", () => {
	const resolved = applyDefaults({}, {});
	eq(resolved.maxExecutorOutputTokens, 4096, "output tokens");
	eq(resolved.temperature, 0.2, "temperature");
	eq(resolved.executorTools, "all", "executor tools");
	eq(resolved.maxToolCalls, 16, "max tool calls");
	eq(resolved.footerDisplay, "full", "footer display");
});

test("applyDefaults lets an override pick the executor only", () => {
	const resolved = applyDefaults({ temperature: 0.9 }, { executor: "anthropic/claude-haiku-4-5" });
	eq(resolved.executor, "anthropic/claude-haiku-4-5", "executor override honored");
	eq(resolved.temperature, 0.9, "config temperature preserved");
});

test("generateConfigExample omits executor when none given", () => {
	const example = generateConfigExample();
	if ("executor" in example) throw new Error("executor should be omitted when undefined");
	eq(example.executorTools, "all", "default tools");
	eq(example.maxToolCalls, 16, "default max calls");
});

test("generateConfigExample includes executor when given", () => {
	const example = generateConfigExample("openai/gpt-4.1-mini");
	eq(example.executor, "openai/gpt-4.1-mini", "executor present");
});
test("applyDefaults accepts session overrides for tools, max calls, footer", () => {
	const resolved = applyDefaults({}, { executorTools: "readonly", maxToolCalls: 8, footerDisplay: "compact" });
	eq(resolved.executorTools, "readonly", "tools override");
	eq(resolved.maxToolCalls, 8, "max calls override");
	eq(resolved.footerDisplay, "compact", "footer override");
});

test("applyDefaults override of empty string clears executor for auto", () => {
	const resolved = applyDefaults({ executor: "anthropic/claude-haiku-4-5" }, { executor: "" });
	eq(resolved.executor, "", "empty string clears configured executor");
});
