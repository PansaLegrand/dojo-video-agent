// Authoring inputs for two tool-loop specimens. All geometry compiles to editable native nodes.
const W = 1280,
  H = 720,
  D = 240;
const ease = "cubic-bezier(0.20, 0.76, 0.23, 1)";
const inkEase = "cubic-bezier(0.12, 0.78, 0.16, 1)";
const box = (left, top, width, height) => ({
  position: "absolute",
  left,
  top,
  width,
  height,
});
const curve = (property, keys) => ({
  kind: "keyframes",
  property,
  frames: keys.map(([frame, value, easing]) => ({
    frame,
    value,
    ...(easing ? { easing } : {}),
  })),
});
const rise = (at, to, distance) =>
  curve("transform", [
    [0, `translate(0px, ${distance}px)`],
    ...(at ? [[at, `translate(0px, ${distance}px)`]] : []),
    [to, "translate(0px, 0px)", ease],
  ]);
const enter = (a, b) =>
  curve("opacity", [[0, 0], ...(a ? [[a, 0]] : []), [b, 1, ease]]);
const rectangle = (id, x, y, w, h, backgroundColor, animations = []) => ({
  id,
  type: "div",
  style: { ...box(x, y, w, h), backgroundColor },
  animations,
});
const group = (id, children, animations = [], style = box(0, 0, W, H)) => ({
  id,
  type: "div",
  style,
  children,
  animations,
});
const shape = (id, x, y, w, h, d, fill, extra = {}) => ({
  id,
  type: "shape",
  shape: { kind: "path", d, viewBox: { x: 0, y: 0, width: w, height: h } },
  style: { ...box(x, y, w, h), fill, ...extra },
});
const ellipse = (id, x, y, w, h, fill, extra = {}) => ({
  id,
  type: "shape",
  shape: { kind: "ellipse" },
  style: { ...box(x, y, w, h), fill, ...extra },
});
const word = (
  id,
  text,
  x,
  y,
  w,
  h,
  family,
  size,
  weight,
  color,
  spacing,
  animations = [],
) => ({
  id,
  type: "text",
  text,
  style: {
    ...box(x, y, w, h),
    fontFamily: family,
    fontSize: size,
    fontWeight: weight,
    color,
    lineHeight: 1,
    maxLines: 1,
    letterSpacing: spacing,
  },
  animations,
});
const paint = (...nodes) => nodes;

