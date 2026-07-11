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
  touchedParams: {},
  additionalLines: [],  // extra reference lines beyond the first (stacked, sharing one joint/arrow/tail)
  activeLine: 0,         // which line is being edited: 0 = the fields above, 1+ = additionalLines[n-1]
  quiz: null             // active quiz session, or null when not quizzing — see startQuiz()
};

const STEP_COUNT = 4;
const STEP_LABELS = ["Joint", "Weld Type", "Placement", "Dimensions"];

// The single accessor every weld-editing function goes through. Line 0 IS
// the flat state object itself (not a copy) — that keeps every single-line
// workflow, and every existing test, working exactly as before. Only lines
// 1+ live in the additionalLines array.
function activeLine() {
  return state.activeLine === 0 ? state : state.additionalLines[state.activeLine - 1];
}
function newLine() {
  const weld = "fillet";
  return {
    weld, side: "arrow", params: initParams(weld), touchedParams: {}, selectedVariable: null,
    fieldWeld: false, weldAllAround: false, chainStagger: "chain"
  };
}
function addLine() {
  state.additionalLines.push(newLine());
  state.activeLine = state.additionalLines.length; // jump to editing the new line
  render();
}
function removeLine(index) {
  // index is the 0-based position within additionalLines (i.e. line number index+2)
  state.additionalLines.splice(index, 1);
  if (state.activeLine > state.additionalLines.length) state.activeLine = state.additionalLines.length;
  render();
}
function selectLine(index) {
  state.activeLine = index;
  render();
}

// ---------- Quiz mode ----------
// Reuses the exact same data (JOINT_TYPES, WELD_TYPES, PARAM_DEFS) and the
// exact same renderSymbol() the builder uses — a quiz question is just a
// randomly generated, fully-valid symbol scenario rendered read-only.
function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomStep(min, max, step) {
  const steps = Math.round((max - min) / step);
  const n = Math.floor(Math.random() * (steps + 1));
  return Math.round((min + n * step) * 10000) / 10000; // avoid float drift
}

function generateQuizScenario() {
  const joint = randomChoice(Object.keys(JOINT_TYPES));
  const avail = getAvailableWelds(joint, true);
  const weld = randomChoice(avail);
  const params = {};
  const touchedParams = {};
  WELD_TYPES[weld].params.forEach(key => {
    const def = PARAM_DEFS[key];
    if (!def) return;
    if (def.type === "select") {
      const real = def.options.map(o => o.value).filter(v => v !== "none");
      params[key] = Math.random() < 0.6 ? randomChoice(real) : "none";
    } else {
      params[key] = randomStep(def.min, def.max, def.step);
    }
    touchedParams[key] = true; // quiz symbols always show real values, never letter placeholders
  });
  const side = randomChoice(DOUBLE_ALLOWED[weld] ? ["arrow", "other", "double"] : ["arrow", "other"]);
  return { joint, weld, params, touchedParams, side };
}

function quizAppState(scenario) {
  return {
    joint: scenario.joint, weld: scenario.weld, side: scenario.side, params: scenario.params,
    touchedParams: scenario.touchedParams, selectedVariable: null, arrowOverrides: {}, calibrating: false,
    fieldWeld: false, weldAllAround: false, chainStagger: "chain", tailText: "", showDimensions: true,
    additionalLines: [], activeLine: -1 // -1: no line ever matches, so nothing renders as clickable
  };
}

function jointWeldLabel(joint, weld) {
  return JOINT_TYPES[joint].label + " \u2014 " + WELD_TYPES[weld].label;
}

