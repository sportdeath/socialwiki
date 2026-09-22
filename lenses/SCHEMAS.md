# Social.Wiki Graffiti records

A **site** is a document published under a global name. Its **site name** is
used for publication and discovery; its **site address** can also include query
state. The JSON below is the Graffiti object's `value`. Graffiti separately
stores its creator (`actor`), record URL (`url`), discovery channels (`channels`),
and optional audience (`allowed`). `time` is a client-supplied Unix timestamp in
milliseconds. Data Guard displays these property names directly.

## Site publication

```json
{
  "action": "Publish site",
  "site name": "mypage",
  "changes": "Added feature",
  "document": "<HTML media URL>",
  "previous versions": ["<version-record URL>"],
  "time": 1790000000000
}
```

Public, in the site-name channel. The HTML is uploaded separately with
`postMedia`. Previous versions refer to metadata records, not HTML media.
A new site omits `previous versions`; readers treat an omitted field as an empty
list. Later publications include it when they reference earlier versions.
Restore and Endorse publish this same format with an explanation in `changes`.
Custom browser and lens documents also use this format (`browser`, `v`, `e`, `h`).

For publication, restore, and endorsement, the writer chooses one timestamp `T`
and references the deduplicated union of:

- All known history tips: versions not referenced by another known version.
- All known versions whose `time` is greater than or equal to `T`.

The same `T` is stored in the publication. An ordinary sequential history usually
needs only one reference. Equal or future timestamps receive direct references
even when they are not tips, so deleting intermediate metadata cannot make those
observed versions sort ahead of the new publication. This guarantee covers the
surviving versions the writer observed, not versions discovered afterward.
There is no reference-count cap: many future-dated versions or concurrent tips
can still produce a large list.

## Protection

```json
{
  "action": "Protect site",
  "site name": "mypage",
  "time": 1790000000000
}
```

```json
{
  "action": "Remove site protection",
  "site name": "mypage",
  "protection removed": "<protection-record URL>",
  "time": 1790000000000
}
```

Public, in the site-name channel. Removal targets a particular protection record.
Only decisions by trusted editors affect the viewer's protection state.

## Trust

```json
{
  "action": "Trust editor",
  "editor": "<identity link>",
  "time": 1790000000000
}
```

Stopping trust uses `"action": "Stop trusting editor"` with the same fields.
Public, in the publishing editor's identity channel. Readers require the record's
creator to match that editor. The latest decision per target editor wins; stopping
trust wins when timestamps are equal.

## Browsing history

```json
{
  "action": "Visit site",
  "site address": "mypage?section=introduction",
  "time": 1790000000000
}
```

Private (`allowed: []`), in the visitor's identity channel. Suggestions use visits
from the last 30 days.

## Starter-site waves

```json
{
  "action": "Wave",
  "site name": "mypage"
}
```

Public, in the site-name channel. Unwaving deletes the original records.

## Compatibility

Updated readers discover both current publications and legacy publications with
`activity: "Update"`, `object`, `published`, `summary`, `result.media`, and
`precededBy`. They normalize legacy fields in memory while preserving the original
record URLs, authors, access metadata, and version references. Old stored data is
not rewritten. Mixed-format histories retain causal ordering, restoration,
endorsement, and deletion support.

The starter discovers both current waves and legacy `{ "activity": "Wave" }`
records in the site's channel. Newly published records use only the readable
format. Older, unmodified clients and already-published starter code do not gain
support for new records automatically.

Legacy protection, trust, and browsing-history records are intentionally not
read. Existing history records therefore do not enable recording under the new
format; the user can enable it again in the address bar.