function moonGarden() {
  const ground = "#21172E",
    paper = "#F8EFDA",
    violet = "#BBA3EC",
    citron = "#DDF583";
  const cx = 933,
    cy = 325;
  const background = {
    id: "plum-paper",
    type: "div",
    style: {
      ...box(0, 0, W, H),
      background:
        "radial-gradient(circle at 73% 41%, #3A2B42 0%, #291E35 49%, #1C1627 100%)",
    },
  };
  const stem = shape(
    "curved-stem",
    650,
    290,
    360,
    430,
    "M 86 430 C 174 340 257 199 282 35",
    "transparent",
    { stroke: "#969575", strokeWidth: 3 },
  );
  const leaf = shape(
    "folded-leaf",
    697,
    489,
    204,
    133,
    "M 104 104 Q 24 126 6 29 Q 79 21 104 104 Z M 107 96 Q 113 30 191 7 Q 197 61 107 96 Z",
    "#70677A",
  );
  const veins = shape(
    "leaf-veins",
    697,
    489,
    204,
    133,
    "M 104 104 Q 53 71 13 34 M 107 96 Q 146 48 185 14",
    "transparent",
    { stroke: ground, strokeWidth: 1.8 },
  );
  const botanical = [stem, leaf, veins];
  for (const [layer, count, baseW, baseH] of [
    ["outer", 12, 108, 218],
    ["inner", 9, 72, 146],
  ]) {
    for (let i = 0; i < count; i++) {
      const w = Math.round(baseW * (1 + 0.07 * Math.sin(i * 1.7))),
        h = Math.round(baseH * (1 + 0.07 * Math.cos(i * 1.4)));
      const seed = layer + "-" + i,
        angle = i * (360 / count) + (layer === "outer" ? 10 : 22);
      const outline = `M ${w * 0.5} ${h} C ${-w * 0.08} ${h * 0.6} ${w * 0.06} ${h * 0.18} ${w * 0.44} 0 C ${w * 0.99} ${h * 0.15} ${w * 1.05} ${h * 0.66} ${w * 0.5} ${h} Z`;
      const shade =
        layer === "outer"
          ? ["#72678F", "#9E88C1", "#AC98CC", "#8775A3"][i % 4]
          : ["#DAC6E3", "#CBB3DA", "#B8A6CE"][i % 3];
      const silk = `linear-gradient(158deg, ${layer === "outer" ? "#C2B5D5" : "#F4E0DC"} 0%, ${shade} 47%, ${layer === "outer" ? "#514360" : "#766084"} 98%)`;
      const petal = shape(seed + "-silk", 0, 0, w, h, outline, silk, {
        stroke: ground,
        strokeWidth: 1.1,
      });
      const pt = (x, y) => `${(x * w).toFixed(2)} ${(y * h).toFixed(2)}`;
      const etch = `M ${pt(0.5, 0.96)} Q ${pt(0.62, 0.51)} ${pt(0.44, 0.074)} M ${pt(0.5, 0.9)} Q ${pt(0.35, 0.68)} ${pt(0.19, 0.46)} M ${pt(0.51, 0.8)} Q ${pt(0.57, 0.5)} ${pt(0.71, 0.32)} M ${pt(0.51, 0.72)} Q ${pt(0.36, 0.52)} ${pt(0.27, 0.31)} M ${pt(0.51, 0.6)} Q ${pt(0.54, 0.41)} ${pt(0.58, 0.24)}`;
      const vein = shape(seed + "-crease", 0, 0, w, h, etch, "transparent", {
        stroke: layer === "outer" ? "#645574" : "#9C819F",
        strokeWidth: 1,
        opacity: 0.72,
      });
      const delay = (layer === "outer" ? 8 : 34) + i * 2;
      botanical.push(
        group(
          seed,
          [petal, vein],
          [
            curve("transform", [
              [0, `rotate(${angle - 28}deg) scale(0.48, 0.17)`],
              [delay, `rotate(${angle - 28}deg) scale(0.48, 0.17)`],
              [delay + 54, `rotate(${angle + 2}deg) scale(1.02, 1.02)`, ease],
              [delay + 97, `rotate(${angle}deg) scale(1, 1)`, "easeInOut"],
            ]),
          ],
          {
            ...box(cx - w / 2, cy - h, w, h),
            transformOrigin: "center bottom",
          },
        ),
      );
    }
  }
  botanical.push(ellipse("flower-disc", cx - 35, cy - 35, 70, 70, "#46374D"));
  const pollen = [];
  for (let i = 0; i < 36; i++) {
    const a = i * 2.399963,
      r = 4.4 * Math.sqrt(i);
    pollen.push(
      ellipse(
        "pollen-" + i,
        cx + Math.cos(a) * r - 2.8,
        cy + Math.sin(a) * r - 2.8,
        5.6,
        5.6,
        i % 4 ? citron : "#C3A46E",
      ),
    );
  }
  botanical.push(group("heart-opens", pollen, [enter(103, 139)]));
  const wings = [
    shape(
      "moth-wing-left",
      0,
      0,
      72,
      37,
      "M 36 21 Q 17 5 1 1 Q 6 18 23 24 L 12 28 Q 23 36 35 26 Z",
      paper,
    ),
    shape(
      "moth-wing-right",
      0,
      0,
      72,
      37,
      "M 36 21 Q 53 2 71 0 Q 64 20 49 24 L 57 29 Q 45 35 36 26 Z",
      citron,
    ),
    shape(
      "moth-spine",
      0,
      0,
      72,
      37,
      "M 36 13 Q 39 18 37 29 L 35 33 Q 34 21 36 13 Z",
      ground,
    ),
  ];
  const moth = group(
    "night-visitor",
    wings,
    [
      enter(48, 70),
      curve("left", [
        [0, 1204],
        [48, 1204],
        [85, 1114, "easeInOut"],
        [105, 1037, "easeInOut"],
        [133, 921, "easeInOut"],
        [165, 955, "easeInOut"],
      ]),
      curve("top", [
        [0, 546],
        [48, 546],
        [85, 352, "easeOut"],
        [105, 366, "easeInOut"],
        [133, 285, "easeInOut"],
        [165, 260, "easeInOut"],
      ]),
      curve("transform", [
        [0, "rotate(-24deg) scale(0.65, 0.8)"],
        [63, "rotate(-24deg) scale(0.65, 0.8)"],
        [76, "rotate(-15deg) scale(0.94, 0.85)"],
        [87, "rotate(-9deg) scale(0.4, 0.8)"],
        [101, "rotate(-22deg) scale(0.94, 0.86)"],
        [115, "rotate(-18deg) scale(0.44, 0.8)"],
        [131, "rotate(-9deg) scale(0.87, 0.85)"],
        [145, "rotate(8deg) scale(0.50, 0.82)"],
        [164, "rotate(13deg) scale(0.88, 0.85)", ease],
      ]),
    ],
    box(1204, 546, 72, 37),
  );
  const paperDetail = group("specimen-marks", [
    rectangle("top-rule", 82, 69, 1116, 1, "#685A70"),
    rectangle("bottom-rule", 82, 651, 1116, 1, "#685A70"),
    shape(
      "moon-seal",
      82,
      92,
      39,
      39,
      "M 7 2 C -7 23 5 38 22 38 C 30 38 36 34 38 29 C 20 34 3 22 7 2 Z",
      paper,
    ),
    ...[0, 1, 2, 3, 4, 5, 6].map((i) =>
      rectangle(
        "field-mark-" + i,
        1118 + i * 13,
        96,
        1,
        i % 3 ? 8 : 16,
        "#A893B2",
      ),
    ),
    ellipse("opening-signal", 82, 523, 11, 11, citron),
  ]);
  const lettering = group("nocturne-lettering", [
    word(
      "night",
      "Night",
      72,
      154,
      596,
      145,
      "Fraunces",
      131,
      550,
      paper,
      -5.5,
      [rise(0, 41, 20)],
    ),
    word(
      "garden",
      "Garden",
      79,
      303,
      610,
      148,
      "Fraunces",
      132,
      620,
      paper,
      -6.6,
      [enter(13, 51), rise(13, 58, 26)],
    ),
    word(
      "after-hours",
      "Botanical after hours",
      106,
      507,
      475,
      47,
      "IBM Plex Mono",
      25,
      500,
      violet,
      0.2,
      [enter(44, 82)],
    ),
  ]);
  return paint(
    background,
    group("botanical-study", botanical),
    paperDetail,
    lettering,
    moth,
  );
}

