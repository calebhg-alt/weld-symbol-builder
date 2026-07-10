// ============================================================
// SVG RENDERING ENGINE
// Draws: (1) a schematic cross-section of the joint members,
// (2) the AWS-style reference line / arrow / tail,
// (3) the weld symbol glyph(s), scaled by live parameters.
// Symbols are simplified for instructional clarity, not to
// exact AWS A2.4 drafting proportions (see on-page disclaimer).
// ============================================================

const SVG_NS = "http://www.w3.org/2000/svg";
const LINE_Y = 190;
const LINE_X1 = 330;
const LINE_X2 = 800;
const BASE_WIDTH = 900;
const SHEET_HEIGHT = 420;

function el(tag, attrs, children) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  (children || []).forEach(c => e.appendChild(c));
  return e;
}
function textEl(x, y, str, opts) {
  opts = opts || {};
  return el("text", {
    x, y,
    fill: opts.fill || "#E8EEF5",
    "font-family": opts.mono ? "'IBM Plex Mono', monospace" : "'IBM Plex Sans Condensed', sans-serif",
    "font-size": opts.size || 15,
    "font-weight": opts.weight || 600,
    "text-anchor": opts.anchor || "start"
  }, [document.createTextNode(str)]);
}

// Rough width estimate for IBM Plex Sans Condensed at a given font size —
// used only to decide how much extra sheet width the tail text needs.
function estimateTextWidth(str, fontSize) {
  return (str || "").length * fontSize * 0.62;
}

