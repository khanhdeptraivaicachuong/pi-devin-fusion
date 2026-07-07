/**
 * Shared pure utilities for pi-devin-fusion.
 */

/**
 * Run `items` through `fn` with at most `limit` concurrent invocations.
 * Preserves input order in the resolved result array.
 */
export async function mapWithConcurrencyLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (limit <= 0) limit = 1;
	const results: R[] = new Array(items.length);
	let cursor = 0;
	async function worker(): Promise<void> {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await fn(items[index], index);
		}
	}
	const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
	await Promise.all(workers);
	return results;
}

/** UTF-8 safe truncation on a char boundary, appending `suffix` when actually cut. */
export function truncateToBytes(text: string, maxBytes: number, suffix = ""): string {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(text);
	if (bytes.length <= maxBytes) return text;
	let end = maxBytes;
	// Back off to a char boundary.
	while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
	const slice = bytes.subarray(0, end);
	return new TextDecoder().decode(slice) + suffix;
}

/**
 * Extract a JSON object from text. Tries the whole text first, then fenced
 * ```json blocks, then the first balanced {...} substring.
 */
export function extractJson(text: string): unknown {
	const trimmed = text.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		// not strict JSON; continue
	}

	const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) {
		try {
			return JSON.parse(fence[1].trim());
		} catch {
			// ignore and try brace scan
		}
	}

	const brace = text.match(/\{[\s\S]*\}/);
	if (brace) {
		try {
			return JSON.parse(brace[0]);
		} catch {
			// ignore
		}
	}

	return undefined;
}
