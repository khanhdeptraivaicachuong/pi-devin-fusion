/**
 * Cross-platform test runner: imports every `*.test.ts` in __tests__/.
 * Usage: node --import jiti/register src/__tests__/run.ts
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = import.meta.dirname;
let failures = 0;

for (const entry of readdirSync(dir)) {
	if (!entry.endsWith(".test.ts") || entry.startsWith("_")) continue;
	const path = join(dir, entry);
	console.log(`\n[${entry}]`);
	try {
		await import(pathToFileURL(path).href);
	} catch (err) {
		console.error(`${entry} failed:`, err);
		failures++;
	}
}

if (failures > 0) {
	console.error(`\n${failures} test file(s) failed.`);
	process.exit(1);
}
console.log("\nAll tests passed.");
