/**
 * Tests for optional sidekick context builders.
 */

import {
	buildRecentContextFromEntries,
	buildSidekickTaskText,
	extractMessageText,
	normalizeContextTurns,
} from "../context.ts";
import { eq, test } from "./_harness.ts";

test("normalizeContextTurns clamps to supported range", () => {
	eq(normalizeContextTurns(undefined), 4, "default");
	eq(normalizeContextTurns(0), 1, "min");
	eq(normalizeContextTurns(99), 10, "max");
	eq(normalizeContextTurns(2.9), 2, "floor");
});

test("extractMessageText reads string and text parts", () => {
	eq(extractMessageText({ content: " hello " }), "hello", "string content");
	eq(extractMessageText({ content: [{ type: "text", text: "a" }, { type: "image" }, "b"] }), "a\nb", "parts");
});

test("buildRecentContextFromEntries keeps recent user turns and assistants", () => {
	const entries = [
		{ type: "message", message: { role: "user", content: "old" } },
		{ type: "message", message: { role: "assistant", content: "old answer" } },
		{ type: "message", message: { role: "user", content: "new" } },
		{ type: "message", message: { role: "assistant", content: "new answer" } },
		{ type: "custom", message: { role: "user", content: "skip" } },
	];
	const context = buildRecentContextFromEntries(entries, 1);
	eq(context, "User: new\n\nAssistant: new answer", "recent turn only");
});

test("buildSidekickTaskText adds context only when present", () => {
	eq(buildSidekickTaskText("do it", undefined), "do it", "no context");
	eq(
		buildSidekickTaskText("do it", "User: hello"),
		"Recent conversation context:\nUser: hello\n\nCurrent task:\ndo it",
		"with context",
	);
});
