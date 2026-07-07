/**
 * Tests for pi-devin-fusion pure executor policy (fail-closed mutation consent).
 */

import { resolveExecutorPolicy } from "../executor_policy.ts";
import { eq, test } from "./_harness.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TMP = join(import.meta.dirname, "../../.tmp-test-devin");

function setupConfig(overrides: Record<string, unknown>) {
	mkdirSync(join(TMP, ".pi"), { recursive: true });
	writeFileSync(join(TMP, ".pi/devin.json"), JSON.stringify(overrides, null, 2) + "\n", "utf8");
}

test("readonly tools never require consent", () => {
	setupConfig({ executorTools: "readonly" });
	const policy = resolveExecutorPolicy(TMP, true, {}, false);
	eq(policy.toolSelectionConsentRequired, false, "readonly is safe without consent");
});

test("mutating tools without consent require consent", () => {
	setupConfig({});
	const policy = resolveExecutorPolicy(TMP, true, {}, false);
	if (!policy.toolSelectionConsentRequired) throw new Error("all tools should require consent when not consented");
});

test("mutating tools with config consent do not require consent", () => {
	setupConfig({ executorToolsConsent: true });
	const policy = resolveExecutorPolicy(TMP, true, {}, false);
	eq(policy.toolSelectionConsentRequired, false, "config consent bypasses requirement");
});
