// ============================================================
// APPLICATION LOGIC
// ============================================================

const state = {
  mode: "guided",
  step: 0, // 0=joint, 1=weld, 2=side/tail, 3=params
  joint: "tjoint",
  weld: "fillet",
  side: "arrow",       // arrow | other | double
  showAdvanced: false,
  showDimensions: true,
  tailText: "",
  params: {},
  selectedVariable: null,
  arrowOverrides: {},   // jointKey -> {x, y} calibrated arrow target, overrides the default
  calibrating: false,
  fieldWeld: false,
  weldAllAround: false,
  chainStagger: "chain",
  touchedParams: {}
};

const STEP_COUNT = 4;
const STEP_LABELS = ["Joint", "Weld Type", "Placement", "Dimensions"];

function initParams(weldKey) {
  const p = {};
  WELD_TYPES[weldKey].params.forEach(key => {
    const def = PARAM_DEFS[key];
    if (!def) {
      // A param key with no matching definition means the data/render/app
      // files are out of sync (e.g. only one file got re-deployed). Skip it
      // instead of throwing, so the rest of the symbol still renders.
      console.error(`No PARAM_DEFS entry for "${key}" (weld "${weldKey}") — check that all files are the same version.`);
      return;
    }
    p[key] = def.default;
  });
  state.params = p;
  state.touchedParams = {};
  if (state.selectedVariable && !WELD_TYPES[weldKey].params.includes(state.selectedVariable)) {
    state.selectedVariable = null;
  }
}
initParams(state.weld);

function setMode(mode) {
  state.mode = mode;
  document.getElementById("btn-mode-guided").classList.toggle("active", mode === "guided");
  document.getElementById("btn-mode-guided").setAttribute("aria-selected", mode === "guided");
  document.getElementById("btn-mode-freeform").classList.toggle("active", mode === "freeform");
  document.getElementById("btn-mode-freeform").setAttribute("aria-selected", mode === "freeform");
  document.getElementById("mode-badge").textContent = mode === "guided" ? "Guided Mode" : "Freeform Mode";
  document.getElementById("guided-nav").style.display = mode === "guided" ? "flex" : "none";
  document.getElementById("step-progress").style.visibility = mode === "guided" ? "visible" : "hidden";
  render();
}

function toggleDimensions(checked) {
  state.showDimensions = checked;
  renderVisual();
}

// Calibration lets the person click directly on the joint diagram to set
// exactly where the arrow should point, instead of relying on a built-in
// guess. This also doubles as "change which side/member the arrow targets" —
// clicking the other member of the joint moves the arrow there.
function toggleCalibrate(on) {
  state.calibrating = on;
  renderVisual();
}
function setArrowOverride(x, y) {
  state.arrowOverrides[state.joint] = { x: Math.round(x), y: Math.round(y) };
  renderVisual();
}
function resetArrowOverride() {
  delete state.arrowOverrides[state.joint];
  renderVisual();
}
function handleSvgClick(evt) {
  if (!state.calibrating) return;
  const svg = document.getElementById("symbol-svg");
  if (!svg.createSVGPoint || !svg.getScreenCTM) return;
  const ctm = svg.getScreenCTM();
  if (!ctm) return;
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const svgPt = pt.matrixTransform(ctm.inverse());
  setArrowOverride(svgPt.x, svgPt.y);
}

function toggleFieldWeld(checked) { state.fieldWeld = checked; renderVisual(); }
function toggleWeldAllAround(checked) { state.weldAllAround = checked; renderVisual(); }
function setChainStagger(val) { state.chainStagger = val; renderVisual(); }

function stepNext() { if (state.step < STEP_COUNT - 1) { state.step++; render(); } }
function stepBack() { if (state.step > 0) { state.step--; render(); } }

