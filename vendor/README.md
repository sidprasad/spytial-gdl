# vendor

`spytial-spec.schema.json` is spytial-core's published JSON Schema for a layout
spec, copied verbatim from the release named in its own
`x-spytial-core-version`. It is the source `src/_spec-tables.js` is generated
from — see [`../scripts/generate-spec-tables.mjs`](../scripts/generate-spec-tables.mjs).

Re-vendor and regenerate together:

```bash
./scripts/update-spytial-core.sh
```

Nothing loads this at runtime. The engine itself is fetched from CDN on a
floating major tag, and `test/pins.test.mjs` keeps it that way — this directory
is the one place a patch version is written down, because a schema has to come
from some particular release.
