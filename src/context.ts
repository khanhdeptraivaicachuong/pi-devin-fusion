/**
 * Conversation-context helpers for optional executor context.
 */

const MAX_CONTEXT_TURNS = 10;
const DEFAULT_CONTEXT_TURNS = 4;
const MAX_CONTEXT_CHARS = 20000;

export type DevinContextMode = "none" | "recent";

export function normalizeContextTurns(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) return DEFAULT_CONTEXT_TURNS;
	return Math.max(1, Math.min(MAX_CONTEXT_TURNS, Math.floor(value)));
}

interface MaybeMessage {
	content?: unknown;
}

function getContentText(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (typeof part === "string") return part;
			if (part && typeof part === "object" && "type" in part) {
				const p = part as { type?: unknown };
				if (p.type === "text") {
					const text = (part as { text?: unknown }).text;
					return typeof text === "string" ? text : "";
				}
			}
			return "";
		})
		.filter((text) => text.trim())
		.join("\n")
		.trim();
}

export function extractMessageText(message: unknown): string {
	const m = message as MaybeMessage;
	return getContentText(m?.content);
}

export function buildRecentContextFromEntries(entries: unknown[], turns: number | undefined): string | undefined {
	const maxTurns = normalizeContextTurns(turns);
	const messages: Array<{ role: "user" | "assistant"; text: string }> = [];
	let userMessagesSeen = 0;

	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as { type?: unknown; message?: MaybeMessage };
		if (entry?.type !== "message" || !entry.message) continue;
		const role = (entry.message as { role?: unknown }).role;
		if (role !== "user" && role !== "assistant") continue;
		const text = getContentText(entry.message.content);
		if (!text) continue;
		messages.unshift({ role: role as "user" | "assistant", text });
		if (role === "user") {
			userMessagesSeen++;
			if (userMessagesSeen >= maxTurns) break;
		}
	}

	if (messages.length === 0) return undefined;

	let rendered = messages
		.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
		.join("\n\n");

	if (rendered.length > MAX_CONTEXT_CHARS) {
		rendered = rendered.slice(rendered.length - MAX_CONTEXT_CHARS).trimStart();
		rendered = `[truncated to last ${MAX_CONTEXT_CHARS} chars]\n${rendered}`;
	}

	return rendered;
}

export function buildSidekickTaskText(prompt: string, contextText: string | undefined): string {
	if (!contextText?.trim()) return prompt;
	return [
		"Recent conversation context:",
		contextText.trim(),
		"",
		"Current task:",
		prompt.trim(),
	].join("\n");
}
