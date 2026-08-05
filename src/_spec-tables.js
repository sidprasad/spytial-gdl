// Field tables and value vocabularies for the spytial layout-spec language.
//
// GENERATED FILE — DO NOT EDIT BY HAND.
//
//   Source:   vendor/spytial-spec.schema.json
//   Language: 2026-07-29 (spytial-core 4.4.1)
//   Regenerate with: node scripts/generate-spec-tables.mjs
//
// Everything here is derived from the JSON Schema spytial-core publishes, so a
// form, field, section, or vocabulary that changes upstream changes here as a
// diff in review rather than as a spec that quietly stops matching. Deliberate
// differences from the schema are declared in the generator's policy tables,
// each with its reason.

// The schema this was generated from. LANGUAGE_VERSION only moves when the spec
// language itself changes, so an unchanged value across a spytial-core bump
// means nothing here needed revisiting.
export const LANGUAGE_VERSION = "2026-07-29";
export const CORE_VERSION = "4.4.1";


// ── Vocabularies ────────────────────────────────────────────────────────────
//
// These are TypeScript union types in core, erased at runtime and re-checked by
// nothing downstream. An unrecognized value is kept by the parser and then does
// the wrong thing silently — an out-of-vocab pattern renders solid, an unknown
// flag name does nothing at all. Authoring time is the only place they surface.

export const LINE_PATTERNS = ["solid", "dashed", "dotted"];
export const TEXT_SIZES = ["small", "normal", "large"];
export const ICON_PLACEMENTS = ["full", "badge"];
export const FLAG_NAMES = ["hideDisconnected", "hideDisconnectedBuiltIns"];
export const ORIENTATION_DIRECTIONS = ["above", "below", "left", "right", "directlyAbove", "directlyBelow", "directlyLeft", "directlyRight"];


// ── Sections ────────────────────────────────────────────────────────────────
//
// Which bucket each annotation compiles into. Getting this wrong is not a
// no-op: core reads `size` and `hideAtom` from either section, but warns on the
// directives placement, so a spec built from the wrong table renders correctly
// and complains in the console forever.

export const CONSTRAINT_NAMES = new Set(["orientation", "cyclic", "align", "group", "size", "hideAtom"]);

export const DIRECTIVE_NAMES = new Set(["flag", "atomStyle", "edgeStyle", "attribute", "tag", "hideField", "inferredEdge", "icon", "atomColor", "edgeColor"]);

// Placements core still accepts behind a deprecation warning. spytial-gdl never
// emits one; this records that the tolerance exists.
export const DEPRECATED_PLACEMENTS = {
  size: {
    tolerated: "directives",
    home: "constraints",
  },
  hideAtom: {
    tolerated: "directives",
    home: "constraints",
  },
};


// ── Style blocks ────────────────────────────────────────────────────────────
//
// Written as nested calls — `lineStyle(color=crimson)` — and shared across
// items, so one table covers every use. Keyed by block name, then by leaf.
// spytial-gdl validates the leaves because core does not: an invalid pattern or
// size is dropped silently there, and the edge just renders unstyled.

export const STYLE_BLOCKS = {
  textStyle: {
    fields: {
      size: {
        type: "enum",
        values: ["small", "normal", "large"],
      },
      color: {
        type: "string",
      },
    },
  },
  lineStyle: {
    fields: {
      color: {
        type: "string",
      },
      pattern: {
        type: "enum",
        values: ["solid", "dashed", "dotted"],
      },
      weight: {
        type: "number",
        exclusiveMinimum: 0,
      },
      highlight: {
        type: "string",
      },
    },
  },
  fillStyle: {
    fields: {
      color: {
        type: "string",
      },
    },
  },
  borderStyle: {
    fields: {
      color: {
        type: "string",
      },
      width: {
        type: "number",
        exclusiveMinimum: 0,
      },
    },
  },
  iconStyle: {
    fields: {
      path: {
        type: "string",
      },
      placement: {
        type: "enum",
        values: ["full", "badge"],
      },
      opacity: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
    },
  },
  addEdge: {
    fields: {
      points: {
        type: "enum",
        values: ["none", "togroup", "fromgroup"],
      },
      lineStyle: {
        type: "block",
        block: "lineStyle",
      },
      textStyle: {
        type: "block",
        block: "textStyle",
      },
    },
  },
};


// ── Items ───────────────────────────────────────────────────────────────────
//
// Every annotation, by name: which section it belongs to and which fields it
// takes. `alternatives` is a list because two forms may share one name — the
// current `group` and its deprecated by-field spelling — and the one an
// annotation is checked against is the first whose required fields are present.
// `scalarKeyword` marks an item whose yaml value is a bare scalar rather than a
// mapping (`- flag: hideDisconnected`), naming the keyword that carries it.

