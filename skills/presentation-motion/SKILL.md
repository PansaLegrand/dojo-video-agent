---
name: presentation-motion
description: Animate supplied slide content, diagrams and presentation sequences as editable video. Use for pitch, training and explainer slides where motion reveals relationships; this does not parse or export a PowerPoint file.
metadata: {"dojo-family":"creative"}
---

# Presentation motion

Make the audience understand one idea at a time. Study the attached
[reference board](references/atlas.jpg) and [motion notes](references/atlas.md)
for information hierarchy, diagram builds and transitions between contexts.

## Start with the supplied argument

Use existing native slide elements, supplied text or owned slide images. Preserve
headings, bullets, facts, chart data, citations and logical order. Ask one focused
question when essential content is absent. Do not invent market size, growth,
customers or a concluding claim to fill an attractive layout.

This skill authors video scenes. If a PPTX/PDF has not been imported into supported
assets or its content is unavailable, ask for usable slide content/images. Do not
claim to read the file or modify its source deck through an unavailable tool.
An image slide remains an image unless deliberately rebuilt as editable nodes
from supplied or properly inspected facts.

Identify the relationship: sequence, contrast, hierarchy, mechanism or part to
whole. Choose a reveal that explains it. A process can build along a shared
baseline; a contrast can establish both sides before emphasizing the difference;
a mechanism can separate and reconnect parts. Numerical charts belong primarily
to chart-storytelling, with their actual data and scale.

## Compose and pace the explanation

Give each scene a clear title, focal diagram and quiet reading space. Group
related elements so they move together. Reuse position, scale or color across
scenes to preserve the viewer's mental map. Follow the argument rather than
applying unrelated slide effects at every cut.

For a short request, choose a few meaningful builds and a settled summary. Do not
force every bullet into a dense six-second card: extend the authored interval
within scope or ask when the required duration conflicts with readable content.
Never silently omit material to improve spacing.

Keep project dimensions, frame rate, global background and unrelated slides.
Give the new scene its own backdrop. Preserve existing slide order; selecting
one slide is not permission to redesign the entire deck. Imported images must
retain their aspect ratio and readable regions. A static slide image does not
provide individually editable text or live interface controls.

## Build with available primitives

Use native text and shapes for titles, cards, connectors and emphasis. Read the
installed grammar for unfamiliar nodes/macros. Keep diagram labels and values
editable with stable IDs. Use plain positioned groups for absolute layouts and
local animation clocks inside groups.

Review supplied content, timing and retained items. `item_present` means a
timeline item, not a nested diagram node. Use supported child-text checks where
appropriate; do not replace frozen requirements to escape a rejected edit.
Finish the retained review through `propose_edit({reviewed:true})`.

<!-- requires-tool:inspect_image -->

When important content exists only in an owned slide image, use `inspect_image`
through the existing host consent/receipt flow. Findings cover that image, not
unseen slides. Never treat a filename as proof of its contents.

<!-- /requires-tool -->

<!-- requires-tool:request_project_preview -->

Inspect the densest build, transition and final reading pose. Check hierarchy,
connector endpoints, reading order, footnotes and collisions. Apply the existing
bounded repair and second-preview rules before finalizing corrections.

<!-- /requires-tool -->
