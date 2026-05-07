# Collections

A **collection** is a typed group of records sharing a schema. Each collection maps to a database table.

## Defining

```ts
import { collection, text, image, relation } from 'better-cms';

const posts = collection({
	fields: {
		title: text({ required: true }),
		hero: image(),
		author: relation('authors'),
	},
});
```

## Singletons

For one-off documents (site settings, homepage hero) use the `singleton` kind. The record uses a fixed id of `"default"` and gets dedicated `GET`/`PUT /singletons/:name` routes.

```ts
const homepage = collection({
	kind: 'singleton',
	fields: {
		hero: text(),
		intro: richText(),
	},
});
```

## Type inference

`defineCMS<C>` captures your config verbatim. The same types flow into:

- `serverApi(config)` — runtime read/write
- Remote helpers (`listCollection`, `runOps`)
- `<CMSAdmin>` — fields and previews

You don't generate or hand-write types for individual collections.