function inkPress() {
  const stock = "#F6C5BB",
    ink = "#252035",
    red = "#BC3827";
  const silhouette =
    "M 220 99 C 178 86 89 17 8 14 C 21 68 52 126 111 143 L 154 154 Q 105 174 76 164 C 88 216 144 230 189 166 L 213 139 Q 206 173 220 209 Q 234 171 227 139 L 251 166 C 296 230 352 216 364 164 Q 335 174 286 154 L 329 143 C 388 126 419 68 432 14 C 351 17 262 86 220 99 Z";
  const register = curve("transform", [
    [0, "translate(76px, -23px)"],
    [26, "translate(76px, -23px)"],
    [50, "translate(-14px, 10px)", inkEase],
    [67, "translate(-8px, 7px)", "easeInOut"],
  ]);
  const magenta = group(
    "red-plate",
    [shape("first-impression", 767, 48, 440, 240, silhouette, red)],
    [register],
  );
  const black = group("ink-plate", [
    shape("cut-paper-moth", 767, 48, 440, 240, silhouette, ink),
    shape(
      "antennae",
      767,
      48,
      440,
      240,
      "M 220 117 Q 217 79 198 63 M 220 117 Q 224 78 244 62",
      "transparent",
      { stroke: ink, strokeWidth: 3.5 },
    ),
  ]);
  const marks =
    "M 37 38 Q 108 54 173 107 Q 103 70 37 38 Z M 404 38 Q 331 54 267 107 Q 337 70 404 38 Z M 104 185 Q 143 181 175 148 Q 153 190 104 185 Z M 336 185 Q 297 181 265 148 Q 288 190 336 185 Z";
  const marksLayer = group(
    "last-plate",
    [
      shape("wing-cuts", 767, 48, 440, 240, marks, stock),
      ...[-1, 1].flatMap((sign) => [
        ellipse("eye-" + sign, 979 + sign * 111 - 13, 145, 27, 16, red),
        ellipse("eye-light-" + sign, 979 + sign * 111 - 3, 147, 7, 7, stock),
      ]),
    ],
    [enter(93, 123)],
  );
  const stripe = rectangle("pull-of-ink", 0, 323, W, 278, ink, [
    curve("width", [
      [0, 22],
      [30, 22],
      [72, W, inkEase],
    ]),
  ]);
  const bars = group(
    "printed-stripes",
    Array.from({ length: 7 }, (_, i) =>
      rectangle("cut-" + i, 61 + i * 15, 524, 6, 40, red),
    ),
    [enter(62, 77)],
  );
  const upper = word(
    "night",
    "NIGHT",
    54,
    32,
    710,
    273,
    "Anton",
    235,
    400,
    ink,
    -5,
    [rise(0, 34, 15)],
  );
  const lower = word(
    "garden",
    "GARDEN",
    226,
    362,
    1000,
    257,
    "Anton",
    231,
    400,
    stock,
    -2,
    [enter(52, 78), rise(52, 84, 22)],
  );
  const lowerLine = rectangle("fold-rule", 60, 630, 1160, 2, ink);
  const subtitle = word(
    "after-hours",
    "Botanical after hours",
    61,
    646,
    684,
    55,
    "Space Grotesk",
    34,
    600,
    ink,
    -0.8,
    [enter(65, 79)],
  );
  const plates = [ink, red, stock].map((c, i) =>
    ellipse("ink-sample-" + i, 1119 + i * 25, 658, 20, 20, c, {
      stroke: ink,
      strokeWidth: 1.5,
    }),
  );
  return paint(
    rectangle("shell-stock", 0, 0, W, H, stock),
    magenta,
    black,
    marksLayer,
    group("headline", [upper]),
    stripe,
    bars,
    group("second-impression", [lower]),
    group("imprint", [lowerLine, subtitle, ...plates]),
  );
}

export function designEdit(direction) {
  const nodes =
    direction === "nocturne"
      ? moonGarden()
      : direction === "press"
        ? inkPress()
        : null;
  if (!nodes) throw Error("Unknown direction");
  const commands = nodes.map((n) => ({
    type: "insertGraphic",
    itemId: n.id,
    trackId: "visual",
    name: n.id.replaceAll("-", " "),
    node: { ...n, from: 0, duration: D },
  }));
  const texts =
    direction === "press" ? ["NIGHT", "GARDEN"] : ["Night", "Garden"];
  const first = direction === "press" ? "headline" : "nocturne-lettering",
    second = direction === "press" ? "second-impression" : first,
    last = direction === "press" ? "imprint" : first;
  const requirements = [
    [first, "night", texts[0]],
    [second, "garden", texts[1]],
    [last, "after-hours", "Botanical after hours"],
  ].map(([itemId, nodeId, equals]) => ({
    id: nodeId,
    kind: "property",
    target: { kind: "node", itemId, nodeId },
    path: ["text"],
    equals,
  }));
  return {
    requirements,
    edit: {
      summary: "Compose Night Garden as " + direction,
      outcome: "proposal",
      commands,
    },
  };
}