// Wraps text to a max pixel width by word, falling back to a hard character
// split for a single word that's wider than the line by itself.
function wrapText(str, maxWidth, fontSize) {
  const words = (str || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach(word => {
    const test = current ? current + " " + word : word;
    if (estimateTextWidth(test, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// ---------- Background blueprint grid ----------
function buildGrid(width) {
  const g = el("g", { "aria-hidden": "true" });
  for (let x = 0; x <= width; x += 30) {
    g.appendChild(el("line", { x1: x, y1: 0, x2: x, y2: SHEET_HEIGHT, stroke: "rgba(255,255,255,0.06)", "stroke-width": 1 }));
  }
  for (let y = 0; y <= SHEET_HEIGHT; y += 30) {
    g.appendChild(el("line", { x1: 0, y1: y, x2: width, y2: y, stroke: "rgba(255,255,255,0.06)", "stroke-width": 1 }));
  }
  g.appendChild(el("rect", { x: 6, y: 6, width: width - 12, height: SHEET_HEIGHT - 12, fill: "none", stroke: "rgba(255,255,255,0.22)", "stroke-width": 1.5 }));
  return g;
}

// ---------- Joint cross-section illustrations ----------
// Shared plate geometry — the single source of truth for both the drawn
// illustration and the arrow's collision-avoidance routing, so they can
// never drift out of sync with each other.
function getJointPlates(jointKey) {
  const cx = 130, cy = 250;
  switch (jointKey) {
    case "butt":
      return [
        { x: cx - 90, y: cy - 14, w: 82, h: 28 },
        { x: cx + 8, y: cy - 14, w: 82, h: 28 }
      ];
    case "tjoint":
      return [
        { x: cx - 90, y: cy + 10, w: 180, h: 24 }, // base, horizontal
        { x: cx - 12, y: cy - 70, w: 24, h: 82 }   // upright
      ];
    case "lap":
      return [
        { x: cx - 90, y: cy - 6, w: 100, h: 22 },
        { x: cx - 10, y: cy + 16, w: 100, h: 22 }
      ];
    case "corner":
      return [
        { x: cx - 90, y: cy - 10, w: 100, h: 22 },
        { x: cx - 2, y: cy - 92, w: 22, h: 92 }
      ];
    case "edge":
      return [
        { x: cx - 60, y: cy - 30, w: 120, h: 18 },
        { x: cx - 60, y: cy - 6, w: 120, h: 18 }
      ];
    default:
      return [];
  }
}

function buildJointIllustration(jointKey) {
  const g = el("g", {});
  const plateFill = "#8FA3C2";
  const plateStroke = "#E8EEF5";

  function plate(r) {
    return el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, fill: plateFill, stroke: plateStroke, "stroke-width": 2, opacity: 0.85 });
  }

  getJointPlates(jointKey).forEach(r => g.appendChild(plate(r)));
  return g;
}

function jointSeamPoint(jointKey) {
  const cx = 130, cy = 250;
  switch (jointKey) {
    // Root = the gap between the two plate edges, at mid-thickness.
    case "butt": return { x: cx, y: cy };
    // Root = the upright member's NEAR (left) face meeting the base plate surface —
    // not the upright's centerline, which would point through solid material.
    case "tjoint": return { x: cx - 12, y: cy + 10 };
    // Root = the edge of the top plate, at the surface of the plate beneath it.
    case "lap": return { x: cx + 10, y: cy + 16 };
    // Root = the outside vertex where the base plate's edge meets the upright —
    // using the upright's own outer edge (not a point inset from it), since a
    // point between the two edges falls inside the upright's bounding box
    // where the two plates intentionally overlap to look visually joined.
    case "corner": return { x: cx + 20, y: cy - 10 };
    // Root = the aligned edges of the two parallel plates.
    case "edge": return { x: cx + 60, y: cy - 9 };
    default: return { x: cx, y: cy };
  }
}

// Two distinct arrow targets per joint — one biased toward each of the two
// members — used when a bevel, J-groove, or flare-bevel weld is selected,
// so the person can explicitly designate WHICH member gets prepped instead
// of hoping the default arrow happens to point at the right one. Face A
// always matches the plain jointSeamPoint default, so nothing changes for
// existing behavior unless Face B is deliberately chosen.
function jointFacePoints(jointKey) {
  const cx = 130, cy = 250;
  switch (jointKey) {
    case "butt": return [{ x: cx - 8, y: cy, label: "Left plate" }, { x: cx + 8, y: cy, label: "Right plate" }];
    case "tjoint": return [{ x: cx - 12, y: cy + 10, label: "Upright (near)" }, { x: cx + 12, y: cy + 10, label: "Upright (far)" }];
    case "lap": return [{ x: cx + 10, y: cy + 16, label: "Top plate" }, { x: cx - 10, y: cy + 16, label: "Bottom plate" }];
    case "corner": return [{ x: cx + 20, y: cy - 10, label: "Base plate" }, { x: cx - 2, y: cy - 10, label: "Upright" }];
    case "edge": return [{ x: cx + 60, y: cy - 12, label: "Top plate" }, { x: cx + 60, y: cy - 6, label: "Bottom plate" }];
    default: return [{ x: cx, y: cy, label: "Root" }, { x: cx, y: cy, label: "Root" }];
  }
}

// Snap points shown (and clickable) during calibration — the same two face
// points, just exposed as a named list so clicking near one snaps to its
// exact coordinates instead of an imprecise raw pixel.
function getSnapPoints(jointKey) {
  return jointFacePoints(jointKey);
}

// A person-calibrated arrow target always wins over the built-in default —
// this is what lets the user correct the arrow position themselves instead
// of relying on hardcoded guesses.
function getEffectiveSeam(jointKey) {
  // Manual calibration always wins — the free-position option stays fully in control.
  if (state.arrowOverrides && state.arrowOverrides[jointKey]) {
    return state.arrowOverrides[jointKey];
  }
  const needsFace = (state.weld === "bevel" || state.weld === "j" || state.weld === "flarebevel");
  if (needsFace) {
    const faces = jointFacePoints(jointKey);
    return state.beveledFace === "B" ? faces[1] : faces[0];
  }
  return jointSeamPoint(jointKey);
}

// Samples a segment and reports whether it passes through the INTERIOR of
// any plate rect (a small inset avoids flagging the segment for merely
// touching a plate's edge, which is expected — the arrow is SUPPOSED to
// reach the joint, just not cut across solid material to get there).
// pad > 0 expands the plate outward before testing (stricter — flags the
// segment for merely coming close, used to keep real clearance from plates
// the arrow ISN'T targeting). pad < 0 shrinks the plate inward (lenient —
// only flags genuine deep penetration, used for the plate the arrow IS
// heading toward, since approaching it closely is the whole point).
function segmentHitsPlate(x1, y1, x2, y2, rects, pad) {
  pad = pad === undefined ? -2 : pad;
  const samples = 100;
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    for (const r of rects) {
      if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) return true;
    }
  }
  return false;
}

// Builds an arrow path (list of points) from the reference line to the
// joint's root that never cuts across a plate. Tries the direct line first;
// if that crosses a plate, routes around the joint's full bounding box via
// an elbow — trying both above and below it, and searching nearby elbow
// x-positions — until both segments are clear.
// Runs every time the arrow is drawn, so a calibrated (dragged) arrow
// re-routes automatically rather than needing a manual fix.
function computeArrowPath(ax1, ay1, seamX, seamY, jointKey) {
  const allRects = getJointPlates(jointKey);
  if (!allRects.length) return [{ x: ax1, y: ay1 }, { x: seamX, y: seamY }];

  // The plate nearest the target is expected to be approached closely —
  // that's the whole point of a root location — so it's excluded from the
  // wider-margin check. Every OTHER plate still needs real clearance,
  // otherwise a "safe" route can end up running flush along a neighboring
  // plate's edge, which is technically outside it but visually reads as
  // overlapping (especially with the plate's own stroke width).
  let nearestIdx = 0, nearestDist = Infinity;
  allRects.forEach((r, i) => {
    const cx = Math.max(r.x, Math.min(seamX, r.x + r.w));
    const cy = Math.max(r.y, Math.min(seamY, r.y + r.h));
    const d = Math.hypot(seamX - cx, seamY - cy);
    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
  });
  const targetRect = [allRects[nearestIdx]];
  const otherRects = allRects.filter((_, i) => i !== nearestIdx);
  const CLEARANCE = 8; // expand other plates outward by this much when checking

  function pathIsClear(x1, y1, x2, y2) {
    return !segmentHitsPlate(x1, y1, x2, y2, otherRects, CLEARANCE) &&
           !segmentHitsPlate(x1, y1, x2, y2, targetRect, -2);
  }

  if (pathIsClear(ax1, ay1, seamX, seamY)) {
    return [{ x: ax1, y: ay1 }, { x: seamX, y: seamY }];
  }
  const minY = Math.min(...allRects.map(r => r.y));
  const maxY = Math.max(...allRects.map(r => r.y + r.h));
  const candidates = [minY - 20, maxY + 20]; // try routing above, then below
  for (const safeY of candidates) {
    for (let dx = 0; dx <= 100; dx += 8) {
      for (const sign of [1, -1]) {
        const ex = seamX + sign * dx;
        if (!segmentHitsPlate(ax1, ay1, ex, safeY, allRects, CLEARANCE) && pathIsClear(ex, safeY, seamX, seamY)) {
          return [{ x: ax1, y: ay1 }, { x: ex, y: safeY }, { x: seamX, y: seamY }];
        }
      }
    }
  }
  // Fallback: route around the bounding box's corner via two elbows — clears
  // the top, then approaches the target from whichever side is closer.
  const minX = Math.min(...allRects.map(r => r.x));
  const maxX = Math.max(...allRects.map(r => r.x + r.w));
  const cornerX = seamX <= (minX + maxX) / 2 ? minX - 20 : maxX + 20;
  return [{ x: ax1, y: ay1 }, { x: cornerX, y: minY - 20 }, { x: cornerX, y: seamY }, { x: seamX, y: seamY }];
}


// ---------- Reference line, arrow, tail ----------
function buildReferenceLine(hasTail, tailText, weldKey, lineX2, seamPt, jointKey) {
  const g = el("g", {});
  g.appendChild(el("line", { x1: LINE_X1, y1: LINE_Y, x2: lineX2, y2: LINE_Y, stroke: "#E8EEF5", "stroke-width": 2.5 }));

  // arrow from left end of reference line to the joint seam
  const ax1 = LINE_X1, ay1 = LINE_Y;
  const ax2 = seamPt.x, ay2 = seamPt.y;

  // Weld-all-around: hollow circle at the junction of the arrow and the reference line.
  if (state.weldAllAround) {
    g.appendChild(el("circle", { cx: ax1, cy: ay1, r: 7, fill: "none", stroke: "#E8EEF5", "stroke-width": 2 }));
  }
  // Field weld: small filled pennant flag at the same junction.
  if (state.fieldWeld) {
    g.appendChild(el("polygon", {
      points: `${ax1},${ay1 - 8} ${ax1 + 16},${ay1 - 20} ${ax1},${ay1 - 20}`,
      fill: "#E8EEF5"
    }));
    g.appendChild(el("line", { x1: ax1, y1: ay1 - 8, x2: ax1, y2: ay1 - 20, stroke: "#E8EEF5", "stroke-width": 1.5 }));
  }

  // For bevel/J-groove/flare-bevel, pull the actual endpoint back from the
  // corner by a small fixed distance along the approach direction. The
  // arrow still clearly points AT the corner (the trajectory aims straight
  // at it) but the drawn tip stops just short — so it never touches the
  // plate at all, which sidesteps overlap concerns entirely rather than
  // needing to route flush against the boundary.
  const needsBreak = (weldKey === "bevel" || weldKey === "j" || weldKey === "flarebevel");
  let ex2 = ax2, ey2 = ay2;
  if (needsBreak) {
    const ddx = ax2 - ax1, ddy = ay2 - ay1;
    const dlen = Math.hypot(ddx, ddy) || 1;
    const pullback = 14;
    ex2 = ax2 - (ddx / dlen) * pullback;
    ey2 = ay2 - (ddy / dlen) * pullback;
  }

  // Route the arrow around any plate it would otherwise cut across. Runs
  // fresh on every render, so a calibrated (dragged) arrow position or a
  // joint switch both re-route automatically — nothing to fix by hand.
  const path = computeArrowPath(ax1, ay1, ex2, ey2, jointKey);

  // Broken/bent leader line: required whenever only ONE member of the joint
  // is prepared (bevel, J-groove, flare-bevel) — the bend points the arrow
  // specifically at that member instead of running straight to the root.
  // Applied to the FINAL segment of the routed path (closest to the
  // arrowhead), so it still reads correctly even when the path also had to
  // detour around a plate.
  let finalSegStart = path[path.length - 2];
  const finalSegEnd = path[path.length - 1];
  let points = path.map(p => `${p.x},${p.y}`);

  if (needsBreak) {
    const t = 0.62; // bend sits closer to the arrowhead than the previous point
    const midX = finalSegStart.x + (finalSegEnd.x - finalSegStart.x) * t;
    const midY = finalSegStart.y + (finalSegEnd.y - finalSegStart.y) * t;
    const dx = finalSegEnd.x - finalSegStart.x, dy = finalSegEnd.y - finalSegStart.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const bendOffset = 22;
    const bendX = midX + (-dy / len) * bendOffset;
    const bendY = midY + (dx / len) * bendOffset;
    points = path.slice(0, -1).map(p => `${p.x},${p.y}`).concat([`${bendX},${bendY}`, `${finalSegEnd.x},${finalSegEnd.y}`]);
    finalSegStart = { x: bendX, y: bendY };
  }

  g.appendChild(el("polyline", { points: points.join(" "), fill: "none", stroke: "#E8EEF5", "stroke-width": 2.5 }));

  // arrowhead — angled to match the actual final approach direction, not
  // the start-to-end direction, so it's still correct after routing/bending.
  const angle = Math.atan2(finalSegEnd.y - finalSegStart.y, finalSegEnd.x - finalSegStart.x);
  const ah1x = ex2 - 14 * Math.cos(angle - 0.35), ah1y = ey2 - 14 * Math.sin(angle - 0.35);
  const ah2x = ex2 - 14 * Math.cos(angle + 0.35), ah2y = ey2 - 14 * Math.sin(angle + 0.35);
  g.appendChild(el("polygon", { points: `${ex2},${ey2} ${ah1x},${ah1y} ${ah2x},${ah2y}`, fill: "#E8EEF5" }));

  // Calibration crosshair — only shown while the person is actively placing the arrow.
  if (state.calibrating) {
    g.appendChild(el("circle", { cx: ax2, cy: ay2, r: 9, fill: "none", stroke: "#F2C744", "stroke-width": 2, "stroke-dasharray": "3 3" }));
    g.appendChild(el("line", { x1: ax2 - 14, y1: ay2, x2: ax2 + 14, y2: ay2, stroke: "#F2C744", "stroke-width": 1.5 }));
    g.appendChild(el("line", { x1: ax2, y1: ay2 - 14, x2: ax2, y2: ay2 + 14, stroke: "#F2C744", "stroke-width": 1.5 }));
  }

  // tail
  if (hasTail && tailText) {
    g.appendChild(el("line", { x1: lineX2, y1: LINE_Y, x2: lineX2 + 46, y2: LINE_Y - 10, stroke: "#E8EEF5", "stroke-width": 2 }));
    g.appendChild(el("line", { x1: lineX2, y1: LINE_Y, x2: lineX2 + 46, y2: LINE_Y + 10, stroke: "#E8EEF5", "stroke-width": 2 }));
    const textStartX = lineX2 + 54;
    const maxLineWidth = BASE_WIDTH - 24 - textStartX;
    const lines = wrapText(tailText, maxLineWidth, 14);
    const lineHeight = 18;
    // Center the stacked lines vertically on the reference line, like a
    // multi-line caption, rather than always starting from the line itself.
    const startY = LINE_Y + 5 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      g.appendChild(textEl(textStartX, startY + i * lineHeight, line, { size: 14, weight: 500 }));
    });
  }
  return g;
}

