#!/usr/bin/env bash
# Re-vendor spytial-core's spec schema and regenerate the annotation tables.
#
# Unlike spytial-py and spytial-rust, this package pins no patch version: the
# peer range is a caret and every CDN tag floats on the major, so a core release
# normally needs no change here at all (test/pins.test.mjs enforces that). The
# one thing that does not float is the *language*. Core's parser ignores
# everything it does not recognize, so a release that adds a form, moves one to
# the other section, or retires a spelling would otherwise leave spytial-gdl
# accepting exactly what it accepted before — emitting a spec core silently
# drops part of, with no error anywhere.
#
# So this script pulls the schema from the newest release on the peer major and
# regenerates from it. The generator refuses to emit output it cannot account
# for, so a release that adds a construct stops here by name rather than
# disappearing.
#
# Usage:  ./scripts/update-spytial-core.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_SCHEMA="$REPO_ROOT/vendor/spytial-spec.schema.json"
GENERATOR="$REPO_ROOT/scripts/generate-spec-tables.mjs"
TABLES="$REPO_ROOT/src/_spec-tables.js"

for f in "$VENDOR_SCHEMA" "$GENERATOR" "$TABLES"; do
    [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
done

read_json() { node -e "process.stdout.write(String(require('$1')$2))"; }

RANGE="$(read_json "$REPO_ROOT/package.json" ".peerDependencies['spytial-core']")"
MAJOR="${RANGE#^}"; MAJOR="${MAJOR%%.*}"
CURRENT_CORE="$(read_json "$VENDOR_SCHEMA" "['x-spytial-core-version']")"
CURRENT_LANG="$(read_json "$VENDOR_SCHEMA" "['x-spytial-language-version']")"

# The newest release on the major this package supports. Deliberately not
# `@latest`: if core has shipped a new major, that is a breaking change to walk
# into on purpose, not one to vendor by running a script.
# Sorted here rather than trusted from npm: the array comes back in whatever
# order the registry gives, so a patch back-published to an older minor could
# otherwise land last and be read as the newest.
LATEST="$(npm view "spytial-core@^$MAJOR" version --json \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
const v=JSON.parse(s), all=Array.isArray(v)?v:[v];
const key=x=>x.split('.').map(Number);
all.sort((a,b)=>{const [A,B]=[key(a),key(b)];return A[0]-B[0]||A[1]-B[1]||A[2]-B[2]});
process.stdout.write(all[all.length-1])})")"
NEWEST="$(npm view spytial-core version)"

echo "peer range:      $RANGE"
echo "vendored schema: spytial-core $CURRENT_CORE (language $CURRENT_LANG)"
echo "newest on ${MAJOR}.x:    $LATEST"
if [[ "${NEWEST%%.*}" != "$MAJOR" ]]; then
    echo
    echo "NOTE: spytial-core $NEWEST is out, past the ${MAJOR}.x this package supports."
    echo "      Widen peerDependencies and float the CDN tags first; this script"
    echo "      stays on ${MAJOR}.x so a major cannot arrive as a side effect."
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
( cd "$TMP" && npm pack "spytial-core@$LATEST" --silent >/dev/null && tar xzf "spytial-core-$LATEST.tgz" )

PACKED="$TMP/package/docs/spytial-spec.schema.json"
[[ -f "$PACKED" ]] || { echo "spytial-core@$LATEST ships no docs/spytial-spec.schema.json" >&2; exit 1; }
cp "$PACKED" "$VENDOR_SCHEMA"

NEW_LANG="$(read_json "$VENDOR_SCHEMA" "['x-spytial-language-version']")"
node "$GENERATOR"

echo
if [[ "$NEW_LANG" == "$CURRENT_LANG" ]]; then
    echo "Language unchanged ($NEW_LANG) — nothing in src/_spec-tables.js needed revisiting."
else
    echo "Language moved $CURRENT_LANG -> $NEW_LANG."
    echo "The diff in src/_spec-tables.js IS the language change; read it before anything else."
fi
echo
echo "Next:"
echo "  1. git diff src/_spec-tables.js"
echo "  2. npm test. test/spec-tables.test.mjs names whatever hand-written surface"
echo "     is now behind — a rewrite that no longer lands on a live form, a"
echo "     deprecation policy that changed, a block that moved."
echo "  3. If a form was newly deprecated, decide in generate-spec-tables.mjs"
echo "     whether spytial-gdl rewrites it (desugars: true, and teach"
echo "     desugarLegacy the mapping) or just warns."
