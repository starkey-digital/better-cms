# Operations

All writes flow through the same op pipeline. Three entry points reduce to one path.

## The three modes

1. **Inline edit** — admin user clicks a field on a live page, types, blurs.
2. **Admin save** — record edited in `<CMSAdmin>` form.
3. **LLM / MCP tool call** — agent invokes the MCP tool exposed by the CLI.

Each emits `CMSOp` values. `applyOps()` runs them through validation, persistence, and live broadcast.

## Why one pipeline

- One audit trail
- One validation path
- One broadcast channel for live previews
- New op types = new feature for all three modes at once

## Op shape

```ts
type CMSOp =
	| { type: 'create'; collection: string; data: unknown }
	| { type: 'update'; collection: string; id: string; patch: unknown }
	| { type: 'delete'; collection: string; id: string }
	// ...
```

`opToEventType()` maps an op to its broadcast event. Adapters never call it directly — core handles emission.
