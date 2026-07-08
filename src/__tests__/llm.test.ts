/**
 * Tests for LLM helper functions.
 */

import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai/compat";
import { getSupportsTemperature, getTextContent, sanitizeToolContent } from "../llm.ts";
import { eq, fakeModel, test } from "./_harness.ts";

test("getSupportsTemperature defaults to true unless explicitly false", () => {
	eq(getSupportsTemperature(fakeModel("openai", "gpt")), true, "default true");
	eq(getSupportsTemperature(fakeModel("anthropic", "opus", { supportsTemperature: false } as never)), false, "explicit false");
});

test("getTextContent joins only text parts", () => {
	const message = {
		role: "assistant",
		content: [
			{ type: "text", text: " hello " },
			{ type: "toolCall", id: "1", name: "read", arguments: {} },
			{ type: "text", text: "world" },
		],
		stopReason: "stop",
		timestamp: 0,
	} as unknown as AssistantMessage;
	eq(getTextContent(message), "hello \nworld", "text parts joined");
});

test("sanitizeToolContent redacts text only when a tool result is an error", () => {
	const content: ToolResultMessage["content"] = [{ type: "text", text: "failed with Bearer sk-1234567890abcdef" }];
	eq(sanitizeToolContent(content, false), content, "success content unchanged");
	eq(sanitizeToolContent(content, true), [{ type: "text", text: "failed with Bearer [redacted]" }], "error content redacted");
});
