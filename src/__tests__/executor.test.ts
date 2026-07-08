/**
 * Tests for sidekick executor orchestration helpers.
 */

import { sanitizeErrorMessage } from "../executor.ts";
import { eq, test } from "./_harness.ts";

test("sanitizeErrorMessage redacts obvious provider secrets", () => {
	const message = "request failed: Bearer sk-1234567890abcdef api_key=secret-token&x=1";
	const sanitized = sanitizeErrorMessage(message);
	eq(sanitized.includes("secret-token"), false, "api_key value redacted");
	eq(sanitized.includes("sk-1234567890abcdef"), false, "sk token redacted");
	eq(sanitized, "request failed: Bearer [redacted] api_key=[redacted]&x=1", "sanitized text");
});