// ---------- Weld glyphs ----------
// dir: +1 = below the line (arrow side), -1 = above the line (other side)
// Label positions follow the standard AWS layout: size/depth to the left of
// the glyph (the "S(E)" position), length-pitch to the right ("L-P"), groove
// angle at the vertex ("A"), root opening/face and groove radius stacked
// just beyond the open end of the glyph ("R").
function buildGlyph(weldKey, cx, dir, params, repeatInfo) {
  const g = el("g", {});
  const lineY = LINE_Y;
  const DEPTH = 50;
  const GAP = 12;
  const leftX = cx - 80;
  const C = "#E8EEF5"; // every glyph now matches the reference line color

  // When dimensions are hidden, every callout becomes a no-op — only the
  // glyph line-work itself is drawn, sitting bare on the reference line.
  function addLabel(key, x, y, str, opts) {
    if (state.showDimensions === false) return;
    g.appendChild(paramLabel(key, x, y, str, opts));
  }
  function addPlain(x, y, str, opts) {
    if (state.showDimensions === false) return;
    g.appendChild(textEl(x, y, str, opts));
  }
  function addContourFinishIfShown(cx2, dir2, color, contourY, finishY) {
    if (state.showDimensions === false) return;
    addContourFinish(g, cx2, dir2, params, color, contourY, finishY);
  }
  // S(E): groove weld size and effective throat shown side by side, one in
  // parentheses, on the reference line to the left of the glyph — per the
  // AWS anatomy chart's "S(E)" position, not stacked vertically. Sits on the
  // SAME side of the reference line as the glyph itself (a small offset in
  // the dir direction), never centered exactly on the line.
  function addSizeDepthPair(x) {
    const y = lineY + dir * 13;
    addLabel("grooveSize", x - 20, y, fmt(params.grooveSize), { anchor: "middle", fill: C, size: 11 });
    addPlain(x - 6, y, "(", { anchor: "middle", fill: C, size: 11 });
    addLabel("weldDepth", x + 6, y, fmt(params.weldDepth), { anchor: "middle", fill: C, size: 11 });
    addPlain(x + 20, y, ")", { anchor: "middle", fill: C, size: 11 });
  }

  if (weldKey === "fillet") {
    const sizePx = 18 + (params.size / 1.5) * 55;
    const offsets = (repeatInfo && repeatInfo.offsets) ? repeatInfo.offsets : [0];
    offsets.forEach(off => {
      g.appendChild(el("polygon", {
        points: `${cx + off - 24},${lineY} ${cx + off - 24},${lineY + dir * sizePx} ${cx + off + 24},${lineY}`,
        fill: "none", stroke: C, "stroke-width": 2.5
      }));
    });
    // Size sits on the SAME side of the line as the glyph — the "S(E)"
    // position — offset toward the glyph's side, not floating on the line.
    addLabel("size", leftX, lineY + dir * 13, fmt(params.size), { anchor: "end", fill: C, size: 13 });
    if (params.length !== undefined && params.pitch !== undefined) {
      const rightX = cx + (offsets.length > 1 ? Math.max(...offsets) + 24 : 32);
      addLabel("length", rightX + 8, lineY + dir * 13, fmt(params.length), { anchor: "middle", fill: C, size: 13 });
      addPlain(rightX + 32, lineY + dir * 13, "-", { anchor: "middle", fill: C, size: 13 });
      addLabel("pitch", rightX + 56, lineY + dir * 13, fmt(params.pitch), { anchor: "middle", fill: C, size: 13 });
    }
    // Contour/finish sit beyond the triangle's own extent regardless of size.
    addContourFinishIfShown(cx, dir, C, lineY + dir * (sizePx + 18), lineY + dir * (sizePx + 38));
    return g;
  }

  if (weldKey === "square") {
    const depth = 26 * dir;
    g.appendChild(el("line", { x1: cx - 9, y1: lineY, x2: cx - 9, y2: lineY + depth, stroke: C, "stroke-width": 2.5 }));
    g.appendChild(el("line", { x1: cx + 9, y1: lineY, x2: cx + 9, y2: lineY + depth, stroke: C, "stroke-width": 2.5 }));
    addLabel("rootOpening", cx, lineY + dir * 44, fmt(params.rootOpening), { anchor: "middle", fill: C, size: 13 });
    addContourFinishIfShown(cx, dir, C, lineY + dir * 64, lineY + dir * 84);
    return g;
  }

  if (weldKey === "v") {
    const halfW = clamp(10 + (params.grooveAngle / 90) * 38, 10, 48);
    g.appendChild(el("polyline", {
      points: `${cx - halfW},${lineY + dir * DEPTH} ${cx},${lineY} ${cx + halfW},${lineY + dir * DEPTH}`,
      fill: "none", stroke: C, "stroke-width": 2.5
    }));
    // Labels sit BELOW the shape's full open width (past DEPTH), not near
    // the narrow vertex — near the vertex the V is too thin and any text
    // ends up crossing the diagonal lines no matter how tightly it's packed.
    addLabel("rootOpening", cx, lineY + dir * (DEPTH + 16), fmt(params.rootOpening), { anchor: "middle", fill: C, size: 12 });
    addLabel("grooveAngle", cx, lineY + dir * (DEPTH + 34), `${params.grooveAngle}\u00b0`, { anchor: "middle", fill: C, size: 13 });
    addContourFinishIfShown(cx, dir, C, lineY + dir * (DEPTH + 52), lineY + dir * (DEPTH + 70));
    addSizeDepthPair(leftX);
    return g;
  }

  if (weldKey === "bevel") {
    const spread = 50;
    const midX = cx + spread / 2; // shape spans cx to cx+spread; center on its actual midpoint, not the vertex
    g.appendChild(el("polyline", {
      points: `${cx},${lineY + dir * DEPTH} ${cx},${lineY} ${cx + spread},${lineY + dir * DEPTH}`,
      fill: "none", stroke: C, "stroke-width": 2.5
    }));
    addLabel("rootOpening", midX, lineY + dir * (DEPTH + 16), fmt(params.rootOpening), { anchor: "middle", fill: C, size: 12 });
    addLabel("grooveAngle", midX, lineY + dir * (DEPTH + 34), `${params.grooveAngle}\u00b0`, { anchor: "middle", fill: C, size: 13 });
    addContourFinishIfShown(midX, dir, C, lineY + dir * (DEPTH + 52), lineY + dir * (DEPTH + 70));
    addSizeDepthPair(leftX);
    return g;
  }

  if (weldKey === "u") {
    const halfW = clamp(10 + (params.grooveAngle / 90) * 34, 18, 44);
    const peakY = lineY + dir * GAP;
    const openY = lineY + dir * DEPTH;
    g.appendChild(el("line", { x1: cx, y1: lineY, x2: cx, y2: peakY, stroke: C, "stroke-width": 2.5 }));
    const path = `M ${cx - halfW},${openY} Q ${cx - halfW},${peakY} ${cx},${peakY} Q ${cx + halfW},${peakY} ${cx + halfW},${openY}`;
    g.appendChild(el("path", { d: path, fill: "none", stroke: C, "stroke-width": 2.5 }));
    addLabel("rootOpening", cx, lineY + dir * (DEPTH + 16), fmt(params.rootOpening), { anchor: "middle", fill: C, size: 12 });
    addLabel("grooveAngle", cx, lineY + dir * (DEPTH + 34), `${params.grooveAngle}\u00b0`, { anchor: "middle", fill: C, size: 12 });
    addContourFinishIfShown(cx, dir, C, lineY + dir * (DEPTH + 52), lineY + dir * (DEPTH + 70));
    addSizeDepthPair(leftX);
    addLabel("grooveRadius", cx, lineY + dir * (DEPTH + 88), fmt(params.grooveRadius), { anchor: "middle", fill: C, size: 11 });
    return g;
  }

  if (weldKey === "j") {
    const spread = 38;
    const midX = cx + spread / 2; // shape spans cx to cx+spread; center on its actual midpoint
    const curveStartY = lineY + dir * GAP;
    const openY = lineY + dir * DEPTH;
    g.appendChild(el("line", { x1: cx, y1: lineY, x2: cx, y2: openY, stroke: C, "stroke-width": 2.5 }));
    const jPath = `M ${cx},${curveStartY} Q ${cx + spread},${curveStartY} ${cx + spread},${openY}`;
    g.appendChild(el("path", { d: jPath, fill: "none", stroke: C, "stroke-width": 2.5 }));
    addLabel("rootOpening", midX, lineY + dir * (DEPTH + 16), fmt(params.rootOpening), { anchor: "middle", fill: C, size: 12 });
    addLabel("grooveAngle", midX, lineY + dir * (DEPTH + 34), `${params.grooveAngle}\u00b0`, { anchor: "middle", fill: C, size: 12 });
    addContourFinishIfShown(midX, dir, C, lineY + dir * (DEPTH + 52), lineY + dir * (DEPTH + 70));
    addSizeDepthPair(leftX);
    addLabel("grooveRadius", midX, lineY + dir * (DEPTH + 88), fmt(params.grooveRadius), { anchor: "middle", fill: C, size: 11 });
    return g;
  }

  if (weldKey === "flarebevel") {
    const midX = cx + 12; // shape spans roughly cx-16 to cx+40; center on its actual midpoint
    const openY = lineY + dir * DEPTH;
    const stemPeakY = lineY + dir * GAP;
    g.appendChild(el("line", { x1: cx - 16, y1: lineY, x2: cx - 16, y2: openY, stroke: C, "stroke-width": 2.5 }));
    g.appendChild(el("line", { x1: cx + 13, y1: lineY, x2: cx + 13, y2: stemPeakY, stroke: C, "stroke-width": 2.5 }));
    const path = `M ${cx + 13},${stemPeakY} Q ${cx + 13},${openY} ${cx + 40},${openY}`;
    g.appendChild(el("path", { d: path, fill: "none", stroke: C, "stroke-width": 2.5 }));
    // Contour/finish sit below the hook's full extent, not near its narrow start.
    addContourFinishIfShown(midX, dir, C, lineY + dir * (DEPTH + 16), lineY + dir * (DEPTH + 34));
    addSizeDepthPair(leftX);
    addLabel("grooveRadius", cx, lineY + dir * (DEPTH + 20), fmt(params.grooveRadius), { anchor: "middle", fill: C, size: 12 });
    return g;
  }

  return g;
}

