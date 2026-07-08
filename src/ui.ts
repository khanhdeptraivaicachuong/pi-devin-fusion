/**
 * Native pi TUI setup for pi-devin-fusion.
 *
 * Interactive-only session setup: choose one executor model (or auto) and
 * session-scoped executor config without writing .pi/devin.json.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getSelectListTheme } from "@earendil-works/pi-coding-agent";
import {
	Container,
	Input,
	Key,
	matchesKey,
	type SelectItem,
	SelectList,
	Spacer,
	Text,
} from "@earendil-works/pi-tui";
import { modelDisplay } from "./models.ts";
import { clampMaxToolCalls, isMutatingSelection, selectionLabel } from "./tools.ts";
import type { Api, DevinMode, FooterDisplay, Model, ToolMode, ToolSelection } from "./types.ts";

const MODE_CYCLE: DevinMode[] = ["available", "forced", "off"];
const TOOL_MODE_CYCLE: ToolMode[] = ["none", "readonly", "all"];
const FOOTER_DISPLAY_CYCLE: FooterDisplay[] = ["full", "compact", "off"];
const MAX_CALLS_PRESETS = [4, 8, 12, 16, 25, 50, 100];

interface ModelInfo {
	identifier: string;
	provider: string;
	name: string;
}

export interface DevinSetupState {
	executorId?: string;
	executorAuto?: boolean;
	mode?: DevinMode;
	executorTools?: ToolSelection;
	maxToolCalls?: number;
	toolsConsented?: boolean;
	footerDisplay?: FooterDisplay;
}

function toModelInfo(available: Model<Api>[]): ModelInfo[] {
	return available.map((m) => ({
		identifier: modelDisplay(m),
		provider: m.provider,
		name: m.name,
	}));
}

function filterModels(models: ModelInfo[], query: string): ModelInfo[] {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) return models;
	return models.filter(
		(m) =>
			m.name.toLowerCase().includes(trimmed) ||
			m.provider.toLowerCase().includes(trimmed) ||
			m.identifier.toLowerCase().includes(trimmed),
	);
}

/** Toggle the single executor selection. Selecting the same model clears to auto. */
export function toggleExecutorSelection(current: string | undefined, id: string): string | undefined {
	return current === id ? undefined : id;
}

/** Badge shown in the model picker's right column. */
export function executorBadge(isExecutor: boolean): string {
	return isExecutor ? "◆ executor" : "";
}

export function cycleMode(mode: DevinMode | undefined, dir: 1 | -1): DevinMode {
	const current = mode ?? "available";
	const i = MODE_CYCLE.indexOf(current);
	const base = i < 0 ? 0 : i;
	return MODE_CYCLE[(base + dir + MODE_CYCLE.length) % MODE_CYCLE.length];
}

export function setupToolSelectionLabel(selection: ToolSelection | undefined): string {
	return Array.isArray(selection) ? `custom (${selectionLabel(selection)})` : selectionLabel(selection);
}

/**
 * Replace a SelectList's items in place. pi-tui exposes no public setItems(),
 * and setFilter only prefix-matches value, so the picker needs direct guarded
 * replacement for multi-field search and live badge relabels.
 */
function setSelectListItems(list: SelectList, items: SelectItem[]): void {
	const internal = list as unknown as { items?: unknown; filteredItems?: unknown };
	if (!Array.isArray(internal.items) || !Array.isArray(internal.filteredItems)) {
		throw new Error("pi-tui SelectList internals changed; devin-setup needs a public setItems()");
	}
	internal.items = items;
	internal.filteredItems = [...items];
}

/**
 * Devin setup UI: two sections, Models + Config.
 *
 * Models: ↑/↓ navigate · e choose executor · x auto · / search
 * Config: ↑/↓ move settings · Space or ←/→ change value
 * Global: Tab switches section · Enter saves · Esc cancels.
 */
