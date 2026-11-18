---
name: spatial-scenes
description: Compose editable 3D scenes, miniature worlds, exploded assemblies and cinematic depth sequences. Use when spatial geometry or camera motion is central, including explicit 3D celebrations; text animation and flat presentation diagrams have separate skills.
metadata: {"dojo-family":"creative"}
---

# Spatial scenes

Design a spatial event with a readable focal point. Study the attached
[reference board](references/atlas.jpg) and [motion notes](references/atlas.md)
for world scale, assembly and camera direction. Invent an appropriate composition;
do not copy the source's object count, labels or branding.

## Choose the spatial action

Resolve the canvas, interval and supplied subject from context. Choose ordinary
style details yourself, but ask for an essential missing product/subject fact.
Keep names, ages, labels, dimensions and claims exact. Present invented geometry
as a concept rather than implying engineering accuracy.

Choose an action: a miniature world assembles, parts separate and reconnect, a
camera passes through a structure, or an object opens to reveal its message.
Establish an opening composition, spatial change and resolved pose. A perpetual
orbit alone often shows an object without telling a visual story.

Start with the focal object, support/ground, a few depth layers and a purposeful
camera move. Related forms, lighting and material contrast create richness
without thousands of repeated objects. Make the subject legible before adding
detail. Place important text in quiet screen space, away from the busiest geometry.

## Use actual supported 3D

For an explicit 3D request, inspect the installed Three schema with
`inspect_graphics_schema({kind:"three"})` and build through `prepare_three_scene`.
Use supported geometry, materials, lighting and motion fields. Parameters are
declarative data, not executable Three.js code. Do not assume a GLTF loader,
procedural scripting engine, arbitrary shader or external texture URL exists.

Use stable object/material IDs and a camera that frames important geometry
throughout the movement. Read the schema's units for orbit, spin and keyframes;
do not confuse native timeline frames with 3D motion's declared time fields.
Avoid unnecessary camera roll, extreme clipping planes and rapid continuous
spins that make the subject difficult to read.

Keep exact messages in editable native text beside or over the 3D layer when
the geometry has no supported text primitive. A flat shadow treatment does not
satisfy an explicit 3D request. Layered 2D parallax is an alternative only when
it fits the request; describe that treatment accurately.

Keep document dimensions, frame rate and existing background settings unless
the user requests a format change. Author a native backdrop item behind the scene
for its palette, covering only the intended interval. Do not recolor unrelated
content by changing the global canvas background. Preserve paint order so the
backdrop stays behind the sculpture and the text remains readable.

## Review the spatial result

Review the complete batch, exact text and interval. `item_present` checks timeline
items, not individual meshes. Use supported property targets when declaring
requirements; repair the structure rather than replacing a frozen checklist.
Finalize the retained review with `propose_edit({reviewed:true})`.

<!-- requires-tool:request_project_preview -->

Inspect the opening, the widest/most separated pose and the final frame. Verify
visible geometry, real object/camera motion, lighting, framing and text contrast.
An invisible mesh or a declared spin is not proof of a useful rendered scene.
Follow the existing bounded repair and second-preview rules.

<!-- /requires-tool -->
