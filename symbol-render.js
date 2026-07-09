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
const ARROW_JOINT_X = 190;
const ARROW_JOINT_Y = 250;

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

// ---------- Background blueprint grid ----------
function buildGrid() {
  const g = el("g", { "aria-hidden": "true" });
  for (let x = 0; x <= 900; x += 30) {
    g.appendChild(el("line", { x1: x, y1: 0, x2: x, y2: 420, stroke: "rgba(255,255,255,0.06)", "stroke-width": 1 }));
  }
  for (let y = 0; y <= 420; y += 30) {
    g.appendChild(el("line", { x1: 0, y1: y, x2: 900, y2: y, stroke: "rgba(255,255,255,0.06)", "stroke-width": 1 }));
  }
  g.appendChild(el("rect", { x: 6, y: 6, width: 888, height: 408, fill: "none", stroke: "rgba(255,255,255,0.22)", "stroke-width": 1.5 }));
  return g;
}

// ---------- Joint cross-section illustrations ----------
function buildJointIllustration(jointKey) {
  const g = el("g", {});
  const plateFill = "#8FA3C2";
  const plateStroke = "#E8EEF5";
  const cx = 130, cy = 250;

  function plate(x, y, w, h) {
    return el("rect", { x, y, width: w, height: h, fill: plateFill, stroke: plateStroke, "stroke-width": 2, opacity: 0.85 });
  }

  switch (jointKey) {
    case "butt":
      g.appendChild(plate(cx - 90, cy - 14, 82, 28));
      g.appendChild(plate(cx + 8, cy - 14, 82, 28));
      break;
    case "tjoint":
      g.appendChild(plate(cx - 90, cy + 10, 180, 24)); // base, horizontal
      g.appendChild(plate(cx - 12, cy - 70, 24, 82));  // upright
      break;
    case "lap":
      g.appendChild(plate(cx - 90, cy - 6, 100, 22));
      g.appendChild(plate(cx - 10, cy + 16, 100, 22));
      break;
    case "corner":
      g.appendChild(plate(cx - 90, cy - 10, 100, 22));
      g.appendChild(plate(cx - 2, cy - 92, 22, 92));
      break;
    case "edge":
      g.appendChild(plate(cx - 60, cy - 30, 120, 18));
      g.appendChild(plate(cx - 60, cy - 6, 120, 18));
      break;
  }
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
    // Root = the outside vertex where the base plate's edge meets the upright.
    case "corner": return { x: cx + 10, y: cy - 10 };
    // Root = the aligned edges of the two parallel plates.
    case "edge": return { x: cx + 60, y: cy - 9 };
    default: return { x: cx, y: cy };
  }
}

// ---------- Reference line, arrow, tail ----------
function buildReferenceLine(hasTail, tailText, weldKey) {
  const g = el("g", {});
  const seam = arguments.__seam || null;
  g.appendChild(el("line", { x1: LINE_X1, y1: LINE_Y, x2: LINE_X2, y2: LINE_Y, stroke: "#E8EEF5", "stroke-width": 2.5 }));

  // arrow from left end of reference line to the joint seam
  const seamPt = window.__currentSeam;
  const ax1 = LINE_X1, ay1 = LINE_Y;
  const ax2 = seamPt.x, ay2 = seamPt.y;

  const needsBreak = (weldKey === "bevel" || weldKey === "j" || weldKey === "flarebevel");
  if (needsBreak) {
    const bx = ax1 - (ax1 - ax2) * 0.4;
    const by = ay1 - (ay1 - ay2) * 0.4;
    const kx = bx + 14, ky = by - 6;
    g.appendChild(el("polyline", {
      points: `${ax1},${ay1} ${kx},${ky} ${bx},${by} ${ax2},${ay2}`,
      fill: "none", stroke: "#E8EEF5", "stroke-width": 2.5
    }));
  } else {
    g.appendChild(el("line", { x1: ax1, y1: ay1, x2: ax2, y2: ay2, stroke: "#E8EEF5", "stroke-width": 2.5 }));
  }
  // arrowhead
  const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
  const ah1x = ax2 - 14 * Math.cos(angle - 0.35), ah1y = ay2 - 14 * Math.sin(angle - 0.35);
  const ah2x = ax2 - 14 * Math.cos(angle + 0.35), ah2y = ay2 - 14 * Math.sin(angle + 0.35);
  g.appendChild(el("polygon", { points: `${ax2},${ay2} ${ah1x},${ah1y} ${ah2x},${ah2y}`, fill: "#E8EEF5" }));
  g.appendChild(el("circle", { cx: ax2, cy: ay2, r: 3.5, fill: "#F2C744", stroke: "#12324F", "stroke-width": 1 }));

  // tail
  if (hasTail && tailText) {
    g.appendChild(el("line", { x1: LINE_X2, y1: LINE_Y, x2: LINE_X2 + 46, y2: LINE_Y - 10, stroke: "#E8EEF5", "stroke-width": 2 }));
    g.appendChild(el("line", { x1: LINE_X2, y1: LINE_Y, x2: LINE_X2 + 46, y2: LINE_Y + 10, stroke: "#E8EEF5", "stroke-width": 2 }));
    g.appendChild(textEl(LINE_X2 + 54, LINE_Y + 5, tailText, { size: 14, weight: 500 }));
  }
  return g;
}

