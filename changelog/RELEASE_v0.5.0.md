# Release v0.5.0

**Released:** 2026-11-19
**Previous version:** v0.4.1

Collections can now opt in to a Save button and to Publish / Unpublish, for editors who write in several sittings and don't want half-finished work going live.

## Features

- **`admin.autosave: false`.** Edits stay in the form until the editor presses Save. The status bar says "You have changes that aren't saved yet", and leaving the page or following a link in the admin asks first. Default unchanged: fields save when the editor leaves them.
- **`admin.publishField`.** Names a boolean field that the admin shows as Publish / Unpublish buttons, with a Draft / Published badge beside the title and a Draft tag in the list. New records start as drafts. The flag is data only: filter public queries on it, e.g. `where: { published: true }`.

## Fixes

- **`unique()` and `indexed()` no longer erase a field's kind.** `unique(slug())` used to come out as a plain text field, so the admin never filled the web address in from the title and didn't check its format. The helpers now add to a field's existing tags instead of replacing them.

No breaking changes.