function fmt(n) {
  if (n === undefined || n === null) return "";
  return (Math.round(n * 10000) / 10000).toString().replace(/^0\./, ".");
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ---------- Interactive parameter labels ----------
// Each label/shape is focusable and clickable: selecting it (mouse or
// keyboard) jumps to and highlights the matching field in the Dimensions panel.

// Muted until the person actually sets a value; bright, higher-contrast once
// they have — mirrors the AWS chart's convention of showing a bare letter
// (S, A, R, L, P, E...) as a placeholder for where a value goes.
const UNSET_COLOR = "#7E93B8";
const SET_COLOR = "#FFFFFF";
const PARAM_LETTER = {
  size: "S", length: "L", pitch: "P", rootOpening: "R", grooveAngle: "A",
  grooveSize: "S", weldDepth: "E", grooveRadius: "Rad"
};

function interactiveGroup(key, ariaLabel, children) {
  const def = PARAM_DEFS[key];
  const isSelected = state.selectedVariable === key;
  const g = el("g", {
    tabindex: "0",
    role: "button",
    "aria-label": ariaLabel,
    class: "var-label" + (isSelected ? " var-label-selected" : "")
  });
  g.appendChild(el("title", {}, [document.createTextNode(def ? def.label + " \u2014 " + def.hint : key)]));
  children.forEach(c => g.appendChild(c));
  g.onclick = function () { selectVariable(key); };
  g.onfocus = function () { previewVariable(key); };
  g.onmouseenter = function () { previewVariable(key); };
  g.onkeydown = function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectVariable(key); }
  };
  return g;
}