export async function selectDevinSetup(
	ctx: ExtensionContext,
	available: Model<Api>[],
	initial: DevinSetupState,
): Promise<DevinSetupState | null> {
	if (!ctx.hasUI) return null;

	const models = toModelInfo(available);
	const nameById = new Map(models.map((m) => [m.identifier, m.name] as const));
	const state: DevinSetupState = {
		executorId: initial.executorId,
		executorAuto: initial.executorAuto ?? !initial.executorId,
		mode: initial.mode ?? "available",
		executorTools: initial.executorTools ?? "all",
		maxToolCalls: clampMaxToolCalls(initial.maxToolCalls),
		toolsConsented: initial.toolsConsented ?? false,
		footerDisplay: initial.footerDisplay ?? "full",
	};

		interface ConfigRow {
			label: string;
			values: string[];
			get: () => string;
			set: (value: string) => void;
			note: () => string;
		}
		const configRows: ConfigRow[] = [
			{
				label: "Mode",
				values: MODE_CYCLE,
				get: () => state.mode ?? "available",
				set: (v) => {
					state.mode = v as DevinMode;
				},
				note: () =>
					state.mode === "forced"
						? "every normal prompt is routed through planner/sidekick"
						: state.mode === "off"
							? "sidekick is disabled for this session"
							: "planner decides when to call sidekick",
			},
			{
				label: "Executor tools",
				values: TOOL_MODE_CYCLE,
				get: () => Array.isArray(state.executorTools) ? "custom" : (state.executorTools ?? "all"),
				set: (v) => {
					state.executorTools = v as ToolMode;
					if (!isMutatingSelection(state.executorTools)) state.toolsConsented = false;
				},
				note: () =>
					Array.isArray(state.executorTools)
						? `custom tools: ${selectionLabel(state.executorTools)} — cycle to replace with a bundle`
						: isMutatingSelection(state.executorTools)
							? "'all' adds bash/edit/write — you'll confirm on save; mutating runs serialize"
							: state.executorTools === "readonly"
								? "read/grep/find/ls — sidekick can inspect the project"
								: "sidekick answers without tools",
			},
			{

			label: "Max tool calls",
			values: MAX_CALLS_PRESETS.map(String),
			get: () => String(clampMaxToolCalls(state.maxToolCalls)),
			set: (v) => {
				state.maxToolCalls = Number(v);
			},
			note: () => "max tool steps for each sidekick run when tools are on",
		},
		{
			label: "Footer",
			values: FOOTER_DISPLAY_CYCLE,
			get: () => state.footerDisplay ?? "full",
			set: (v) => {
				state.footerDisplay = v as FooterDisplay;
			},
			note: () =>
				state.footerDisplay === "off"
					? "restore Pi's built-in footer"
					: state.footerDisplay === "compact"
						? "show Devin mode and whether executor is set"
						: "show Devin mode, executor, and config",
		},
	];

	return ctx.ui.custom<DevinSetupState | null>((tui, theme, _kb, done) => {
		let focus: "models" | "config" = "models";
		let searching = false;
		let query = "";
		let configIndex = 0;
		const searchBuffer = new Input();

		const accent = (s: string) => theme.fg("accent", s);
		const dim = (s: string) => theme.fg("dim", s);

		const container = new Container();
		container.addChild(new DynamicBorder((s) => accent(s)));
		container.addChild(new Text(accent(theme.bold("Devin Setup"))));
		container.addChild(new Text(dim("Choose one executor model, or clear to auto. Tab to Config.")));
		container.addChild(new Spacer(1));

		const executorLine = new Text("");
		container.addChild(executorLine);
		container.addChild(new Spacer(1));

		const modelsHeader = new Text("");
		const searchLine = new Text("");
		container.addChild(modelsHeader);
		container.addChild(searchLine);

		const providerWidth = Math.min(16, Math.max(8, ...models.map((m) => m.provider.length)) + 2);
		const makeItems = (filtered: ModelInfo[]): SelectItem[] =>
			filtered.map((m) => ({
				value: m.identifier,
				label: `${m.provider.padEnd(providerWidth)}${m.name}`,
				description: executorBadge(state.executorId === m.identifier),
			}));

		const selectList = new SelectList(
			makeItems(models),
			Math.min(Math.max(models.length, 1), 10),
			getSelectListTheme(),
			{ minPrimaryColumnWidth: providerWidth + 18, maxPrimaryColumnWidth: providerWidth + 40 },
		);
		container.addChild(selectList);
		container.addChild(new Spacer(1));

		const configHeader = new Text("");
		container.addChild(configHeader);
		const configTexts = configRows.map(() => new Text(""));
		for (const t of configTexts) container.addChild(t);

		const hint = new Text("");
		container.addChild(hint);
		container.addChild(new DynamicBorder((s) => accent(s)));

		function executorSummary(): string {
			if (!state.executorId) return dim("Executor: ") + "auto";
			return dim("Executor: ") + (nameById.get(state.executorId) ?? state.executorId);
		}

		function configRowText(i: number): string {
			const row = configRows[i];
			const focused = focus === "config" && i === configIndex;
			const cursor = focused ? accent("› ") : "  ";
			const label = focused ? accent(row.label) : dim(row.label);
			const rawValue = row.label === "Executor tools" ? setupToolSelectionLabel(state.executorTools) : row.get();
			const value = focused ? theme.bold(rawValue) : rawValue;
			return `${cursor}${label}: ${value}`;
		}

		function currentHint(): string {
			if (focus === "models" && searching) return dim("type to filter • ↑/↓ move • Enter/Esc done");
			if (focus === "config") {
				const note = configRows[configIndex].note();
				return dim(`↑/↓ setting • Space/←→ change • Tab models • Enter save • Esc cancel${note ? "  —  " + note : ""}`);
			}
			return dim("↑/↓ move • e executor • x auto • / search • Tab config • Enter save • Esc cancel");
		}

		function refresh() {
			const prev = selectList.getSelectedItem()?.value;
			const items = makeItems(filterModels(models, query));
			setSelectListItems(selectList, items);
			const idx = prev ? items.findIndex((i) => i.value === prev) : 0;
			selectList.setSelectedIndex(idx >= 0 ? idx : 0);

			executorLine.setText(executorSummary());
			modelsHeader.setText(focus === "models" ? accent("▸ Models") : dim("  Models"));
			configHeader.setText(focus === "config" ? accent("▸ Config") : dim("  Config"));
			searchLine.setText(
				searching
					? dim("  search: ") + query + accent("▏")
					: query
						? dim(`  filter: ${query}  (/ to edit)`)
						: dim("  / to search"),
			);
			configTexts.forEach((t, i) => t.setText(configRowText(i)));
			hint.setText(currentHint());
			selectList.invalidate();
			tui.requestRender();
		}

		function cycleConfig(dir: 1 | -1) {
			const row = configRows[configIndex];
			if (row.label === "Mode") {
				state.mode = cycleMode(state.mode, dir);
				refresh();
				return;
			}
			const i = row.values.indexOf(row.get());
			const base = i < 0 ? 0 : i;
			row.set(row.values[(base + dir + row.values.length) % row.values.length]);
			refresh();
		}

		function confirm() {
			done({
				executorId: state.executorId,
				executorAuto: state.executorAuto ?? !state.executorId,
				mode: state.mode,
				executorTools: state.executorTools,
				maxToolCalls: state.maxToolCalls,
				toolsConsented: state.toolsConsented,
				footerDisplay: state.footerDisplay,
			});
		}

		refresh();

		return {
			render(width: number) {
				return container.render(width);
			},
			invalidate() {
				container.invalidate();
			},
			handleInput(data: string) {
				if (focus === "models" && searching) {
					if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
						searching = false;
						refresh();
						return;
					}
					if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
						selectList.handleInput(data);
						return;
					}
					const before = searchBuffer.getValue();
					searchBuffer.handleInput(data);
					const after = searchBuffer.getValue();
					if (after !== before) {
						query = after;
						refresh();
					}
					return;
				}

				if (matchesKey(data, Key.escape)) {
					done(null);
					return;
				}
				if (matchesKey(data, Key.tab)) {
					focus = focus === "models" ? "config" : "models";
					refresh();
					return;
				}
				if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
					confirm();
					return;
				}

				if (focus === "config") {
					if (matchesKey(data, Key.up)) {
						configIndex = (configIndex - 1 + configRows.length) % configRows.length;
						refresh();
						return;
					}
					if (matchesKey(data, Key.down)) {
						configIndex = (configIndex + 1) % configRows.length;
						refresh();
						return;
					}
					if (matchesKey(data, Key.space) || matchesKey(data, Key.right)) {
						cycleConfig(1);
						return;
					}
					if (matchesKey(data, Key.left)) {
						cycleConfig(-1);
						return;
					}
					return;
				}

				if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
					selectList.handleInput(data);
					return;
				}
				if (data === "/") {
					searching = true;
					refresh();
					return;
				}
				if (data === "e") {
					const item = selectList.getSelectedItem();
					if (item) {
						state.executorId = toggleExecutorSelection(state.executorId, item.value);
						state.executorAuto = !state.executorId;
						refresh();
					}
					return;
				}
				if (data === "x") {
					state.executorId = undefined;
					state.executorAuto = true;
					refresh();
				}
			},
		};
	});
}
