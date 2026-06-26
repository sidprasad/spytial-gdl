# Examples

*Runnable demos of every embedding mode — the integration, shipped as the site itself.*

The repository ships a set of self-contained example pages. They're deployed
alongside these docs, so each link below is a live page you can open, view source
on, and copy. Browse them all at the [examples index](../examples/).

## Live, here

A few inline, to show the modes side by side.

**A read-only diagram** — a labeled DAG with grouped layers:

```spytial-graph
ui[UI]:::Layer -> api[API]:::Layer : calls
api -> svc[Service]:::Layer : calls
svc -> db[(Store)]:::Layer : reads

@orientation(selector=_links, directions=[below])
@atomColor(selector=Layer, value='#dce8ff')
```

**An editable diagram** — drag it, or edit the source and **Run ▸**:

```spytial-graph-editable
root -> a : left
root -> b : right

@orientation(selector=left,  directions=[left])
@orientation(selector=right, directions=[right])
@orientation(selector=_links, directions=[below])
```

**A conflict** — the UNSAT core, attached below the diagram:

```spytial-graph
A -> B : up
B -> C : up
C -> A : up

@orientation(selector=up, directions=[above])
```

## The example pages

| example | what it shows |
|---|---|
| [drop-in.html](../examples/drop-in.html) | zero config — one script tag lights up a code block |
| [binary-tree.html](../examples/binary-tree.html) | the programmatic API — build a diagram from data |
| [editable.html](../examples/editable.html) | examine, update, and re-read a diagram's notation in code |
| [diagrams-that-edit-back.html](../examples/diagrams-that-edit-back.html) | an explorable post built on the editor — edit the picture, the source follows |
| [conflict.html](../examples/conflict.html) | the UNSAT core rendered under a clashing graph |
| [guide.html](../examples/guide.html) | the embedding guide, rendered live by spytial-graph itself |

## Essays, rendered live

- [Your diagram doesn't know what it's drawing](../examples/md-viewer.html?doc=your-diagram-doesnt-know.md)
  — the thesis: a flowchart can draw the graph; a model carries the meaning. Every
  diagram in it is live.

## The playground

For free-form experimentation with a View ⇄ Edit toggle and the conflict panel,
open the **[playground](../playground/)**. Paste any notation from these docs into
it and pull on the result.

## Next

- **[Getting started](getting-started.md)** — drop one of these into your own page.
- **[Architecture](architecture.md)** — how each example renders.