function paramLabel(key, x, y, str, opts) {
  opts = opts || {};
  const def = PARAM_DEFS[key];
  let displayStr = str;
  let color = opts.fill || SET_COLOR;
  if (PARAM_LETTER[key]) {
    const touched = !!(state.touchedParams && state.touchedParams[key]);
    displayStr = touched ? str : PARAM_LETTER[key];
    color = touched ? SET_COLOR : UNSET_COLOR;
  }
  const mergedOpts = Object.assign({}, opts, { fill: color });
  return interactiveGroup(key, (def ? def.label : key) + ": " + str, [textEl(x, y, displayStr, mergedOpts)]);
}

// Contour symbol: a small cap shape sitting directly beyond the weld glyph —
// flush (straight), convex (bulges further out), or concave (bulges back in).
function contourShapeElements(cx, y, value, color, dir) {
  const w = 11;
  const bulge = 6 * dir;
  if (value === "flush") {
    return [el("line", { x1: cx - w, y1: y, x2: cx + w, y2: y, stroke: color, "stroke-width": 2 })];
  }
  if (value === "convex") {
    return [el("path", { d: `M ${cx - w},${y} Q ${cx},${y + bulge} ${cx + w},${y}`, fill: "none", stroke: color, "stroke-width": 2 })];
  }
  if (value === "concave") {
    return [el("path", { d: `M ${cx - w},${y} Q ${cx},${y - bulge} ${cx + w},${y}`, fill: "none", stroke: color, "stroke-width": 2 })];
  }
  return [];
}