function selectJoint(key) {
  state.joint = key;
  const avail = getAvailableWelds(key, state.showAdvanced);
  if (!avail.includes(state.weld)) {
    state.weld = avail[0];
    initParams(state.weld);
  }
  render();
}
function selectWeld(key) {
  state.weld = key;
  initParams(key);
  render();
}
function selectSide(side) { state.side = side; render(); }
function toggleAdvanced(checked) {
  state.showAdvanced = checked;
  const avail = getAvailableWelds(state.joint, state.showAdvanced);
  if (!avail.includes(state.weld)) { state.weld = avail[0]; initParams(state.weld); }
  render();
}
function setTail(val) { state.tailText = val; renderVisual(); }
function setParam(key, val) {
  const def = PARAM_DEFS[key];
  if (def && def.type === "select") {
    state.params[key] = val;
    state.touchedParams[key] = true;
    renderVisual();
    return;
  }
  const num = parseFloat(val);
  if (!isNaN(num)) {
    state.params[key] = num;
    state.touchedParams[key] = true;
    renderVisual();
  }
}
function finalizeParam(key, inputEl) {
  const def = PARAM_DEFS[key];
  if (def && def.type === "select") return; // selects have no free-typed value to clamp
  let num = parseFloat(inputEl.value);
  if (isNaN(num)) num = def.default;
  num = clamp(num, def.min, def.max);
  state.params[key] = num;
  inputEl.value = num;
  renderVisual();
}

// Clicking or activating a variable label on the diagram jumps to the
// Dimensions panel (switching to Freeform mode if needed), highlights the
// matching field, and moves keyboard focus into it.
function selectVariable(key) {
  if (!PARAM_DEFS[key] || !WELD_TYPES[state.weld].params.includes(key)) return;
  state.selectedVariable = key;
  if (state.mode !== "freeform") {
    setMode("freeform");
  } else {
    render();
  }
  const input = document.getElementById("p-" + key);
  if (input) {
    const group = input.closest(".field-group");
    if (group && group.scrollIntoView) group.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus();
  }
}

// Focusing a label via keyboard (Tab) without activating it still surfaces
// its description, so keyboard users get the same detail mouse users get on hover.
function previewVariable(key) {
  const def = PARAM_DEFS[key];
  if (def) setFeedback(def.label + " \u2014 " + def.hint);
}

// ---------- Panel builders ----------
function buildJointStep(container) {
  const fs = document.createElement("fieldset");
  fs.innerHTML = `<legend>Select the joint type</legend>`;
  const grid = document.createElement("div");
  grid.className = "choice-grid";
  Object.keys(JOINT_TYPES).forEach(key => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice-btn" + (state.joint === key ? " selected" : "");
    b.textContent = JOINT_TYPES[key].label;
    b.onclick = () => selectJoint(key);
    grid.appendChild(b);
  });
  fs.appendChild(grid);
  container.appendChild(fs);
  setFeedback(JOINT_TYPES[state.joint].desc);
}

function buildWeldStep(container) {
  const fs = document.createElement("fieldset");
  fs.innerHTML = `<legend>Select the weld / groove type</legend>`;
  const grid = document.createElement("div");
  grid.className = "choice-grid";
  const avail = getAvailableWelds(state.joint, state.showAdvanced);
  Object.keys(WELD_TYPES).forEach(key => {
    const b = document.createElement("button");
    b.type = "button";
    const isAvail = avail.includes(key);
    b.className = "choice-btn" + (state.weld === key ? " selected" : "");
    b.textContent = WELD_TYPES[key].label + (isAdvancedCombo(state.joint, key) ? " ★" : "");
    b.disabled = !isAvail;
    b.onclick = () => selectWeld(key);
    grid.appendChild(b);
  });
  fs.appendChild(grid);
  container.appendChild(fs);

  const label = document.createElement("label");
  label.className = "advanced-toggle";
  label.innerHTML = `<input type="checkbox" id="adv-check" ${state.showAdvanced ? "checked" : ""}> Show uncommon combinations (★ advanced)`;
  container.appendChild(label);
  document.getElementById("adv-check").onchange = (e) => toggleAdvanced(e.target.checked);

  setFeedback(WELD_TYPES[state.weld].note);
}

