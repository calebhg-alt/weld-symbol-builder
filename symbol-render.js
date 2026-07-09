// ============================================================
// SYMBOL DATA LIBRARY
// Joint <-> Weld validity matrix, weld parameter schemas.
// Adding a new joint or weld type is a data change here only —
// the UI and renderer read from this library.
// ============================================================

const PARAM_DEFS = {
  size:         { label: "Leg Size",        unit: "in", default: 0.25,  min: 0.0625, max: 1.5,  step: 0.0625,
                  hint: "Length of each equal leg of the fillet weld, measured from the joint root." },
  length:       { label: "Weld Length",     unit: "in", default: 2,     min: 0.5,    max: 12,   step: 0.25,
                  hint: "Length of each weld segment. Only shown for intermittent welds." },
  pitch:        { label: "Pitch",           unit: "in", default: 4,     min: 1,      max: 24,   step: 0.5,
                  hint: "Center-to-center spacing between intermittent weld segments." },
  rootOpening:  { label: "Root Opening",    unit: "in", default: 0.125, min: 0,      max: 0.5,  step: 0.0625,
                  hint: "Gap left between members at the root before welding." },
  grooveAngle:  { label: "Groove Angle",    unit: "°",  default: 45,    min: 5,      max: 90,   step: 5,
                  hint: "Total included angle of the groove opening." },
  grooveSize:   { label: "Groove Weld Size",unit: "in", default: 0.25,  min: 0,      max: 1.5,  step: 0.0625,
                  hint: "Depth of the groove weld (S) \u2014 the position labeled S(E) on an AWS symbol. Shown to the left of the symbol." },
  weldDepth:    { label: "Effective Throat (E)", unit: "in", default: 0, min: 0,      max: 1.5,  step: 0.0625,
                  hint: "Effective throat \u2014 the (E) in S(E). Leave at 0 for complete joint penetration (CJP)." },
  grooveRadius: { label: "Groove Radius",   unit: "in", default: 0.25,  min: 0.125,  max: 0.75, step: 0.0625,
                  hint: "Radius of the curved groove face (U- and J-grooves only)." },
  contourSymbol: { label: "Contour Symbol", type: "select", default: "none",
                  options: [
                    { value: "none", label: "None" },
                    { value: "flush", label: "Flush" },
                    { value: "convex", label: "Convex" },
                    { value: "concave", label: "Concave" }
                  ],
                  hint: "Shape of the finished weld face. Sits directly above the weld symbol." },
  finishSymbol: { label: "Finish Symbol", type: "select", default: "none",
                  options: [
                    { value: "none", label: "None" },
                    { value: "C", label: "C \u2014 Chipping" },
                    { value: "G", label: "G \u2014 Grinding" },
                    { value: "M", label: "M \u2014 Machining" },
                    { value: "R", label: "R \u2014 Rolling" },
                    { value: "H", label: "H \u2014 Hammering" }
                  ],
                  hint: "Method used to obtain the contour. Sits above the contour symbol \u2014 the outermost element on the symbol." }
};

const WELD_TYPES = {
  fillet: { label: "Fillet Weld",    glyph: "fillet",
            params: ["contourSymbol", "finishSymbol", "size", "length", "pitch"],
            note: "Most common weld on T- and lap-joints. Triangular symbol, size always shown to its left." },
  square: { label: "Square Groove",  glyph: "square",
            params: ["rootOpening", "contourSymbol", "finishSymbol"],
            note: "Used on thin material with no beveled edge prep — just a root gap." },
  v:      { label: "V-Groove",       glyph: "v",
            params: ["rootOpening", "grooveAngle", "contourSymbol", "finishSymbol", "grooveSize", "weldDepth"],
            note: "Both members beveled symmetrically, forming a V." },
  bevel:  { label: "Bevel Groove",   glyph: "bevel",
            params: ["rootOpening", "grooveAngle", "contourSymbol", "finishSymbol", "grooveSize", "weldDepth"],
            note: "Only one member is beveled — note the perpendicular break in the arrow pointing to that member." },
  u:      { label: "U-Groove",       glyph: "u",
            params: ["rootOpening", "grooveAngle", "contourSymbol", "finishSymbol", "grooveSize", "weldDepth", "grooveRadius"],
            note: "Both members have a curved (radiused) face — reduces filler metal vs. a V-groove." },
  j:      { label: "J-Groove",       glyph: "j",
            params: ["rootOpening", "grooveAngle", "contourSymbol", "finishSymbol", "grooveSize", "weldDepth", "grooveRadius"],
            note: "Only one member has a curved face — like a bevel groove, note the arrow break." },
  flarebevel: { label: "Flare Bevel Groove", glyph: "flarebevel",
            params: ["contourSymbol", "finishSymbol", "grooveSize", "weldDepth", "grooveRadius"],
            note: "One flat member against a curved/round member (e.g. bar stock or pipe) — note the arrow break, same as bevel and J." }
};

// Which welds are valid (and which are "rare" / advanced-only) per joint type.
const JOINT_TYPES = {
  butt:   { label: "Butt Joint",   welds: ["square", "v", "bevel", "u", "j"], advancedWelds: [],
            desc: "Two members in the same plane, edge to edge." },
  tjoint: { label: "T-Joint",      welds: ["fillet", "bevel", "j"], advancedWelds: ["v", "u", "flarebevel"],
            desc: "One member perpendicular to another, forming a T." },
  lap:    { label: "Lap Joint",    welds: ["fillet"], advancedWelds: [],
            desc: "Two overlapping members." },
  corner: { label: "Corner Joint", welds: ["fillet", "square", "v", "bevel", "j", "flarebevel"], advancedWelds: ["u"],
            desc: "Two members meeting at an angle, typically 90°, at their edges." },
  edge:   { label: "Edge Joint",   welds: ["square", "v"], advancedWelds: [],
            desc: "Two parallel (or near-parallel) members joined along their edges." }
};

// Doubling is only meaningful for groove welds and fillets on joints where
// weld metal can be placed from both sides of the reference line.
const DOUBLE_ALLOWED = {
  fillet: true, square: true, v: true, bevel: true, u: true, j: true, flarebevel: true
};

function getAvailableWelds(jointKey, showAdvanced) {
  const joint = JOINT_TYPES[jointKey];
  if (!joint) return [];
  return showAdvanced ? [...joint.welds, ...joint.advancedWelds] : joint.welds;
}

function isAdvancedCombo(jointKey, weldKey) {
  const joint = JOINT_TYPES[jointKey];
  return joint ? joint.advancedWelds.includes(weldKey) : false;
}
