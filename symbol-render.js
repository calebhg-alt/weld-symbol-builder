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
    case "butt": return { x: cx, y: cy };
    case "tjoint": return { x: cx, y: cy + 10 };
    case "lap": return { x: cx, y: cy + 10 };
    case "corner": return { x: cx, y: cy - 10 };
    case "edge": return { x: cx, y: cy - 6 };
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

  const needsBreak = (weldKey === "bevel" || weldKey === "j");
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
function buildGlyph(weldKey, cx, dir, params) {
  const g = el("g", {});
  const lineY = LINE_Y;

  if (weldKey === "fillet") {
    const sizePx = 18 + (params.size / 1.5) * 55;
    g.appendChild(el("polygon", {
      points: `${cx - 24},${lineY} ${cx - 24},${lineY + dir * sizePx} ${cx + 24},${lineY}`,
      fill: "none", stroke: "#F2C744", "stroke-width": 2.5
    }));
    g.appendChild(textEl(cx - 34, lineY + dir * (sizePx / 2) + 4, fmt(params.size), { anchor: "end", fill: "#F2C744" }));
    if (params.length && params.pitch) {
      g.appendChild(textEl(cx + 34, lineY - dir * 8, `${fmt(params.length)} - ${fmt(params.pitch)}`, { fill: "#F2C744", size: 13 }));
    }
    return g;
  }

  if (weldKey === "square") {
    const depth = 26 * dir;
    g.appendChild(el("line", { x1: cx - 9, y1: lineY, x2: cx - 9, y2: lineY + depth, stroke: "#7FD1AE", "stroke-width": 2.5 }));
    g.appendChild(el("line", { x1: cx + 9, y1: lineY, x2: cx + 9, y2: lineY + depth, stroke: "#7FD1AE", "stroke-width": 2.5 }));
    g.appendChild(textEl(cx, lineY + dir * 40, fmt(params.rootOpening), { anchor: "middle", fill: "#7FD1AE", size: 13 }));
    return g;
  }

  if (weldKey === "v" || weldKey === "u") {
    const halfW = clamp(10 + (params.grooveAngle / 90) * 38, 10, 48);
    const depth = 46 * dir;
    const color = weldKey === "v" ? "#7FC0E8" : "#C792EA";
    if (weldKey === "v") {
      g.appendChild(el("polyline", {
        points: `${cx - halfW},${lineY} ${cx},${lineY + depth} ${cx + halfW},${lineY}`,
        fill: "none", stroke: color, "stroke-width": 2.5
      }));
    } else {
      const path = `M ${cx - halfW},${lineY} Q ${cx - halfW},${lineY + depth} ${cx},${lineY + depth} Q ${cx + halfW},${lineY + depth} ${cx + halfW},${lineY}`;
      g.appendChild(el("path", { d: path, fill: "none", stroke: color, "stroke-width": 2.5 }));
    }
    g.appendChild(textEl(cx, lineY + dir * 8 - dir * 2, `${params.grooveAngle}°`, { anchor: "middle", fill: color, size: 13 }));
    g.appendChild(textEl(cx, lineY + dir * (Math.abs(depth) + 16), fmt(params.rootOpening), { anchor: "middle", fill: color, size: 12 }));
    return g;
  }

  if (weldKey === "bevel" || weldKey === "j") {
    const width = 44;
    const depth = 42 * dir;
    const color = weldKey === "bevel" ? "#EFA36B" : "#E38DBF";
    if (weldKey === "bevel") {
      g.appendChild(el("polyline", {
        points: `${cx - 16},${lineY} ${cx - 16},${lineY + depth} ${cx + width - 16},${lineY}`,
        fill: "none", stroke: color, "stroke-width": 2.5
      }));
    } else {
      const path = `M ${cx - 16},${lineY} L ${cx - 16},${lineY + depth} Q ${cx + 6},${lineY + depth} ${cx + width - 16},${lineY}`;
      g.appendChild(el("path", { d: path, fill: "none", stroke: color, "stroke-width": 2.5 }));
    }
    g.appendChild(textEl(cx + 4, lineY + dir * 8 - dir * 2, `${params.grooveAngle}°`, { anchor: "middle", fill: color, size: 13 }));
    return g;
  }

  return g;
}

function fmt(n) {
  if (n === undefined || n === null) return "";
  return (Math.round(n * 10000) / 10000).toString().replace(/^0\./, ".");
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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
