# Hooks

Lifecycle hooks fire around create / update / delete ops. Use them for side-effects (audit logs, cache invalidation, search-index sync, denormalization, webhooks). For *deciding* whether an op is allowed, use [Access control](./access-control.md) — hooks aren't the right layer for authorization.

Hooks live on the **server config** alongside access policies, not on the collection definition. Schema in `schemas.ts` stays browser-safe; lifecycle logic lives in `server/cms.ts`.

## Slots

Six slots per scope (global on `defineCMS({ hooks })`, per-collection on `defineCMS({ serverCollections: { name: { hooks } } })`):

```
beforeCreate / afterCreate
beforeUpdate / afterUpdate
beforeDelete / afterDelete
```

Each slot accepts a single function or an array of functions. Throw to abort the op — the surrounding `applyOp` returns an error result and downstream hooks don't fire.

## Hook context

```ts
interface HookContext<Ctx, Doc> {
  ctx: Ctx;                    // request-scoped auth context
  collection: string;
  verb: 'create' | 'update' | 'delete';
  id?: string;                 // row id (set for update / delete; for create, set after id is generated)
  data?: Doc;                  // validated input (for create / update before-hooks; merged data for path ops)
  prev?: Doc;                  // existing row (set for update / delete)
  result?: Doc;                // post-op row (set on after-hooks)
}
```

- `before*` sees `ctx`, `data`, and (for update/delete) `prev`. `result` is undefined.
- `after*` sees everything `before*` saw plus `result` (the persisted row).
- `data` is the *validated* input that produced the change — for path-based ops (`patch`, `append`, `move`), it's the merged row, not the raw op fragment.

`Doc` is `RowOf<C[K]>` per collection when wired via `serverCollections`, so `prev.authorId` / `result.title` autocomplete with full inference.

## Global hooks

Set on `defineCMS({ hooks })`. Applies to every collection.

```ts
defineCMS({
  collections,
  hooks: {
    afterCreate: ({ collection, id, ctx }) => audit.log(ctx, `${collection}.created`, id),
    afterUpdate: ({ collection, id, ctx }) => audit.log(ctx, `${collection}.updated`, id),
    afterDelete: ({ collection, id, ctx }) => audit.log(ctx, `${collection}.deleted`, id),
  },
});
```

## Per-collection hooks

Wire under `serverCollections[name].hooks`. Per-collection hooks fire *after* the global slot for the same verb (global → collection). Both fire; collection hooks don't replace global hooks.

```ts
defineCMS({
  collections,
  hooks: { /* global */ },
  serverCollections: {
    posts: {
      hooks: {
        beforeDelete: ({ prev }) => {
          if (prev?.published) {
            throw new Error('cannot delete a published post — unpublish first');
          }
        },
        afterCreate: ({ data, result }) => searchIndex.add(result.id, data.title),
        afterUpdate: ({ result }) => searchIndex.update(result.id, result),
        afterDelete: ({ id }) => searchIndex.remove(id),
      },
    },
  },
});
```

## Aborting an op

Any hook can throw; the surrounding op fails:

```ts
serverCollections: {
  posts: {
    hooks: {
      beforeCreate: ({ data }) => {
        if (data?.title.includes('spam')) throw new Error('spam detected');
      },
    },
  },
}
```

`POST /ops` returns `OpResult[]` with `{ ok: false, error: { message: 'spam detected' } }` for the failing op. Other ops in the same batch still execute.

## When hooks fire

- HTTP `POST /ops` — every op runs before/after hooks.
- HTTP `PUT /singletons/:name` — fires create-or-update hooks depending on whether the row existed.
- `serverApi.create / update / delete` — same as HTTP, since both routes go through `applyOps`.

`serverApi.list / find / get` reads bypass hooks — they're not write ops.

## Tips

- Keep before-hooks fast. They block the op.
- Run after-hooks in the background when you don't need their result inline (`queueMicrotask(...)` or a job queue) — but only if the failure mode is "log and forget", not "must complete to consider the op done".
- Use `prev` and `result` to compute diffs (e.g. only sync to search when the title actually changed).
- A hook that wants to *see* but not block can swallow its own errors:
  ```ts
  afterCreate: async (hc) => {
    try { await webhook.fire(hc); } catch (e) { logger.warn('webhook failed', e); }
  }
  ```
