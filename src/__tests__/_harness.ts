/**
 * Shared test harness for pi-devin-fusion unit tests (no external runner).
 * Not a `*.test.ts` file, so the test glob does not execute it standalone.
 */

import type { Api, Model } from "../types.ts";

type TestCase = { name: string; fn: () => void | Promise<void> };

const tests: TestCase[] = [];

export function test(name: string, fn: () => void | Promise<void>) {
	tests.push({ name, fn });
}

export async function runRegisteredTests(): Promise<number> {
	let failures = 0;
	while (tests.length > 0) {
		const { name, fn } = tests.shift()!;
		try {
			await fn();
			console.log(`✓ ${name}`);
		} catch (err) {
			console.error(`✗ ${name}:`, err);
			failures++;
		}
	}
	return failures;
}

export function eq<T>(a: T, b: T, msg: string) {
	if (JSON.stringify(a) !== JSON.stringify(b)) {
		throw new Error(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
	}
}

export function fakeModel(provider: string, id: string, overrides: Partial<Model<Api>> = {}): Model<Api> {
	return {
		id,
		name: id,
		api: "openai-completions" as Api,
		provider,
		baseUrl: "https://example.com",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
		...overrides,
	};
}