// Shared contour + finish rendering, appended just beyond the groove-angle /
// root-opening stack — the outermost elements per the AWS layout (F above
// the contour symbol, which sits directly atop the weld symbol). Contour and
// finish use their own value ("none" vs. an actual selection) as the signal
// for muted-placeholder vs. bright-set, since unlike the numeric fields
// their default IS the "unset" state.
function addContourFinish(g, cx, dir, params, color, contourY, finishY) {
  const contourSet = params.contourSymbol && params.contourSymbol !== "none";
  const finishSet = params.finishSymbol && params.finishSymbol !== "none";

  if (contourSet) {
    g.appendChild(interactiveGroup(
      "contourSymbol",
      "Contour Symbol: " + params.contourSymbol,
      contourShapeElements(cx, contourY, params.contourSymbol, SET_COLOR, dir)
    ));
  } else {
    g.appendChild(paramLabel("contourSymbol", cx, contourY, "C", { anchor: "middle", size: 12, fill: UNSET_COLOR }));
  }

  if (finishSet) {
    g.appendChild(paramLabel("finishSymbol", cx, finishY, params.finishSymbol, { anchor: "middle", size: 13, fill: SET_COLOR }));
  } else {
    g.appendChild(paramLabel("finishSymbol", cx, finishY, "F", { anchor: "middle", size: 13, fill: UNSET_COLOR }));
  }
}

