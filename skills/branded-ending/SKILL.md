---
name: branded-ending
description: Compose or revise an editable branded ending from a name, URL, logo or short message. Use for outros, closing cards and end slates, including brief requests such as “make a cool ending.”
---

# Branded ending

Turn a short request into a deliberate final impression. Choose a treatment from
the supplied identity and project context; the user should not need to prescribe
coordinates, fonts or easing curves.
Study the attached reference board and notes: assembly, depth and typographic
transformation are distinct ways to earn a final lockup. Adapt a visual action,
not a complete sample layout, its words or its branding.

## Resolve the ending

Use the current project facts or a targeted `inspect_project` read to establish
the canvas, fps, scope, existing visual language and complete timeline end. For
an existing composition, append after the later of its format duration and all
retained item end frames, including audio and graphics. A selected clip is not
necessarily the whole ending point. Preserve the existing composition. An empty
project can start a standalone ending at frame zero.

Keep the supplied name, URL and message exact. Treat a URL as display text; it
does not require browsing or downloading a logo. Use an existing owned logo if
available. A missing logo is not a reason to stop a text-led ending. Ask only for
essential missing identity or conflicting placement; choose unspecified styling
and timing yourself. For a short URL, roughly three to four seconds is a useful
starting point, with a substantial still hold after the entrance.

## Choose a visual idea

Decide how the ending transforms into the identity: a visual object assembles,
space opens, a ribbon becomes a frame, or monumental type settles into a lockup.
Choose a clear action and carry it across the composition. Use a strong silhouette
or framing change before the final reading hold. A border/underline card or a
glowing URL can be a final pose, but a fade alone is a limited response to an
expressive brief. A calm or minimal brief can still use one precise transformation.

Decide what the viewer should remember, then build one coherent gesture around
it. Let the project's tone guide the choice:

- A restrained brand can resolve an offset line or shape into a calm typographic
  lockup, with generous negative space and a slow settling motion.
- A playful brand can reveal the identity through a compact burst, elastic
  lettering or a few illustrated shapes that settle away from the text.
- A technical or cinematic brand can use an architectural line, a framed reveal
  or a small depth composition, then leave the identity clean and motionless.

These are starting directions, not required templates. “Cool” does not require
3D, neon, confetti or an invented slogan. Use the brand's established colors when
known; otherwise choose a small contrasting palette. Fit the complete URL or
message before adding decoration. A long domain needs a different composition
from a two-word name, not a cropped or arbitrarily shortened spelling.
Check identity size at a phone-width display. Use the canvas width and sensible
breaks at URL boundaries before shrinking the hero identity into tiny type.

## Build the editable result

Use `inspect_graphics_schema` for the chosen installed macro or unfamiliar
native grammar. `titleCard` and `kineticText` are useful building blocks; native
text and shapes allow a more specific composition. Use `prepare_svg_graphic` or
`prepare_three_scene` when that chosen visual idea benefits from them. Keep text
editable and use only owned or registered assets.

Use `insertGraphic` for an appended ending and include the composition's
`format.durationInFrames` extension to the ending's end in the same complete
command batch. Do not use `prepare_text_overlay` for this append operation: that
helper fits an overlay inside the existing timeline and cannot extend it.

Place the ending in a stable grouped graphic item with its own identity. Its
child animation clocks start locally; do not repeat the absolute project start
inside every child. Choreograph arrival, readable hold and a resolved final pose.
Keep the exact identity fully visible and inside the canvas through the final
frame, including the opacity and transforms of its ancestor groups. Do not fade
it to zero or move it offscreen at the ending's end. For `titleCard` or
`kineticText`, explicitly use `exit: "none"` rather than accepting their default
exit. Decorative motion may resolve around the held identity. Make the final
composition duration agree with the ending's end; do not leave unrelated blank
padding afterward.
Keep absolute child layouts inside plain positioned groups rather than centered
flex parents. Keep the exact domain in a native text child when using a larger
graphic composition; macro roots do not necessarily expose a native `text`
property. Bind completion checks to the actual installed node grammar before
freezing them, and repair the authored structure without replacing frozen checks.

Review the complete command batch through `review_edit`, including the exact
identity text, appended placement and final duration in the supported completion
checks. For a follow-up such as “make it calmer,” revise the existing ending's motion and
styling while keeping its identity, text and placement unless the user changes them.

<!-- requires-tool:request_project_preview -->

Before finalizing, use `request_project_preview` to inspect an owned candidate at its entrance, readable hold and final pose.
Check complete text, contrast against the actual background, safe margins and a
clean finish. Correct visible defects through the existing bounded repair flow;
inspect its required second preview before finalizing a repaired candidate.

<!-- /requires-tool -->

Finalize the retained successful review with `propose_edit({reviewed:true})`,
including the required preview receipt when the host's visual flow was used.
