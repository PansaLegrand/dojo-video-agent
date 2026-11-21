# R33 measured visual review candidate

Kit 0.2.11 adds bounded interval inspection and numeric frame comparison under the existing local v14/commercial v15 profile. The default local host still starts 0.2.10; set `DOJO_VISUAL_REVIEW=1` before starting the server to select the candidate for new runs. The saved run freezes both its kit version and `authoring.visualReview: "sequence-v1"`. Restarting an older run never upgrades it.

`sample_video_frames` accepts an inclusive `intervalMs` and `tileCount` from 4 to 16. `request_project_preview` accepts `intervalFrames` with the same count. These produce one JPEG with per-tile decoded timestamps, crop rectangles and sampled coverage. Individual frame requests remain supported. Optional `analysis` selects a normalized region and RGB background for measurements.

`compare_preview_frames` reads two owned saved receipts. It reports luma, edge density, chroma accents, relative foreground size, displacement and clipping. Motion estimates require a stable, isolated translating subject. Empty, ambiguous or clipped motion regions do not produce a quality pass. Small contact-sheet tiles cannot verify fine text; inspect a separate held frame for that.

The existing consent, receipt, source-revision and preview-repair paths own this work. One successful correction still requires a second candidate preview. The existing 16-image/1.5-MiB run limit remains; sequence requests additionally cap decoding at 64 sampled frames per run. Reusing a saved receipt does not consume a new decoding allowance.

Implementation proof: 16 browser assertions passed against these portable modules, including a single-frame flash, exact decoded PTS, real engine preview capture, byte limits, cancellation and saved replay. Local host tests cover scope freezing, the decoded-frame cap, replay after budget exhaustion and retained tool contracts. The repair coordinator test covers a sampled issue followed by its required second preview. These are synthetic/offline checks; actual-model aesthetic qualification and default promotion are pending.