function buildSideStep(container) {
  const fs = document.createElement("fieldset");
  fs.innerHTML = `<legend>Weld placement</legend>`;
  const toggle = document.createElement("div");
  toggle.className = "side-toggle";
  const opts = [
    { key: "arrow", label: "Arrow side" },
    { key: "other", label: "Other side" },
    { key: "double", label: "Both (double)" }
  ];
  opts.forEach(o => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = o.label;
    b.className = state.side === o.key ? "active" : "";
    b.disabled = o.key === "double" && !DOUBLE_ALLOWED[state.weld];
    b.onclick = () => selectSide(o.key);
    toggle.appendChild(b);
  });
  fs.appendChild(toggle);
  container.appendChild(fs);

  const fsArrow = document.createElement("fieldset");
  fsArrow.innerHTML = `<legend>Arrow position on joint</legend>`;
  const hasOverride = !!state.arrowOverrides[state.joint];
  const arrowControls = document.createElement("div");
  arrowControls.className = "arrow-calibrate";
  arrowControls.innerHTML = `
    <button type="button" id="btn-calibrate" class="${state.calibrating ? "active" : ""}">${state.calibrating ? "Click the diagram to set the arrow\u2026" : "Set arrow position"}</button>
    <button type="button" id="btn-reset-arrow" ${hasOverride ? "" : "disabled"}>Reset to default</button>
    <div class="field-hint">
      ${state.calibrating
        ? "Click anywhere on the joint diagram \u2014 including either member \u2014 to point the arrow there."
        : (hasOverride ? "Arrow position has been customized for this joint." : "Uses the default root location for this joint.")}
    </div>`;
  fsArrow.appendChild(arrowControls);
  container.appendChild(fsArrow);
  document.getElementById("btn-calibrate").onclick = () => toggleCalibrate(!state.calibrating);
  document.getElementById("btn-reset-arrow").onclick = () => resetArrowOverride();

  const fsSymbols = document.createElement("fieldset");
  fsSymbols.innerHTML = `<legend>Supplementary symbols</legend>`;
  const symWrap = document.createElement("div");
  symWrap.innerHTML = `
    <label class="dims-toggle"><input type="checkbox" id="toggle-field-weld" ${state.fieldWeld ? "checked" : ""}> Field weld (flag)</label>
    <label class="dims-toggle"><input type="checkbox" id="toggle-weld-all-around" ${state.weldAllAround ? "checked" : ""}> Weld-all-around (circle)</label>`;
  fsSymbols.appendChild(symWrap);
  container.appendChild(fsSymbols);
  document.getElementById("toggle-field-weld").onchange = (e) => toggleFieldWeld(e.target.checked);
  document.getElementById("toggle-weld-all-around").onchange = (e) => toggleWeldAllAround(e.target.checked);

  if (state.weld === "fillet" && state.side === "double" &&
      state.params.length !== undefined && state.params.pitch !== undefined) {
    const fsChain = document.createElement("fieldset");
    fsChain.innerHTML = `<legend>Intermittent weld pattern</legend>`;
    const chainToggle = document.createElement("div");
    chainToggle.className = "side-toggle";
    ["chain", "staggered"].forEach(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = v === "chain" ? "Chain" : "Staggered";
      b.className = state.chainStagger === v ? "active" : "";
      b.onclick = () => setChainStagger(v);
      chainToggle.appendChild(b);
    });
    fsChain.appendChild(chainToggle);
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = "Chain: welds on both sides align. Staggered: welds on the other side are offset so segments don't line up.";
    fsChain.appendChild(hint);
    container.appendChild(fsChain);
  }

  const fs2 = document.createElement("fieldset");
  fs2.innerHTML = `<legend>Tail (optional)</legend>`;
  const tailGroup = document.createElement("div");
  tailGroup.className = "field-group tail-input";
  tailGroup.innerHTML = `<label for="tail-text">Process / spec note</label>
    <input type="text" id="tail-text" placeholder="e.g. FCAW, D1.1" value="${state.tailText}">
    <div class="field-hint">Shown as an open V at the end of the reference line. The diagram widens automatically for longer notes. Leave blank to omit the tail entirely.</div>`;
  fs2.appendChild(tailGroup);
  container.appendChild(fs2);
  document.getElementById("tail-text").oninput = (e) => setTail(e.target.value);

  setFeedback("Below the reference line = weld goes on the arrow side of the joint. Above the line = the other side. Symbols on both sides = a double weld.");
}

