---
name: festival-motion
description: Compose or revise celebratory motion graphics for an event, launch, anniversary or festive message. Adapt the visual language to the occasion and supplied content instead of applying one fixed confetti layout.
---

# Festival motion

Create a sense of occasion through composition and motion. A short request is
enough to choose an initial direction; the user does not need to specify a palette,
particle count, camera angle or animation curve.

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

Use `review_edit` on the complete candidate with checks for the exact event text,
placement and requested duration. For “more elegant” or “less busy,” revise the existing
palette, motif density and timing; retain the message, project identity and unrelated
content. Choose routine style details without another question; application policy
remains with the host.

<!-- requires-tool:request_project_preview -->

Before finalizing, use `request_project_preview` to inspect an owned candidate at the reveal, busiest moment and final hold.
Check that the intended mood is visible, the text survives the decoration, the
focal point remains inside the canvas and the ending resolves cleanly. Use the
existing bounded repair flow and inspect its required second preview after repair.

<!-- /requires-tool -->

Finalize the retained successful review with `propose_edit({reviewed:true})`,
including the required preview receipt when the host's visual flow was used.
