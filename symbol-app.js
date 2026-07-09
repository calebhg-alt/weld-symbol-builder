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
  tailText: "",
  params: {}
};

const STEP_COUNT = 4;
const STEP_LABELS = ["Joint", "Weld Type", "Placement", "Dimensions"];

function initParams(weldKey) {
  const p = {};
  WELD_TYPES[weldKey].params.forEach(key => { p[key] = PARAM_DEFS[key].default; });
  state.params = p;
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
function setTail(val) { state.tailText = val; render(); }
function setParam(key, val) { state.params[key] = parseFloat(val); render(); }

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

  const fs2 = document.createElement("fieldset");
  fs2.innerHTML = `<legend>Tail (optional)</legend>`;
  const tailGroup = document.createElement("div");
  tailGroup.className = "field-group tail-input";
  tailGroup.innerHTML = `<label for="tail-text">Process / spec note</label>
    <input type="text" id="tail-text" placeholder="e.g. FCAW, D1.1" value="${state.tailText}">
    <div class="field-hint">Shown as an open V at the end of the reference line. Leave blank to omit the tail entirely.</div>`;
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
    const val = state.params[key];
    const group = document.createElement("div");
    group.className = "field-group";
    group.innerHTML = `
      <label for="p-${key}">${def.label} <span class="field-value">${fmt(val)} ${def.unit}</span></label>
      <input type="range" id="p-${key}" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}">
      <div class="field-hint">${def.hint}</div>`;
    fs.appendChild(group);
    setTimeout(() => {
      document.getElementById(`p-${key}`).oninput = (e) => setParam(key, e.target.value);
    }, 0);
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

  document.getElementById("tb-joint").textContent = JOINT_TYPES[state.joint].label;
  document.getElementById("tb-weld").textContent = WELD_TYPES[state.weld].label;
  document.getElementById("tb-side").textContent = { arrow: "Arrow side", other: "Other side", double: "Double" }[state.side];

  renderSymbol(document.getElementById("symbol-svg"), state);
}

function fmt(n) {
  if (n === undefined || n === null) return "";
  return (Math.round(n * 10000) / 10000).toString().replace(/^0\./, ".");
}

render();
