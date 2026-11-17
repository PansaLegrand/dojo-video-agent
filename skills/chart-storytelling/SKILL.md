---
name: chart-storytelling
description: Create or revise an editable animated chart from supplied or selected data. Use for comparisons, trends, proportions and data-led explainers; ask for essential missing data instead of inventing business figures.
---

# Chart storytelling

Make the data relationship understandable, then use motion to reveal it. A chart
must contain marks whose sizes or positions encode the supplied values; an
animated heading or decorative counter alone does not satisfy the request.

## Establish the data and message

Use the user's supplied values or authoritative project context. Read only the
missing relevant facts. Preserve labels, units, signs, dates, reporting periods,
series identities and comparison bases. Do not invent results, convert missing
values into zero, or infer a trend from decorative footage. If “make a smooth
chart animation” supplies no data and none is available in scope, ask one concise
question for the values and labels. When the user explicitly requests a demo or
sample, invented data is acceptable only with a visible illustrative-data label.

Choose the relationship before the appearance:

- Categories or ranked amounts: bars. Horizontal bars often suit long labels.
- A chronological sequence: a line or clearly ordered bars; retain missing-data
  gaps rather than drawing a fictitious connection.
- Parts of a known whole: a proportional bar or grid, with its denominator and
  units. Do not call unrelated amounts percentages of a whole.
- One supplied metric: a scale-bearing mark or comparison plus its exact value,
  rather than a large unexplained number.

Use a neutral descriptive title when the data does not support a stronger claim.
Choose the layout, palette and pacing from the project context without making the
user supply a design brief. If there are many requested categories, adapt the
layout or use sequential panels; do not silently omit data to make a prettier chart.

## Map values before decorating

Choose a bounded plot area with room for labels. Use one consistent scale within
each comparison. For bars, include zero in the numeric domain; negative values
extend from the same zero baseline in the opposite direction. Do not encode
magnitude through perspective or arbitrary area changes. Keep units visible and
supplied value labels exact. Axis ticks can use a consistent, indicated unit
conversion; do not round or abbreviate the actual claim without authorization.

For a numeric domain `low..high`, place a value proportionally using
`(value - low) / (high - low)` over the plot span. Handle an all-equal or all-zero
series without division by zero. Category spacing and data spacing are different:
a time series with irregular intervals should not imply equal elapsed time.

The installed registry may not contain a dedicated chart macro. Discover the
actual native shape/text grammar with `inspect_graphics_schema`; do not invent a
`barChart` or `lineChart` tool. Build marks, labels and axes as editable nodes, or
use `prepare_svg_graphic` for suitable vector paths while keeping readable labels
as text. Give data marks and labels stable IDs so follow-up edits can target them.

## Choreograph the explanation

Keep axes and scale stable while values appear. A smooth reveal normally benefits
from eased growth or movement, modest staggering, then a settled reading interval.
Choose direction to match meaning: bars grow from their baseline; a trend unfolds
in time order; parts of a whole resolve into the full total. Avoid elastic
overshoot that temporarily suggests values beyond the data. Counters, if used,
must finish at the exact supplied value and not obscure the chart itself.

Use color to distinguish a series or an evidenced emphasis. Preserve series/color
identity across panels. One highlight is often clearer than giving every mark an
unrelated accent. For “make it smoother,” change easing and rhythm in the existing
chart; preserve data, units, scale, labels and unrelated project content.

Review the complete edit through `review_edit`. Check exact displayed values and
labels, proportional geometry, requested timing and preservation of existing
content.

<!-- requires-tool:request_project_preview -->

Before finalizing, use `request_project_preview` to inspect an owned candidate during the reveal and after it settles. Check
label collisions, readable axes, visible marks and agreement between the final
geometry and numbers. Follow the existing bounded repair and second-preview rules
for any correction. A structurally valid chart is not proof of a readable chart.

<!-- /requires-tool -->

Finalize the retained successful review with `propose_edit({reviewed:true})`,
including the required preview receipt when the host's visual flow was used.