// ---------- Weld glyphs ----------
// dir: +1 = below the line (arrow side), -1 = above the line (other side)
// Label positions follow the standard AWS layout: size/depth to the left of
// the glyph (the "S(E)" position), length-pitch to the right ("L-P"), groove
// angle at the vertex ("A"), root opening/face and groove radius stacked
// just beyond the open end of the glyph ("R").
function buildGlyph(weldKey, cx, dir, params) {
  const g = el("g", {});
  const lineY = LINE_Y;
  const DEPTH = 50;
  const GAP = 12;
  const bottom1 = lineY + dir * (DEPTH + 16);
  const bottom2 = lineY + dir * (DEPTH + 30);
  const bottom3 = lineY + dir * (DEPTH + 44);
  const leftX = cx - 60;

  if (weldKey === "fillet") {
    const sizePx = 18 + (params.size / 1.5) * 55;
    g.appendChild(el("polygon", {
      points: `${cx - 24},${lineY} ${cx - 24},${lineY + dir * sizePx} ${cx + 24},${lineY}`,
      fill: "none", stroke: "#F2C744", "stroke-width": 2.5
    }));
    g.appendChild(paramLabel("size", cx - 34, lineY + dir * (sizePx / 2) + 4, fmt(params.size), { anchor: "end", fill: "#F2C744" }));
    if (params.length !== undefined && params.pitch !== undefined) {
      g.appendChild(paramLabel("length", cx + 30, lineY - dir * 8, fmt(params.length), { anchor: "middle", fill: "#F2C744", size: 13 }));
      g.appendChild(textEl(cx + 52, lineY - dir * 8, "-", { anchor: "middle", fill: "#F2C744", size: 13 }));
      g.appendChild(paramLabel("pitch", cx + 74, lineY - dir * 8, fmt(params.pitch), { anchor: "middle", fill: "#F2C744", size: 13 }));
    }
    return g;
  }

  if (weldKey === "square") {
    const depth = 26 * dir;
    g.appendChild(el("line", { x1: cx - 9, y1: lineY, x2: cx - 9, y2: lineY + depth, stroke: "#7FD1AE", "stroke-width": 2.5 }));
    g.appendChild(el("line", { x1: cx + 9, y1: lineY, x2: cx + 9, y2: lineY + depth, stroke: "#7FD1AE", "stroke-width": 2.5 }));
    g.appendChild(paramLabel("rootOpening", cx, lineY + dir * 40, fmt(params.rootOpening), { anchor: "middle", fill: "#7FD1AE", size: 13 }));
    return g;
  }

  if (weldKey === "v") {
    const halfW = clamp(10 + (params.grooveAngle / 90) * 38, 10, 48);
    g.appendChild(el("polyline", {
      points: `${cx - halfW},${lineY + dir * DEPTH} ${cx},${lineY} ${cx + halfW},${lineY + dir * DEPTH}`,
      fill: "none", stroke: "#7FC0E8", "stroke-width": 2.5
    }));
    g.appendChild(paramLabel("grooveAngle", cx, lineY + dir * 18, `${params.grooveAngle}\u00b0`, { anchor: "middle", fill: "#7FC0E8", size: 13 }));
    g.appendChild(paramLabel("rootOpening", cx, bottom1, fmt(params.rootOpening), { anchor: "middle", fill: "#7FC0E8", size: 12 }));
    g.appendChild(paramLabel("rootFace", cx, bottom2, fmt(params.rootFace), { anchor: "middle", fill: "#7FC0E8", size: 11 }));
    g.appendChild(paramLabel("weldDepth", leftX, lineY, fmt(params.weldDepth), { anchor: "end", fill: "#7FC0E8", size: 12 }));
    return g;
  }

  if (weldKey === "bevel") {
    const spread = 50;
    g.appendChild(el("polyline", {
      points: `${cx},${lineY + dir * DEPTH} ${cx},${lineY} ${cx + spread},${lineY + dir * DEPTH}`,
      fill: "none", stroke: "#EFA36B", "stroke-width": 2.5
    }));
    g.appendChild(paramLabel("grooveAngle", cx + 4, lineY + dir * 18, `${params.grooveAngle}\u00b0`, { anchor: "middle", fill: "#EFA36B", size: 13 }));
    g.appendChild(paramLabel("rootOpening", cx + 4, bottom1, fmt(params.rootOpening), { anchor: "middle", fill: "#EFA36B", size: 12 }));
    g.appendChild(paramLabel("rootFace", cx + 4, bottom2, fmt(params.rootFace), { anchor: "middle", fill: "#EFA36B", size: 11 }));
    g.appendChild(paramLabel("weldDepth", leftX, lineY, fmt(params.weldDepth), { anchor: "end", fill: "#EFA36B", size: 12 }));
    return g;
  }

  if (weldKey === "u") {
    const halfW = clamp(10 + (params.grooveAngle / 90) * 34, 18, 44);
    const peakY = lineY + dir * GAP;
    const openY = lineY + dir * DEPTH;
    g.appendChild(el("line", { x1: cx, y1: lineY, x2: cx, y2: peakY, stroke: "#C792EA", "stroke-width": 2.5 }));
    const path = `M ${cx - halfW},${openY} Q ${cx - halfW},${peakY} ${cx},${peakY} Q ${cx + halfW},${peakY} ${cx + halfW},${openY}`;
    g.appendChild(el("path", { d: path, fill: "none", stroke: "#C792EA", "stroke-width": 2.5 }));
    g.appendChild(paramLabel("grooveAngle", cx, lineY + dir * (GAP - 4), `${params.grooveAngle}\u00b0`, { anchor: "middle", fill: "#C792EA", size: 12 }));
    g.appendChild(paramLabel("rootOpening", cx, bottom1, fmt(params.rootOpening), { anchor: "middle", fill: "#C792EA", size: 12 }));
    g.appendChild(paramLabel("rootFace", cx, bottom2, fmt(params.rootFace), { anchor: "middle", fill: "#C792EA", size: 11 }));
    g.appendChild(paramLabel("grooveRadius", cx, bottom3, fmt(params.grooveRadius), { anchor: "middle", fill: "#C792EA", size: 11 }));
    g.appendChild(paramLabel("weldDepth", leftX, lineY, fmt(params.weldDepth), { anchor: "end", fill: "#C792EA", size: 12 }));
    return g;
  }

  if (weldKey === "j") {
    const spread = 38;
    const curveStartY = lineY + dir * GAP;
    const openY = lineY + dir * DEPTH;
    g.appendChild(el("line", { x1: cx, y1: lineY, x2: cx, y2: openY, stroke: "#993556", "stroke-width": 2.5 }));
    const jPath = `M ${cx},${curveStartY} Q ${cx + spread},${curveStartY} ${cx + spread},${openY}`;
    g.appendChild(el("path", { d: jPath, fill: "none", stroke: "#993556", "stroke-width": 2.5 }));
    g.appendChild(paramLabel("grooveAngle", cx + spread, lineY + dir * (GAP - 4), `${params.grooveAngle}\u00b0`, { anchor: "middle", fill: "#993556", size: 12 }));
    g.appendChild(paramLabel("rootOpening", cx + spread, bottom1, fmt(params.rootOpening), { anchor: "middle", fill: "#993556", size: 12 }));
    g.appendChild(paramLabel("rootFace", cx + spread, bottom2, fmt(params.rootFace), { anchor: "middle", fill: "#993556", size: 11 }));
    g.appendChild(paramLabel("grooveRadius", cx + spread, bottom3, fmt(params.grooveRadius), { anchor: "middle", fill: "#993556", size: 11 }));
    g.appendChild(paramLabel("weldDepth", leftX, lineY, fmt(params.weldDepth), { anchor: "end", fill: "#993556", size: 12 }));
    return g;
  }

  if (weldKey === "flarebevel") {
    const openY = lineY + dir * DEPTH;
    const stemPeakY = lineY + dir * GAP;
    g.appendChild(el("line", { x1: cx - 16, y1: lineY, x2: cx - 16, y2: openY, stroke: "#0F6E56", "stroke-width": 2.5 }));
    g.appendChild(el("line", { x1: cx + 13, y1: lineY, x2: cx + 13, y2: stemPeakY, stroke: "#0F6E56", "stroke-width": 2.5 }));
    const path = `M ${cx + 13},${stemPeakY} Q ${cx + 13},${openY} ${cx + 40},${openY}`;
    g.appendChild(el("path", { d: path, fill: "none", stroke: "#0F6E56", "stroke-width": 2.5 }));
    g.appendChild(paramLabel("grooveRadius", cx, bottom1, fmt(params.grooveRadius), { anchor: "middle", fill: "#0F6E56", size: 12 }));
    g.appendChild(paramLabel("weldDepth", leftX, lineY, fmt(params.weldDepth), { anchor: "end", fill: "#0F6E56", size: 12 }));
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
// Each label is focusable and clickable: selecting it (mouse or keyboard)
// jumps to and highlights the matching field in the Dimensions panel.
function paramLabel(key, x, y, str, opts) {
  opts = opts || {};
  const def = PARAM_DEFS[key];
  const isSelected = state.selectedVariable === key;
  const g = el("g", {
    tabindex: "0",
    role: "button",
    "aria-label": (def ? def.label : key) + ": " + str,
    class: "var-label" + (isSelected ? " var-label-selected" : "")
  });
  g.appendChild(el("title", {}, [document.createTextNode(def ? def.label + " \u2014 " + def.hint : key)]));
  g.appendChild(textEl(x, y, str, opts));
  g.onclick = function () { selectVariable(key); };
  g.onfocus = function () { previewVariable(key); };
  g.onkeydown = function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectVariable(key); }
  };
  return g;
}

// ---------- Master render ----------
function renderSymbol(svg, state) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.appendChild(buildGrid());
  svg.appendChild(buildJointIllustration(state.joint));

  window.__currentSeam = jointSeamPoint(state.joint);
  svg.appendChild(buildReferenceLine(!!state.tailText, state.tailText, state.weld));

  const glyphCx = LINE_X1 + 70;
  if (state.side === "arrow" || state.side === "double") {
    svg.appendChild(buildGlyph(state.weld, glyphCx, 1, state.params));
  }
  if (state.side === "other" || state.side === "double") {
    svg.appendChild(buildGlyph(state.weld, glyphCx, -1, state.params));
  }

  // joint label near illustration
  svg.appendChild(textEl(130, 330, JOINT_TYPES[state.joint].label, { anchor: "middle", size: 13, fill: "#9FB2D1", mono: true }));
}
