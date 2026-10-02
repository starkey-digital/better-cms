# Media and photos

Image and file fields are edited with a picker built for people who have never used a CMS. Wire a [`media`](/integrations/sveltekit) store and a `mediaAccess` policy and the admin does the rest.

```ts
createCms({
  media: s3Media({ bucket, endpoint, accessKeyId, secretAccessKey, publicBaseUrl }),
  mediaAccess: { upload: (ctx) => ctx?.user.role === 'admin' },
  // ...
});
```

## What the editor sees

An `image()` field shows the current photo, its description, and two buttons: **Choose a photo** and **Remove photo** (which asks first, and only detaches the photo from the record — it stays in the library).

**Choose a photo** opens a dialog with:

- **Upload a new photo** — works with camera and phone photos. Choosing a file opens a cropper (drag the box, pinch or use Zoom, arrow keys and `+`/`-` from the keyboard), then asks for a description. Uploading counts as choosing.
- The **library**, newest first, as thumbnails with their descriptions. Photos sharing a description are numbered ("Dancer · 2 of 6"). Long libraries load in pages.

Everything happens in plain words: too big, wrong type, not allowed and upload failures each get a sentence, and a failed upload offers **Try again**. HEIC photos that the browser cannot open say so and explain how to get a compatible one (Safari and recent iOS convert them automatically).

### Crop and downscale happen in the browser

The file stored is exactly what the editor saw. Before upload the browser crops, shrinks the longest edge to `maxSize` (default 2400px, never upscaled) and re-encodes as WebP, or JPEG where the browser cannot encode WebP (PNG stays PNG then, to keep transparency). A photo that needs no change is uploaded as-is. A 12-megapixel phone photo lands well under the 10 MB limit. GIF and SVG are uploaded untouched.

### Field options

```ts
cover: image().meta({
  aspect: [16 / 9, 1],                                   // number, number[], 'free', or omit
  aspectLabel: ['Wide — top of the post', 'Square — social preview'],
  maxSize: 1600,                                         // longest edge in px, default 2400
}).optional(),
```

| Option | Meaning |
|---|---|
| `aspect` | Width / height ratio(s) the editor crops to. One number fixes the shape; an array offers a choice; `'free'` (or omitting it) keeps the photo's own shape. |
| `aspectLabel` | Plain-words names matching `aspect` by position. Without it shapes are named from the ratio: "Square", "Wide (16:9)", "Tall (4:5)". |
| `maxSize` | Longest edge in pixels after downscaling. |

These reach the admin as `editor.props` on the field's `/_meta` entry.

## Value shape

Backward compatible with earlier releases:

```ts
// image()
{ key: string; url: string; mime?: string; size?: number; width?: number; height?: number; alt?: string }
// file()
{ key: string; url: string; mime?: string; size?: number; name?: string }
```

The picker fills every optional key. `alt` is per use: editing it from the field changes only that record's value, not the library item. Removing a photo stores `null`.

## Library API

Backed by the `cms_media` table (created with the other internal tables). Dimensions are read from the file header on the server, which works on Cloudflare Workers.

| Route | Policy | |
|---|---|---|
| `POST /media` (multipart: `file`, optional `alt`, `folder`) | `mediaAccess.upload` | Returns the item. The same bytes uploaded twice reuse one item. |
| `GET /media?limit=48&cursor=` | `mediaAccess.list` (falls back to `upload`) | `{ items, cursor? }`, newest first. Pass `cursor` back for the next page. |
| `DELETE /media/:id` | `mediaAccess.delete` (default deny) | Removes the row and the blob. It does not check whether a record still points at it. |

An item is `{ id, key, url, mime, size, width, height, alt, createdAt }` (`createdAt` in epoch milliseconds).

Uploads write the blob first, then the row; if the row fails the blob is deleted. Anything a crash leaves behind is reclaimed by `bcms media:gc`, which treats every `cms_media` row as referenced.
