---
name: festival-motion
description: Compose or revise celebratory motion graphics for an event, launch, anniversary or festive message. Adapt the visual language to the occasion and supplied content instead of applying one fixed confetti layout.
---

# Festival motion

Build a small motion story with a distinctive visual idea. A short request is
enough: choose the art direction yourself. The attached reference board shows
three different visual languages and their progression through time. Study its
composition, depth and transitions before designing; the accompanying notes
explain what to adapt. Keep sample wording and figures out of the user's work.

## Find the occasion's character

Use the current project context or a targeted `inspect_project` read for the
canvas, requested placement, existing identity and supplied message. Preserve
names, URLs, dates and event details exactly. Do not invent a venue, price, sponsor,
performer or date. If an unspecified fact is unnecessary to the requested visual,
leave it out rather than interrupting the edit. Ask only when an essential fact or
scope decision prevents creating the requested result.

Choose a mood that fits the occasion, not merely the word “festival”:

- An elegant anniversary can use warm light, restrained ribbons and an uncluttered
  central identity with a measured reveal.
- A playful celebration can use paper-like shapes, illustrated motifs and buoyant
  staggered entrances that settle around the message.
- A night event can use strong contrast, rhythmic typography and a dimensional
  or vector centerpiece with a controlled burst of motion.

These directions are examples, not a closed menu. Adapt the motif, arrangement,
rhythm and colors to the actual brief. Do not presume cultural or religious symbols
from a locale or a person's name. An explicitly named tradition or supplied visual
reference may guide the design.

## Compose a small visual story

Choose a visual action that belongs to this occasion: something opens, unfolds,
assembles, travels or transforms to reveal the message. Express the concept in
one concise sentence in the edit summary. Let the composition change as that
action happens, then resolve into a strong final pose. A birthday might feel like
an illustrated paper stage opening for its recipient; a formal anniversary could
assemble a sculptural emblem. These are possibilities, not required scenes.

Make the reveal and final hold intentionally different compositions. Create a
foreground, focal subject and backdrop when depth serves the concept. Give type
a role in the action through a mask, scale transition, directional handoff or
framing change. Reserve calm space for the exact name/message. A centered age on
a disc with balloons/confetti is not the default finished answer; those motifs
need a purposeful transformation or a different underlying concept.

Choose a dominant focal point and keep the message readable. Build a progression
such as anticipation, reveal and celebration, with a held composition the viewer
can absorb. A short card may need only one clear gesture; a longer invitation can
support several beats. Let hierarchy and timing carry the story rather than
placing continuous motion on every element.

Balance dense accents with quiet space. Decorative particles, ribbons or shapes
should support the focal point and avoid crossing the important text during its
reading interval. Use a related palette and repeat a few motif shapes with varied
scale or depth. Do not rely on large quantities of identical particles for quality.
Vary composition when the content changes: a long event name, a portrait canvas
and an image-led invitation require different arrangements.

## Use the supported canvas

Read `inspect_graphics_schema` for unfamiliar native, macro or Three.js grammar.
Compose editable text and vector shapes, using `prepare_svg_graphic` for custom
illustration or `prepare_three_scene` for a purposeful 3D centerpiece. Choose 3D
for useful depth or choreography, not as a mandatory sign of polish. Named macros
can supply typography or transitions within a larger original composition.

Use installed, owned assets only. A request for festive motion does not itself
require generating music, external footage or a new Lottie asset. Do not invent
an asset URL, execute code from this skill, or call an unavailable authoring tool.
Represent repeated motion with supported, deterministic keyframes and stable IDs.
Keep child clocks local to their group; preserve the requested interval and paint
order so a backdrop cannot cover the centerpiece or message.
For an absolute composition, keep its parent a plain positioned group; do not
combine a centered flex parent with absolute child offsets. Native flex layout
does not behave like page CSS for that combination. Prefer one coherent method.
Put native name/age text on stable child IDs. Completion `item_present` targets a
timeline item, never a nested child; use a supported property check for child text.

Use `review_edit` on the complete candidate with checks for the exact event text,
placement and requested duration. For “more elegant” or “less busy,” revise the existing
palette, motif density and timing; retain the message, project identity and unrelated
content. Choose routine style details without another question; application policy
remains with the host.

<!-- requires-tool:request_project_preview -->

Before finalizing, use `request_project_preview` to inspect an owned candidate at the reveal, busiest moment and final hold.
Check that the intended mood is visible, the text survives the decoration, the
focal point remains inside the canvas and the ending resolves cleanly. Compare
the major poses with the reference's level of composition and change, rather
than accepting extra particles as evidence of quality. Use the
existing bounded repair flow and inspect its required second preview after repair.

<!-- /requires-tool -->

Finalize the retained successful review with `propose_edit({reviewed:true})`,
including the required preview receipt when the host's visual flow was used.
