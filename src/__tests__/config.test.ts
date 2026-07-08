/**
 * Tests for pi-devin-fusion config defaults and template generation.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyDefaults, generateConfigExample, loadConfig } from "../config.ts";
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

test("loadConfig normalizes invalid project config values", () => {
	const tmp = join(tmpdir(), "pi-devin-fusion-config-invalid");
	mkdirSync(join(tmp, ".pi"), { recursive: true });
	writeFileSync(join(tmp, ".pi/devin.json"), JSON.stringify({
		executor: 42,
		maxExecutorOutputTokens: -1,
		temperature: 99,
		executorTools: ["READ", "unknown", "bash", "read"],
		maxToolCalls: 250,
		executorToolsConsent: "yes",
		footerDisplay: "verbose",
	}, null, 2), "utf8");

	const resolved = applyDefaults(loadConfig(tmp, true), {});
	eq(resolved.executor, undefined, "invalid executor omitted");
	eq(resolved.maxExecutorOutputTokens, 4096, "invalid output tokens defaulted");
	eq(resolved.temperature, 0.2, "invalid temperature defaulted");
	eq(resolved.executorTools, ["read", "bash"], "explicit tools normalized");
	eq(resolved.maxToolCalls, 100, "max calls clamped");
	eq(resolved.executorToolsConsent, undefined, "invalid consent omitted");
	eq(resolved.footerDisplay, "full", "invalid footer defaulted");
});

test("applyDefaults clamps unsafe numeric config", () => {
	const low = applyDefaults({ maxToolCalls: 0, maxExecutorOutputTokens: 0, temperature: -1 }, {});
	eq(low.maxToolCalls, 1, "max calls min");
	eq(low.maxExecutorOutputTokens, 4096, "zero output tokens defaulted");
	eq(low.temperature, 0.2, "negative temperature defaulted");

	const high = applyDefaults({ maxToolCalls: 999, maxExecutorOutputTokens: 999_999, temperature: 2 }, {});
	eq(high.maxToolCalls, 100, "max calls max");
	eq(high.maxExecutorOutputTokens, 65_536, "output tokens capped");
	eq(high.temperature, 2, "temperature max accepted");
});

test("applyDefaults fails closed for invalid explicit tool selections", () => {
	eq(applyDefaults({ executorTools: "typo" as never }, {}).executorTools, "none", "invalid string -> none");
	eq(applyDefaults({ executorTools: [] }, {}).executorTools, [], "empty list stays no tools");
	eq(applyDefaults({ executorTools: ["typo"] }, {}).executorTools, [], "all-invalid list stays no tools");
});