export const ITEMS = {
  orientation: {
    section: "constraints",
    alternatives: [
      {
        yamlKey: "orientation",
        required: ["selector", "directions"],
        fields: {
          selector: {
            type: "string",
            minLength: 1,
          },
          directions: {
            type: "enum-list",
            values: ["above", "below", "left", "right", "directlyAbove", "directlyBelow", "directlyLeft", "directlyRight"],
            minItems: 1,
            listRules: [
              {
                kind: "exclusive",
                values: ["above", "below"],
              },
              {
                kind: "exclusive",
                values: ["left", "right"],
              },
              {
                kind: "requires",
                when: "directlyAbove",
                allowed: ["above", "directlyAbove"],
              },
              {
                kind: "requires",
                when: "directlyBelow",
                allowed: ["below", "directlyBelow"],
              },
              {
                kind: "requires",
                when: "directlyLeft",
                allowed: ["left", "directlyLeft"],
              },
              {
                kind: "requires",
                when: "directlyRight",
                allowed: ["right", "directlyRight"],
              },
            ],
          },
          hold: {
            type: "enum",
            values: ["always", "never"],
          },
        },
      },
    ],
  },
  cyclic: {
    section: "constraints",
    alternatives: [
      {
        yamlKey: "cyclic",
        required: ["selector"],
        fields: {
          selector: {
            type: "string",
            minLength: 1,
          },
          direction: {
            type: "enum",
            values: ["clockwise", "counterclockwise"],
          },
          hold: {
            type: "enum",
            values: ["always", "never"],
          },
        },
      },
    ],
  },
  align: {
    section: "constraints",
    alternatives: [
      {
        yamlKey: "align",
        required: ["selector", "direction"],
        fields: {
          selector: {
            type: "string",
            minLength: 1,
          },
          direction: {
            type: "enum",
            values: ["horizontal", "vertical"],
          },
          hold: {
            type: "enum",
            values: ["always", "never"],
          },
        },
      },
    ],
  },
  group: {
    section: "constraints",
    alternatives: [
      {
        yamlKey: "group",
        required: ["selector"],
        fields: {
          selector: {
            type: "string",
            minLength: 1,
          },
          name: {
            type: "string",
            minLength: 1,
          },
          addEdge: {
            type: "enum-or-block",
            values: ["none", "togroup", "fromgroup"],
            block: "addEdge",
            legacyValues: {
              true: "togroup",
            },
          },
          textStyle: {
            type: "block",
            block: "textStyle",
          },
          hold: {
            type: "enum",
            values: ["always", "never"],
          },
        },
      },
      {
        yamlKey: "group",
        required: ["field", "groupOn", "addToGroup"],
        fields: {
          field: {
            type: "string",
            minLength: 1,
          },
          groupOn: {
            type: "integer",
          },
          addToGroup: {
            type: "integer",
          },
          selector: {
            type: "string",
          },
          hold: {
            type: "enum",
            values: ["always", "never"],
          },
        },
        deprecated: {
          replacedBy: "group(selector=…)",
          desugars: false,
        },
      },
    ],
  },
  size: {
    section: "constraints",
    alternatives: [
      {
        yamlKey: "size",
        required: ["width", "height"],
        fields: {
          width: {
            type: "number",
            exclusiveMinimum: 0,
          },
          height: {
            type: "number",
            exclusiveMinimum: 0,
          },
          selector: {
            type: "string",
          },
        },
      },
    ],
  },
  hideAtom: {
    section: "constraints",
    alternatives: [
      {
        yamlKey: "hideAtom",
        required: ["selector"],
        fields: {
          selector: {
            type: "string",
            minLength: 1,
          },
        },
      },
    ],
  },
  flag: {
    section: "directives",
    alternatives: [
      {
        yamlKey: "flag",
        scalarKeyword: "name",
        required: ["name"],
        fields: {
          name: {
            type: "enum",
            values: ["hideDisconnected", "hideDisconnectedBuiltIns"],
          },
        },
      },
    ],
  },
  atomStyle: {
    section: "directives",
    alternatives: [
      {
        yamlKey: "atomStyle",
        required: [],
        fields: {
          selector: {
            type: "string",
          },
          fillStyle: {
            type: "block",
            block: "fillStyle",
          },
          borderStyle: {
            type: "block",
            block: "borderStyle",
          },
          iconStyle: {
            type: "block",
            block: "iconStyle",
          },
          textStyle: {
            type: "block",
            block: "textStyle",
          },
          showLabel: {
            type: "boolean",
          },
        },
      },
    ],
  },
  edgeStyle: {
    section: "directives",
    alternatives: [
      {
        yamlKey: "edgeStyle",
        required: ["field"],
        fields: {
          field: {
            type: "string",
            minLength: 1,
          },
          selector: {
            type: "string",
          },
          filter: {
            type: "string",
          },
          lineStyle: {
            type: "block",
            block: "lineStyle",
          },
          textStyle: {
            type: "block",
            block: "textStyle",
          },
          showLabel: {
            type: "boolean",
          },
          hidden: {
            type: "boolean",
          },
        },
      },
    ],
  },
  attribute: {
    section: "directives",
    alternatives: [
      {
        yamlKey: "attribute",
        required: ["field"],
        fields: {
          field: {
            type: "string",
            minLength: 1,
          },
          selector: {
            type: "string",
          },
          filter: {
            type: "string",
          },
          textStyle: {
            type: "block",
            block: "textStyle",
          },
        },
      },
    ],
  },
  tag: {
    section: "directives",
    alternatives: [
      {
        yamlKey: "tag",
        required: ["toTag", "name", "value"],
        fields: {
          toTag: {
            type: "string",
            minLength: 1,
          },
          name: {
            type: "string",
            minLength: 1,
          },
          value: {
            type: "string",
            minLength: 1,
          },
          textStyle: {
            type: "block",
            block: "textStyle",
          },
        },
      },
    ],
  },
  hideField: {
    section: "directives",
    alternatives: [
      {
        yamlKey: "hideField",
        required: ["field"],
        fields: {
          field: {
            type: "string",
            minLength: 1,
          },
          selector: {
            type: "string",
          },
          filter: {
            type: "string",
          },
        },
      },
    ],
  },
  inferredEdge: {
    section: "directives",
    alternatives: [
      {
        yamlKey: "inferredEdge",
        required: ["name", "selector"],
        fields: {
          name: {
            type: "string",
            minLength: 1,
          },
          selector: {
            type: "string",
            minLength: 1,
          },
          draw: {
            type: "string",
            pattern: "^\\s*[^\\s](?:(?!->)[\\s\\S])*->(?:(?!->)[\\s\\S])*[^\\s]\\s*$",
          },
          lineStyle: {
            type: "block",
            block: "lineStyle",
          },
          textStyle: {
            type: "block",
            block: "textStyle",
          },
          color: {
            type: "string",
          },
          style: {
            type: "enum",
            values: ["solid", "dashed", "dotted"],
          },
          weight: {
            type: "number",
            exclusiveMinimum: 0,
          },
          highlight: {
            type: "string",
          },
        },
        deprecatedFields: {
          color: {
            replacedBy: "inferredEdge.lineStyle.color",
            desugars: true,
          },
          style: {
            replacedBy: "inferredEdge.lineStyle.pattern",
            desugars: true,
          },
          weight: {
            replacedBy: "inferredEdge.lineStyle.weight",
            desugars: true,
          },
          highlight: {
            replacedBy: "inferredEdge.lineStyle.highlight",
            desugars: true,
          },
        },
      },
    ],
  },
  icon: {
    section: "directives",
    alternatives: [
      {
        yamlKey: "icon",
        required: ["selector", "path"],
        fields: {
          selector: {
            type: "string",
            minLength: 1,
          },
          path: {
            type: "string",
            minLength: 1,
          },
          showLabels: {
            type: "boolean",
          },
        },
      },
    ],
  },
  atomColor: {
    section: "directives",
    alternatives: [
      {
        yamlKey: "atomColor",
        required: ["value", "selector"],
        fields: {
          value: {
            type: "string",
            minLength: 1,
          },
          selector: {
            type: "string",
            minLength: 1,
          },
        },
      },
    ],
  },
  edgeColor: {
    section: "directives",
    alternatives: [
      {
        yamlKey: "edgeColor",
        required: ["field", "value"],
        fields: {
          field: {
            type: "string",
            minLength: 1,
          },
          value: {
            type: "string",
            minLength: 1,
          },
          selector: {
            type: "string",
          },
          filter: {
            type: "string",
          },
          style: {
            type: "enum",
            values: ["solid", "dashed", "dotted"],
          },
          weight: {
            type: "number",
            exclusiveMinimum: 0,
          },
          highlight: {
            type: "string",
          },
          showLabel: {
            type: "boolean",
          },
          hidden: {
            type: "boolean",
          },
        },
      },
    ],
  },
};


// ── Deprecations ────────────────────────────────────────────────────────────
//
// A deprecated form keeps parsing and keeps its meaning until a spytial-core
// major. `desugars` marks the ones annotations.js rewrites onto their
// replacement before emission, so the compiled spec uses the current spelling
// even when the source does not.

export const DEPRECATED_ITEMS = {
  icon: {
    replacedBy: "atomStyle",
    desugars: false,
  },
  atomColor: {
    replacedBy: "atomStyle",
    desugars: true,
  },
  edgeColor: {
    replacedBy: "edgeStyle",
    desugars: true,
  },
};