// ---------- Master render ----------
function renderSymbol(svg, appState) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // Fixed sheet size always — only the reference line's length changes to
  // make room for a long tail note. The weld symbol itself never resizes.
  svg.setAttribute("viewBox", `0 0 ${BASE_WIDTH} ${SHEET_HEIGHT}`);
  svg.appendChild(buildGrid(BASE_WIDTH));
  svg.appendChild(buildJointIllustration(appState.joint));

  // Snap-point markers — only shown while actively calibrating, so they
  // don't clutter the diagram the rest of the time.
  if (appState.calibrating) {
    getSnapPoints(appState.joint).forEach(pt => {
      const dot = el("g", {});
      dot.appendChild(el("circle", { cx: pt.x, cy: pt.y, r: 7, fill: "rgba(242,199,68,0.15)", stroke: "#F2C744", "stroke-width": 1.5 }));
      dot.appendChild(el("circle", { cx: pt.x, cy: pt.y, r: 2, fill: "#F2C744" }));
      svg.appendChild(dot);
    });
  }

  const MIN_LINE_X2 = 580; // floor so the line never retracts into the glyph area
  const tailW = appState.tailText ? estimateTextWidth(appState.tailText, 14) : 0;
  let lineX2 = LINE_X2;
  if (appState.tailText) {
    const desired = BASE_WIDTH - 30 - 54 - tailW;
    lineX2 = Math.max(MIN_LINE_X2, Math.min(LINE_X2, desired));
  }

  const seamPt = getEffectiveSeam(appState.joint);
  svg.appendChild(buildReferenceLine(!!appState.tailText, appState.tailText, appState.weld, lineX2, seamPt, appState.joint));

  const glyphCx = LINE_X1 + 130;
  // Chain vs. staggered only applies to a double-sided intermittent fillet —
  // chain repeats the same spacing on both sides, staggered offsets the
  // other side by half the spacing so segments don't align.
  let arrowRepeat = null, otherRepeat = null;
  if (appState.weld === "fillet" && appState.side === "double" &&
      appState.params.length !== undefined && appState.params.pitch !== undefined) {
    const spacing = 48;
    arrowRepeat = { offsets: [-spacing, 0, spacing] };
    const shift = appState.chainStagger === "staggered" ? spacing / 2 : 0;
    otherRepeat = { offsets: [-spacing + shift, shift, spacing + shift] };
  }
  if (appState.side === "arrow" || appState.side === "double") {
    svg.appendChild(buildGlyph(appState.weld, glyphCx, 1, appState.params, arrowRepeat));
  }
  if (appState.side === "other" || appState.side === "double") {
    svg.appendChild(buildGlyph(appState.weld, glyphCx, -1, appState.params, otherRepeat));
  }

  // joint label near illustration
  svg.appendChild(textEl(130, 330, JOINT_TYPES[appState.joint].label, { anchor: "middle", size: 13, fill: "#9FB2D1", mono: true }));
}