function buildParamsStep(container) {
  const fs = document.createElement("fieldset");
  fs.innerHTML = `<legend>Dimensions</legend>`;
  WELD_TYPES[state.weld].params.forEach(key => {
    const def = PARAM_DEFS[key];
    if (!def) return; // version-mismatch guard, matches initParams
    const val = state.params[key];
    const group = document.createElement("div");
    group.className = "field-group" + (state.selectedVariable === key ? " var-highlight" : "");

    if (def.type === "select") {
      const optionsHtml = def.options.map(o =>
        `<option value="${o.value}" ${val === o.value ? "selected" : ""}>${o.label}</option>`
      ).join("");
      group.innerHTML = `
        <label for="p-${key}">${def.label}</label>
        <select id="p-${key}">${optionsHtml}</select>
        <div class="field-hint">${def.hint}</div>`;
      fs.appendChild(group);
      // Attach immediately — the element is already in the live DOM at this
      // point (appendChild is synchronous), so no setTimeout is needed, and
      // none of the deferred-callback races that come with it.
      group.querySelector("select").onchange = (e) => setParam(key, e.target.value);
    } else {
      group.innerHTML = `
        <label for="p-${key}">${def.label}</label>
        <div class="number-input-row">
          <input type="number" id="p-${key}" min="${def.min}" max="${def.max}" step="${def.step}" value="${fmt(val)}">
          <span class="unit-suffix">${def.unit}</span>
        </div>
        <div class="field-hint">${def.hint} Range: ${fmt(def.min)}\u2013${fmt(def.max)} ${def.unit}.</div>`;
      fs.appendChild(group);
      const inputEl = group.querySelector("input");
      inputEl.oninput = (e) => setParam(key, e.target.value);
      inputEl.onblur = (e) => finalizeParam(key, e.target);
    }
  });
  container.appendChild(fs);
  setFeedback(state.weld === "square"
    ? "Square grooves have no angle or root face — just a root opening. Best suited to thin material."
    : "A Weld Depth of 0 indicates complete joint penetration (CJP) — the default assumption unless a partial depth is specified.");
}

function setFeedback(text) {
  const box = document.getElementById("feedback-box");
  document.getElementById("feedback-text").textContent = text;
  box.style.display = text ? "block" : "none";
}

// ---------- Render ----------
function renderVisual() {
  document.getElementById("tb-joint").textContent = JOINT_TYPES[state.joint].label;
  document.getElementById("tb-weld").textContent = WELD_TYPES[state.weld].label;
  document.getElementById("tb-side").textContent = { arrow: "Arrow side", other: "Other side", double: "Double" }[state.side];
  document.querySelector(".sheet").classList.toggle("calibrating", state.calibrating);
  const svg = document.getElementById("symbol-svg");
  try {
    renderSymbol(svg, state);
  } catch (err) {
    // Never leave the sheet silently blank on an unexpected error — surface
    // something recoverable instead of a mysterious empty diagram.
    console.error("Symbol render failed:", err);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", "0 0 900 420");
    const msg = document.createElementNS("http://www.w3.org/2000/svg", "text");
    msg.setAttribute("x", "450");
    msg.setAttribute("y", "200");
    msg.setAttribute("text-anchor", "middle");
    msg.setAttribute("fill", "#E8EEF5");
    msg.setAttribute("font-family", "'IBM Plex Sans Condensed', sans-serif");
    msg.setAttribute("font-size", "16");
    msg.textContent = "Couldn't draw the symbol \u2014 try switching joint or weld type.";
    svg.appendChild(msg);
  }
}

function render() {
  const root = document.getElementById("panel-root");
  root.innerHTML = "";

  if (state.mode === "guided") {
    const progress = document.getElementById("step-progress");
    progress.innerHTML = "";
    for (let i = 0; i < STEP_COUNT; i++) {
      const dot = document.createElement("div");
      dot.className = "step-dot" + (i < state.step ? " done" : i === state.step ? " current" : "");
      progress.appendChild(dot);
    }
    [buildJointStep, buildWeldStep, buildSideStep, buildParamsStep][state.step](root);
    document.getElementById("btn-back").disabled = state.step === 0;
    document.getElementById("btn-next").textContent = state.step === STEP_COUNT - 1 ? "Done" : "Next";
    document.getElementById("btn-next").disabled = false;
  } else {
    buildJointStep(root);
    buildWeldStep(root);
    buildSideStep(root);
    buildParamsStep(root);
  }

  renderVisual();
}

function fmt(n) {
  if (n === undefined || n === null) return "";
  return (Math.round(n * 10000) / 10000).toString().replace(/^0\./, ".");
}

document.getElementById("toggle-dims").onchange = (e) => toggleDimensions(e.target.checked);
document.getElementById("symbol-svg").addEventListener("click", handleSvgClick);

render();
