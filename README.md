# pi-devin-fusion

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Devin Fusion "sidekick" pattern for [pi](https://github.com/earendil-works/pi).

Two models work together: the active **planner** (you pick it) plans and reviews, and a cheaper **executor** (auto-selected) implements. The planner delegates to the executor via the `sidekick` tool. Mutating executor tools require consent and run serialized to prevent clobbered writes.

## Why

From [Cognition's blog post](https://cognition.com/blog/devin-fusion):

> the main agent should take minimal actions, and only read what is absolutely necessary. By default it should delegate and monitor, while making the significant decisions: the plan, the interpretation of ambiguity, the final review.

This extension makes that pattern work in pi — not as a suggestion, but as a mechanical tool wrapper. The planner model is always in control; the executor model runs a controlled tool loop with bounded turns.

## Installation

The extension is loaded by pi from any project root tree:

```json
// ~/.config/pi/extensions.json or .pi/extensions.json
{
  "pi": {
    "extensions": ["./path/to/pi-devin-fusion"]
  }
}
```

Or install it as a package:

```json
// package.json
{
  "pi": {
    "extensions": ["pi-devin-fusion"]
  }
}
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/devin on` / `forced` | Force every user message through the planner/sidekick split |
| `/devin available` / `auto` | Let the model decide when to use the sidekick (default) |
| `/devin off` | Disable the sidekick tool for this session |
| `/devin <prompt>` | Send a prompt through the forced planner prefix once |
| `/devin-setup` | Interactive picker to choose executor model, tools, and config (session-scoped) |
| `/devin-init` | Create a `.pi/devin.json` template to set the executor model and tool selection |
| `/devin-status` | Show current Devin mode, executor, tool selection, and consent state |
### Tools

The extension registers one tool:

- **`sidekick`** — Delegate a task to the executor model. Accepts a `prompt` string, optional `context_mode` (`"none"` / `"recent"`), and optional `context_turns` (1–10, default 4 for "recent" mode).

## Workflow

### Interactive setup (recommended for first use)

1. Run `/devin-setup` to pick an executor model and session config interactively.
2. Turn Devin on with `/devin on`.
3. Ask your question. The model uses the sidekick executor for implementation tasks.

### Config-file setup

1. (Optional) Run `/devin-init` to create a `.pi/devin.json` template.
2. Turn Devin on with `/devin on`.
3. Ask your question.

The planner delegates to the sidekick executor for exploration and implementation; it reviews
the result before responding. Use `/devin <prompt>` for a one-off delegation without changing the mode.

### Session vs file configuration

Settings from `/devin-setup` take precedence over `.pi/devin.json`. Session state persists
within the conversation and is restored on session restore. Use `/devin-status` to inspect
the effective configuration.

## Configuration

`.pi/devin.json` in your project root:

```json
{
  "$schema": "devin-fusion-config",
  "executor": "openai/gpt-4.1-mini",
  "executorTools": "all",
  "executorToolsConsent": false,
  "maxExecutorOutputTokens": 4096,
  "temperature": 0.2,
  "maxToolCalls": 16,
  "footerDisplay": "full"
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `executor` | auto-selected | Model identifier for the executor (e.g. `"openai/gpt-4.1-mini"`). Auto-selects the first non-current text model if unset. |
| `executorTools` | `"all"` | Tool selection: `"none"`, `"readonly"`, `"all"`, or an array like `["read", "grep", "write"]`. |
| `executorToolsConsent` | `false` | When `true`, skips the consent prompt for mutating tools. |
| `maxExecutorOutputTokens` | `4096` | Max output tokens per executor call. |
| `temperature` | `0.2` | Temperature for the executor model. |
| `maxToolCalls` | `16` | Max tool calls per executor run (clamped to 1–100). |
| `footerDisplay` | `"full"` | Footer verbosity: `"full"`, `"compact"`, or `"off"`. |

**Session precedence:** `/devin-setup` selection overrides `.pi/devin.json`. Session state persists in the conversation and is restored on session restore.

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Extension entry: `sidekick` tool, `/devin` commands, session state, footers |
| `src/config.ts` | Config loading, defaults, template generation |
| `src/context.ts` | Context normalization and recent-history builder |
| `src/executor.ts` | Executor pipeline: model resolution, consent gate, serialized mutating runs |
| `src/executor_policy.ts` | Pure consent-policy check (testable without models) |
| `src/llm.ts` | Low-level LLM calls, tool loop, circuit breakers, output truncation |
| `src/models.ts` | Model resolution helpers, executor auto-selection with auth check |
| `src/prompts.ts` | Planner prefix prompt and sidekick system prompt |
| `src/tools.ts` | Tool-definition factory, selection normalization, mutating detection |
| `src/types.ts` | Shared DevinConfig, SidekickOptions, ToolSelection, FooterDisplay types |
| `src/ui.ts` | Interactive session setup picker via pi TUI components |
| `src/utils.ts` | Concurrency-limited map, byte truncation, JSON extraction |
## Credit

Inspired by [Devin Fusion](https://cognition.com/blog/devin-fusion) by [Cognition](https://cognition.com).

## License

MIT
