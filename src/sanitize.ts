/** Shared sanitizers for messages that may be shown to users or models. */

export function sanitizeErrorMessage(message: string): string {
	return message
		.replace(/Bearer\s+[^\s,)]+/gi, "Bearer [redacted]")
		.replace(/(api[_-]?key=)[^\s&]+/gi, "$1[redacted]")
		.replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-[redacted]");
}
