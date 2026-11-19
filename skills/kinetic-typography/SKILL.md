---
name: kinetic-typography
description: Make supplied words the moving visual subject—expressive titles, word-by-word reveals, motion posters and animated lettering. Use when typography carries the idea; caption transcription and a complete branded outro have their own skills.
metadata: {"dojo-family":"creative"}
---

# Kinetic typography

Turn the supplied copy into a visual sequence. Study the attached
[reference board](references/atlas.jpg) and [motion notes](references/atlas.md)
for scale changes, typographic contrast and deliberate reveal order. The host
loads these references with this skill; no separate fetch is needed.

## Find the typographic action

Read the canvas, intended interval and exact wording from project context. Choose
the treatment yourself when the user says “energetic,” “smooth” or “elegant.” Ask
for missing copy, not a list of fonts and keyframe coordinates. Preserve wording,
punctuation and language; do not add a slogan, statistic or endorsement.

Choose the emphasis from meaning: one decisive word can expand into the frame,
related words can assemble into a sentence, or a quiet line can become a bold
final statement. Build a distinct opening, transformation and readable final
phrase. Give motion a direction and a reason. Avoid unrelated entrance effects
on every word or using a glow fade as the whole concept.

Use size, weight, spacing, alignment and contrast as a related system. A large
display word and a restrained supporting line can work better than competing
typefaces. Decorative cropping can create energy, but the required message must
become complete and readable during its hold.

## Keep words editable

Use whole native text words/phrases where possible. Discover installed native or
`kineticText` grammar with `inspect_graphics_schema`; do not assume that a macro
root exposes a native `text` property. Bind completion checks to the actual text
target and supported property before freezing them.
If generated macro child IDs are not known, author native words with your own
stable IDs instead of guessing a root-text check. Each word can still have a
distinct reveal while the final phrase stays editable and correctly ordered.

For word reveals, keep the final reading order explicit through layout and timing.
For “make it calmer,” revise the same item IDs, spacing and motion amplitude while
preserving wording and interval. Use registered fonts or existing fallbacks;
do not claim unsupported variable-font axes or arbitrary font-outline extraction.

Stroke writing needs real owned vector paths or a registered Lottie asset with
appropriate stroke animation. A typewriter reveal is a different treatment. If
actual handwriting is essential and suitable paths are unavailable, explain the
supported alternative or request the asset rather than inventing a Lottie URL.

Keep global canvas settings and unrelated content intact. Use a native backdrop
inside the authored graphic for its palette. Absolute child layouts belong in
plain positioned groups; avoid centered flex layout with absolute offsets.
Use local child clocks and installed easing names. Finish with a substantial
reading hold rather than fading the message away at the final frame.

Review the complete batch through `review_edit`, checking exact words, placement,
duration and preservation. A successful receipt validates the declared checks,
not expressive quality. Finalize the exact retained review with
`propose_edit({reviewed:true})`.

<!-- requires-tool:request_project_preview -->

Inspect an owned preview at the most crowded transition and final phrase. Check
reading order, glyph clipping, contrast and whether motion communicates the
intended emphasis. Use the existing bounded repair flow and its second preview
before finalizing a corrected candidate.

<!-- /requires-tool -->