// Builds one question: identify-the-symbol (joint + weld type) or
// read-the-dimension (a specific labeled value), chosen at random so a quiz
// covers both recognition and comprehension.
function generateQuestion() {
  const scenario = generateQuizScenario();
  const numericKeys = WELD_TYPES[scenario.weld].params.filter(k => PARAM_DEFS[k] && PARAM_DEFS[k].type !== "select");
  const canAskDimension = numericKeys.length > 0;
  const type = canAskDimension && Math.random() < 0.5 ? "dimension" : "identify";

  if (type === "identify") {
    const correct = jointWeldLabel(scenario.joint, scenario.weld);
    const distractors = new Set();
    let guard = 0;
    while (distractors.size < 3 && guard < 60) {
      guard++;
      const j = randomChoice(Object.keys(JOINT_TYPES));
      const w = randomChoice(getAvailableWelds(j, true));
      const label = jointWeldLabel(j, w);
      if (label !== correct) distractors.add(label);
    }
    const choices = shuffle([correct].concat(Array.from(distractors)));
    return {
      scenario, type,
      prompt: "What joint and weld type does this symbol show?",
      choices, correctAnswer: correct
    };
  } else {
    const key = randomChoice(numericKeys);
    const def = PARAM_DEFS[key];
    const correctVal = scenario.params[key];
    const correct = fmt(correctVal) + (def.unit ? " " + def.unit : "");
    const distractors = new Set();
    let guard = 0;
    while (distractors.size < 3 && guard < 60) {
      guard++;
      const v = randomStep(def.min, def.max, def.step);
      const label = fmt(v) + (def.unit ? " " + def.unit : "");
      if (label !== correct) distractors.add(label);
    }
    const choices = shuffle([correct].concat(Array.from(distractors)));
    return {
      scenario, type, key,
      prompt: "What is the " + def.label + " shown on this symbol?",
      choices, correctAnswer: correct
    };
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startQuiz(count) {
  state.quiz = {
    total: count, index: 0, score: 0, answered: false, selected: null,
    question: generateQuestion(), history: []
  };
  render();
}
function answerQuiz(choice) {
  const q = state.quiz;
  if (q.answered) return;
  q.answered = true;
  q.selected = choice;
  const correct = choice === q.question.correctAnswer;
  if (correct) q.score++;
  q.history.push({ correct });
  render();
}
function nextQuizQuestion() {
  const q = state.quiz;
  if (q.index + 1 >= q.total) {
    q.finished = true;
    render();
    return;
  }
  q.index++;
  q.answered = false;
  q.selected = null;
  q.question = generateQuestion();
  render();
}
function exitQuiz() {
  state.quiz = null;
  setMode("guided");
}
function retakeQuiz() {
  startQuiz(state.quiz.total);
}

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
  return p;
}

function setMode(mode) {
  state.mode = mode;
  document.getElementById("btn-mode-guided").classList.toggle("active", mode === "guided");
  document.getElementById("btn-mode-guided").setAttribute("aria-selected", mode === "guided");
  document.getElementById("btn-mode-freeform").classList.toggle("active", mode === "freeform");
  document.getElementById("btn-mode-freeform").setAttribute("aria-selected", mode === "freeform");
  document.getElementById("btn-mode-quiz").classList.toggle("active", mode === "quiz");
  document.getElementById("btn-mode-quiz").setAttribute("aria-selected", mode === "quiz");
  document.getElementById("mode-badge").textContent = mode === "guided" ? "Guided Mode" : mode === "freeform" ? "Freeform Mode" : "Quiz Mode";
  document.getElementById("guided-nav").style.display = mode === "guided" ? "flex" : "none";
  document.getElementById("step-progress").style.visibility = mode === "guided" ? "visible" : "hidden";
  document.getElementById("lines-root").style.display = mode === "quiz" ? "none" : "";
  document.getElementById("toggle-dims").parentElement.style.display = mode === "quiz" ? "none" : "";
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
  render(); // rebuilds the sidebar too — the button label and hint text
            // both need to change, not just the SVG (this was previously
            // calling renderVisual() only, so neither ever actually updated)
  if (on) {
    // Land keyboard focus on the first snap point immediately — otherwise a
    // keyboard user has no way to discover where the newly-shown, focusable
    // corners are without blindly tabbing through the whole diagram.
    setTimeout(() => {
      const firstSnap = document.querySelector("#symbol-svg .snap-point");
      if (firstSnap) firstSnap.focus();
    }, 0);
  } else {
    // Rebuilding the sidebar replaces the calibrate button with a new DOM
    // node, which silently drops focus — explicitly return it so keyboard
    // users don't lose their place.
    const btn = document.getElementById("btn-calibrate");
    if (btn) btn.focus();
  }
}
function setArrowOverride(x, y) {
  state.arrowOverrides[state.joint] = { x: Math.round(x), y: Math.round(y) };
  render(); // sidebar hint/reset-button state depends on this, not just the SVG
  // Re-focus the same snap point after the rebuild replaces it with a new
  // DOM node — otherwise a keyboard user's focus silently vanishes right
  // after the action that's supposed to keep them oriented.
  setTimeout(() => {
    const match = document.querySelector('#symbol-svg .snap-point[data-snap-x="' + Math.round(x) + '"][data-snap-y="' + Math.round(y) + '"]');
    if (match) match.focus();
  }, 0);
}
function resetArrowOverride() {
  delete state.arrowOverrides[state.joint];
  render();
  // The reset button itself becomes disabled once there's nothing left to
  // reset, so it can't hold focus — send it to "Set arrow position" instead.
  const cal = document.getElementById("btn-calibrate");
  if (cal) cal.focus();
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

  // Snap to the nearest marked corner if the click landed close to one —
  // exact, unambiguous, and immune to the imprecision of a raw pixel click.
  const SNAP_RADIUS = 16;
  const snapPoints = getSnapPoints(state.joint);
  let nearest = null, nearestDist = Infinity;
  snapPoints.forEach(sp => {
    const d = Math.hypot(sp.x - svgPt.x, sp.y - svgPt.y);
    if (d < nearestDist) { nearestDist = d; nearest = sp; }
  });
  if (nearest && nearestDist <= SNAP_RADIUS) {
    setArrowOverride(nearest.x, nearest.y);
  } else {
    setArrowOverride(svgPt.x, svgPt.y);
  }
}

function toggleFieldWeld(checked) { activeLine().fieldWeld = checked; renderVisual(); }
function toggleWeldAllAround(checked) { activeLine().weldAllAround = checked; renderVisual(); }
function setChainStagger(val) { activeLine().chainStagger = val; renderVisual(); }

function stepNext() { if (state.step < STEP_COUNT - 1) { state.step++; render(); } }
function stepBack() { if (state.step > 0) { state.step--; render(); } }

function applyParams(weldKey) {
  const line = activeLine();
  line.params = initParams(weldKey);
  line.touchedParams = {};
  if (line.selectedVariable && !WELD_TYPES[weldKey].params.includes(line.selectedVariable)) {
    line.selectedVariable = null;
  }
}
applyParams(state.weld);

function selectJoint(key) {
  state.joint = key;
  const avail = getAvailableWelds(key, state.showAdvanced);
  const line = activeLine();
  if (!avail.includes(line.weld)) {
    line.weld = avail[0];
    applyParams(line.weld);
  }
  render();
}
function selectWeld(key) {
  activeLine().weld = key;
  applyParams(key);
  render();
}
function selectSide(side) { activeLine().side = side; render(); }
function toggleAdvanced(checked) {
  state.showAdvanced = checked;
  const avail = getAvailableWelds(state.joint, state.showAdvanced);
  const line = activeLine();
  if (!avail.includes(line.weld)) { line.weld = avail[0]; applyParams(line.weld); }
  render();
}
function setTail(val) { state.tailText = val; renderVisual(); }
function setParam(key, val) {
  const def = PARAM_DEFS[key];
  const line = activeLine();
  if (def && def.type === "select") {
    line.params[key] = val;
    line.touchedParams[key] = true;
    renderVisual();
    return;
  }
  const num = parseFloat(val);
  if (!isNaN(num)) {
    line.params[key] = num;
    line.touchedParams[key] = true;
    renderVisual();
  }
}
function finalizeParam(key, inputEl) {
  const def = PARAM_DEFS[key];
  if (def && def.type === "select") return; // selects have no free-typed value to clamp
  let num = parseFloat(inputEl.value);
  if (isNaN(num)) num = def.default;
  num = clamp(num, def.min, def.max);
  activeLine().params[key] = num;
  inputEl.value = num;
  renderVisual();
}

// Clicking or activating a variable label on the diagram jumps to the
// Dimensions panel (switching to Freeform mode if needed), highlights the
// matching field, and moves keyboard focus into it.
function selectVariable(key) {
  const line = activeLine();
  if (!PARAM_DEFS[key] || !WELD_TYPES[line.weld].params.includes(key)) return;
  line.selectedVariable = key;
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
function buildLinesPanel() {
  const root = document.getElementById("lines-root");
  root.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "lines-panel";
  panel.innerHTML = `<div class="lines-panel-title">Reference Lines</div>`;
  const list = document.createElement("div");
  list.className = "lines-list";

  const total = 1 + state.additionalLines.length;
  for (let i = 0; i < total; i++) {
    const line = i === 0 ? state : state.additionalLines[i - 1];
    const row = document.createElement("div");
    row.className = "line-row";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "line-select" + (state.activeLine === i ? " active" : "");
    b.textContent = "Line " + (i + 1) + ": " + WELD_TYPES[line.weld].label;
    b.onclick = () => selectLine(i);
    row.appendChild(b);
    if (total > 1) {
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "line-remove";
      rm.setAttribute("aria-label", "Remove line " + (i + 1));
      rm.textContent = "\u2715";
      if (i === 0) {
        rm.disabled = true;
        rm.title = "The first line can't be removed \u2014 remove additional lines instead.";
      } else {
        rm.onclick = () => removeLine(i - 1);
      }
      row.appendChild(rm);
    }
    list.appendChild(row);
  }
  panel.appendChild(list);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn-add-line";
  addBtn.textContent = "+ Add reference line";
  addBtn.onclick = () => addLine();
  panel.appendChild(addBtn);

  if (total > 1) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.style.marginTop = "8px";
    hint.textContent = "Multiple reference lines share one joint, arrow, and tail \u2014 used to show a sequence of operations. Each line has its own weld type, placement, and dimensions.";
    panel.appendChild(hint);
  }

  root.appendChild(panel);
}

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
  const line = activeLine();
  Object.keys(WELD_TYPES).forEach(key => {
    const b = document.createElement("button");
    b.type = "button";
    const isAvail = avail.includes(key);
    b.className = "choice-btn" + (line.weld === key ? " selected" : "");
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

  setFeedback(WELD_TYPES[line.weld].note);
}

function buildSideStep(container) {
  const line = activeLine();
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
    b.className = line.side === o.key ? "active" : "";
    b.disabled = o.key === "double" && !DOUBLE_ALLOWED[line.weld];
    b.onclick = () => selectSide(o.key);
    toggle.appendChild(b);
  });
  fs.appendChild(toggle);
  container.appendChild(fs);

  const fsArrow = document.createElement("fieldset");
  fsArrow.innerHTML = `<legend>Arrow position on joint</legend>`;
  const hasOverride = !!state.arrowOverrides[state.joint];
  const needsFace = (line.weld === "bevel" || line.weld === "j" || line.weld === "flarebevel");
  const arrowControls = document.createElement("div");
  arrowControls.className = "arrow-calibrate";
  let defaultHint = "Uses the default root location for this joint.";
  if (needsFace) defaultHint += " Only one member is prepped for this weld \u2014 click a corner on that member to point the arrow at it.";
  arrowControls.innerHTML = `
    <button type="button" id="btn-calibrate" aria-pressed="${state.calibrating}" class="${state.calibrating ? "active" : ""}">${state.calibrating ? "Click the diagram to set the arrow\u2026" : "Set arrow position"}</button>
    <button type="button" id="btn-reset-arrow" ${hasOverride ? "" : "disabled"}>Reset to default</button>
    <div class="field-hint">
      ${state.calibrating
        ? "Gold circles mark each corner \u2014 click one to snap exactly to it, click anywhere else for a free position, or Tab to a corner and press Enter. Press Escape to stop."
        : (hasOverride ? "Arrow position has been customized for this joint." : defaultHint)}
      ${state.additionalLines.length ? " This arrow and joint are shared by every reference line." : ""}
    </div>`;
  fsArrow.appendChild(arrowControls);
  container.appendChild(fsArrow);
  document.getElementById("btn-calibrate").onclick = () => toggleCalibrate(!state.calibrating);
  document.getElementById("btn-reset-arrow").onclick = () => resetArrowOverride();

  const fsSymbols = document.createElement("fieldset");
  fsSymbols.innerHTML = `<legend>Supplementary symbols</legend>`;
  const symWrap = document.createElement("div");
  symWrap.innerHTML = `
    <label class="dims-toggle"><input type="checkbox" id="toggle-field-weld" ${line.fieldWeld ? "checked" : ""}> Field weld (flag)</label>
    <label class="dims-toggle"><input type="checkbox" id="toggle-weld-all-around" ${line.weldAllAround ? "checked" : ""}> Weld-all-around (circle)</label>`;
  fsSymbols.appendChild(symWrap);
  container.appendChild(fsSymbols);
  document.getElementById("toggle-field-weld").onchange = (e) => toggleFieldWeld(e.target.checked);
  document.getElementById("toggle-weld-all-around").onchange = (e) => toggleWeldAllAround(e.target.checked);

  if (line.weld === "fillet" && line.side === "double" &&
      line.touchedParams.length && line.touchedParams.pitch) {
    const fsChain = document.createElement("fieldset");
    fsChain.innerHTML = `<legend>Intermittent weld pattern</legend>`;
    const chainToggle = document.createElement("div");
    chainToggle.className = "side-toggle";
    ["chain", "staggered"].forEach(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = v === "chain" ? "Chain" : "Staggered";
      b.className = line.chainStagger === v ? "active" : "";
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
    <div class="field-hint">Shown as an open V at the end of the reference line${state.additionalLines.length ? " stack" : ""}. The diagram widens automatically for longer notes. Leave blank to omit the tail entirely.</div>`;
  fs2.appendChild(tailGroup);
  container.appendChild(fs2);
  document.getElementById("tail-text").oninput = (e) => setTail(e.target.value);

  setFeedback("Below the reference line = weld goes on the arrow side of the joint. Above the line = the other side. Symbols on both sides = a double weld.");
}

function buildDimensionsFieldset(weldKey, params, touched, selectedVar, setFn, finalizeFn, legend) {
  const fs = document.createElement("fieldset");
  fs.innerHTML = `<legend>${legend}</legend>`;
  WELD_TYPES[weldKey].params.forEach(key => {
    const def = PARAM_DEFS[key];
    if (!def) return; // version-mismatch guard, matches initParams
    const val = params[key];
    const group = document.createElement("div");
    group.className = "field-group" + (selectedVar === key ? " var-highlight" : "");

    if (def.type === "select") {
      const optionsHtml = def.options.map(o =>
        `<option value="${o.value}" ${val === o.value ? "selected" : ""}>${o.label}</option>`
      ).join("");
      group.innerHTML = `
        <label for="p-${key}">${def.label}</label>
        <select id="p-${key}">${optionsHtml}</select>
        <div class="field-hint">${def.hint}</div>`;
      fs.appendChild(group);
      group.querySelector("select").onchange = (e) => setFn(key, e.target.value);
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
      inputEl.oninput = (e) => setFn(key, e.target.value);
      inputEl.onblur = (e) => finalizeFn(key, e.target);
    }
  });
  return fs;
}

function buildParamsStep(container) {
  const line = activeLine();
  container.appendChild(buildDimensionsFieldset(
    line.weld, line.params, line.touchedParams, line.selectedVariable,
    setParam, finalizeParam, "Dimensions"
  ));
  setFeedback(line.weld === "square"
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
  if (state.mode === "quiz") { renderQuizVisual(); return; }
  const line = activeLine();
  document.getElementById("tb-joint").textContent = JOINT_TYPES[state.joint].label;
  document.getElementById("tb-weld").textContent = WELD_TYPES[line.weld].label + (state.additionalLines.length ? " (Line " + (state.activeLine + 1) + ")" : "");
  document.getElementById("tb-side").textContent = { arrow: "Arrow side", other: "Other side", double: "Double" }[line.side];
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

function renderQuizVisual() {
  const svg = document.getElementById("symbol-svg");
  document.querySelector(".sheet").classList.remove("calibrating");
  if (!state.quiz || !state.quiz.question) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    document.getElementById("tb-joint").textContent = "\u2014";
    document.getElementById("tb-weld").textContent = "\u2014";
    document.getElementById("tb-side").textContent = "\u2014";
    return;
  }
  const q = state.quiz.question;
  document.getElementById("tb-joint").textContent = state.quiz.answered ? JOINT_TYPES[q.scenario.joint].label : "?";
  document.getElementById("tb-weld").textContent = state.quiz.answered ? WELD_TYPES[q.scenario.weld].label : "?";
  document.getElementById("tb-side").textContent = state.quiz.answered
    ? { arrow: "Arrow side", other: "Other side", double: "Double" }[q.scenario.side] : "?";
  try {
    renderSymbol(svg, quizAppState(q.scenario));
  } catch (err) {
    console.error("Quiz symbol render failed:", err);
  }
}

function render() {
  if (state.mode === "quiz") {
    document.getElementById("panel-root").innerHTML = "";
    buildQuizPanel(document.getElementById("panel-root"));
    renderVisual();
    return;
  }
  buildLinesPanel();
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

function buildQuizPanel(container) {
  const panel = document.createElement("div");
  panel.className = "quiz-panel";

  if (!state.quiz) {
    panel.innerHTML = `
      <div class="quiz-start">
        <h3>Practice Quiz</h3>
        <p>Random weld symbols are drawn on the sheet \u2014 identify the joint and weld type, or read a dimension straight off the symbol.</p>
        <div class="quiz-count-select" id="quiz-count-select" role="group" aria-label="Number of questions">
          ${[5, 10, 25].map(n => `<button type="button" data-n="${n}" aria-pressed="${n === 10}" class="${n === 10 ? "active" : ""}">${n} questions</button>`).join("")}
        </div>
        <button type="button" class="btn-start-quiz" id="btn-start-quiz">Start Quiz</button>
      </div>`;
    container.appendChild(panel);
    let selectedCount = 10;
    panel.querySelectorAll("#quiz-count-select button").forEach(b => {
      b.onclick = () => {
        panel.querySelectorAll("#quiz-count-select button").forEach(x => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("active");
        b.setAttribute("aria-pressed", "true");
        selectedCount = parseInt(b.dataset.n, 10);
      };
    });
    document.getElementById("btn-start-quiz").onclick = () => startQuiz(selectedCount);
    return;
  }

  const q = state.quiz;
  if (q.finished) {
    const pct = Math.round((q.score / q.total) * 100);
    panel.innerHTML = `
      <div class="quiz-results" role="status">
        <div>Quiz complete</div>
        <div class="big-score">${q.score} / ${q.total}</div>
        <p>${pct}% correct</p>
        <div class="quiz-results-actions">
          <button type="button" class="btn-start-quiz" id="btn-retake">Retake</button>
          <button type="button" class="btn-secondary" id="btn-exit-quiz">Back to Builder</button>
        </div>
      </div>`;
    container.appendChild(panel);
    document.getElementById("btn-retake").onclick = () => retakeQuiz();
    document.getElementById("btn-exit-quiz").onclick = () => exitQuiz();
    return;
  }

  // aria-live="polite": screen reader users hear the updated question count
  // and score automatically as the quiz progresses, without needing to
  // re-navigate to this element after every answer.
  const progress = document.createElement("div");
  progress.className = "quiz-progress";
  progress.setAttribute("aria-live", "polite");
  progress.innerHTML = `<span>Question ${q.index + 1} of ${q.total}</span><span class="score">Score: ${q.score}</span>`;
  panel.appendChild(progress);

  const question = document.createElement("div");
  question.className = "quiz-question";
  question.id = "quiz-question-text";
  question.textContent = q.question.prompt;
  panel.appendChild(question);

  const choices = document.createElement("div");
  choices.className = "quiz-choices";
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-labelledby", "quiz-question-text");
  q.question.choices.forEach(choice => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "quiz-choice";
    if (q.answered) {
      b.disabled = true;
      // Correct/incorrect are marked with text (✓/✗), not color alone —
      // color-blind users and screen reader users get the same information
      // everyone else does, not just a color change.
      if (choice === q.question.correctAnswer) {
        b.classList.add("correct");
        b.textContent = "\u2713 " + choice;
      } else if (choice === q.selected) {
        b.classList.add("incorrect");
        b.textContent = "\u2717 " + choice;
      } else {
        b.textContent = choice;
      }
    } else {
      b.textContent = choice;
      b.onclick = () => answerQuiz(choice);
    }
    choices.appendChild(b);
  });
  panel.appendChild(choices);

  if (q.answered) {
    const correct = q.selected === q.question.correctAnswer;
    const feedback = document.createElement("div");
    feedback.className = "quiz-feedback " + (correct ? "correct" : "incorrect");
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "assertive");
    feedback.textContent = correct
      ? "Correct!"
      : "Not quite \u2014 the correct answer is " + q.question.correctAnswer + ".";
    panel.appendChild(feedback);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn-next-question";
    nextBtn.textContent = q.index + 1 >= q.total ? "See results" : "Next question";
    nextBtn.onclick = () => nextQuizQuestion();
    panel.appendChild(nextBtn);
    // Move focus to the next-question button so keyboard/screen-reader users
    // land somewhere useful after answering, instead of focus vanishing
    // into the now-disabled choice button.
    setTimeout(() => nextBtn.focus(), 0);
  }

  container.appendChild(panel);
}

function fmt(n) {
  if (n === undefined || n === null) return "";
  return (Math.round(n * 10000) / 10000).toString().replace(/^0\./, ".");
}

document.getElementById("toggle-dims").onchange = (e) => toggleDimensions(e.target.checked);
document.getElementById("symbol-svg").addEventListener("click", handleSvgClick);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.calibrating) {
    toggleCalibrate(false);
    const btn = document.getElementById("btn-calibrate");
    if (btn) btn.focus();
  }
});

render();
