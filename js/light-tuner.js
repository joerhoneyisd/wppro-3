/* Light tuner: a small box for adjusting the hero rocket's lights live.
   Same idea as the portfolio's ArtParallaxTuner. Loaded on demand by
   js/hero-rocket.js, which opens it when you click the rocket (only on
   localhost / file:// or with ?tune in the URL).

   Pick a light, then type a number or drag the grip beside a field:
   right/up increases, left/down decreases. Hold Shift for 10x, Alt for 0.1x.
   Everything updates live. "Copy changes" puts a prompt on the clipboard
   with every light you changed, to paste back to Claude to save.

   window.LightTuner.open({
     title:   "wppro-2 rocket lights",  // used in the copied prompt
     lights:  LIGHTS,                   // the live config object (edited in place)
     apply:   function (name) {},       // push LIGHTS[name] onto the scene
   });
   Object entries become lights; number entries become "Scene" fields.
   Keys named color are colours; arrays are [x, y, z]. */
(function () {
  "use strict";
  if (window.LightTuner) return;

  var STEPS = { intensity: 0.05, distance: 0.1, decay: 0.05, flicker: 0.05, offsetY: 0.01, position: 0.1 };
  var NOTES = {
    color: "colour",
    intensity: "brightness",
    position: "x right, y up, z toward you",
    distance: "reach",
    decay: "falloff with distance",
    flicker: "intensity wobble",
    offsetY: "height at the nozzle",
    reflections: "all-round reflections",
    exposure: "overall brightness",
  };
  var round = function (n) { return Math.round(n * 1000) / 1000; };
  var hex6 = function (n) { return "#" + ("000000" + n.toString(16)).slice(-6); };
  var hex0x = function (n) { return "0x" + ("000000" + n.toString(16)).slice(-6); };
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  var same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };

  var css =
    ".light-tuner{position:fixed;top:16px;right:16px;z-index:100000;width:300px;max-height:calc(100vh - 32px);" +
    "overflow-y:auto;box-sizing:border-box;padding:10px 12px;background:#0f1115;color:#e8e6e1;" +
    "border-left:1px solid #3a3f4a;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}" +
    ".light-tuner *{box-sizing:border-box}" +
    ".light-tuner button,.light-tuner input,.light-tuner select{all:unset;box-sizing:border-box;border:1px solid #3a3f4a;" +
    "font:inherit;line-height:1.4;padding:1px 6px;cursor:pointer;color:inherit;background:transparent}" +
    ".light-tuner select{appearance:auto;flex:1;min-width:0;background:#0f1115}" +
    ".light-tuner input[type=number]{cursor:text;text-align:right;width:64px}" +
    ".light-tuner input[type=color]{width:64px;height:20px;padding:0 2px}" +
    ".light-tuner button:disabled{opacity:.4;cursor:default}" +
    ".light-tuner button:focus-visible,.light-tuner input:focus-visible,.light-tuner select:focus-visible{outline:1px solid #8fb4ff}" +
    ".lt-head,.lt-actions{display:flex;gap:8px}.lt-head{margin-bottom:8px}.lt-actions{margin-top:10px}" +
    ".lt-actions button{flex:1;text-align:center}.lt-actions button.lt-reset{flex:none}" +
    ".lt-row{display:flex;align-items:center;gap:6px;margin:3px 0}" +
    ".lt-label{width:84px;flex:none;white-space:pre}.lt-note{flex:1;font-size:10px;color:#8b909a}" +
    ".lt-grip{display:inline-flex;padding:2px 3px;color:#5d6470;cursor:ew-resize;touch-action:none;user-select:none}" +
    ".lt-section{margin-top:8px;padding-top:6px;border-top:1px solid #3a3f4a;text-transform:uppercase}" +
    ".lt-hint{margin-top:6px;font-size:10px;color:#8b909a}";

  var GRIP =
    '<svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">' +
    '<path d="M2 2v10M5 2v10M8 2v10" stroke="currentColor" stroke-width="1.2"/></svg>';

  var state = null; // { opts, initial, selected, box }

  function el(tag, props, kids) {
    var e = document.createElement(tag);
    for (var k in props || {}) {
      if (k === "class") e.className = props[k];
      else if (k === "html") e.innerHTML = props[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    }
    (kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  // A number field with a drag grip, like the portfolio tuner's Field.
  function numberField(label, value, step, note, onChange) {
    var input = el("input", { type: "number", step: String(step), value: String(value) });
    input.addEventListener("input", function () {
      var n = parseFloat(input.value);
      if (!isNaN(n)) onChange(round(n));
    });
    var grip = el("span", { class: "lt-grip", title: "Drag left/right or up/down (Shift 10x, Alt 0.1x)", html: GRIP });
    var drag = null;
    grip.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, v: parseFloat(input.value) || 0 };
    });
    grip.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var m = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      drag.v += (e.clientX - drag.x - (e.clientY - drag.y)) * step * m;
      drag.x = e.clientX;
      drag.y = e.clientY;
      var v = round(drag.v);
      input.value = String(v);
      onChange(v);
    });
    var end = function () { drag = null; };
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
    return el("div", { class: "lt-row" }, [el("span", { class: "lt-label" }, [label]), grip, input, el("span", { class: "lt-note" }, [note || ""])]);
  }

  function colorField(value, onChange) {
    var input = el("input", { type: "color", value: hex6(value) });
    var note = el("span", { class: "lt-note" }, [hex6(value)]);
    input.addEventListener("input", function () {
      note.textContent = input.value;
      onChange(parseInt(input.value.slice(1), 16));
    });
    return el("div", { class: "lt-row" }, [
      el("span", { class: "lt-label" }, ["color"]),
      el("span", { class: "lt-grip", style: "visibility:hidden", html: GRIP }),
      input,
      note,
    ]);
  }

  function lightNames() {
    return Object.keys(state.opts.lights).filter(function (k) { return typeof state.opts.lights[k] === "object"; });
  }
  function sceneNames() {
    return Object.keys(state.opts.lights).filter(function (k) { return typeof state.opts.lights[k] === "number"; });
  }
  function changed() {
    var L = state.opts.lights;
    return Object.keys(L).filter(function (k) { return !same(L[k], state.initial[k]); });
  }
  function set(name, key, value, index) {
    var L = state.opts.lights;
    if (key === null) L[name] = value;
    else if (index !== undefined) L[name][key][index] = value;
    else L[name][key] = value;
    state.opts.apply(name);
    refreshActions();
  }

  function render() {
    var L = state.opts.lights;
    var name = state.selected;
    var light = L[name];
    var box = state.box;
    box.innerHTML = "";

    var select = el("select", { "aria-label": "Light" });
    lightNames().forEach(function (n) {
      var o = el("option", { value: n }, [n]);
      if (n === name) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener("change", function () { state.selected = select.value; render(); });
    box.appendChild(el("div", { class: "lt-head" }, [select, el("button", { type: "button", onclick: close }, ["Close"])]));

    Object.keys(light).forEach(function (key) {
      var v = light[key];
      if (key === "color") {
        box.appendChild(colorField(v, function (c) { set(name, "color", c); }));
      } else if (Array.isArray(v)) {
        box.appendChild(el("div", { class: "lt-row" }, [
          el("span", { class: "lt-label" }, [key]),
          el("span", { class: "lt-note" }, [NOTES[key] || ""]),
        ]));
        ["x", "y", "z"].forEach(function (axis, i) {
          box.appendChild(numberField("  " + axis, v[i], STEPS[key] || 0.1, "", function (n) { set(name, key, n, i); }));
        });
      } else {
        box.appendChild(numberField(key, v, STEPS[key] || 0.05, NOTES[key], function (n) { set(name, key, n); }));
      }
    });

    var scene = sceneNames();
    if (scene.length) {
      box.appendChild(el("div", { class: "lt-section" }, ["Scene"]));
      scene.forEach(function (k) {
        box.appendChild(numberField(k, L[k], 0.05, NOTES[k], function (n) { set(k, null, n); }));
      });
    }

    state.copyBtn = el("button", { type: "button", onclick: copy });
    var reset = el("button", { type: "button", class: "lt-reset", onclick: function () {
      L[name] = clone(state.initial[name]);
      state.opts.apply(name);
      render();
    } }, ["Reset light"]);
    box.appendChild(el("div", { class: "lt-actions" }, [state.copyBtn, reset]));
    box.appendChild(el("div", { class: "lt-hint" }, ["Drag a grip right/up to increase. Shift 10x, Alt 0.1x. Esc closes."]));
    refreshActions();
  }

  function refreshActions() {
    if (!state || !state.copyBtn) return;
    var n = changed().length;
    state.copyBtn.textContent = "Copy changes (" + n + ")";
    state.copyBtn.disabled = !n;
  }

  // Lines in the same shape as the LIGHTS block, so they can be pasted straight in.
  function describe(k, v) {
    if (typeof v === "number") return k + ": " + v + ",";
    var parts = Object.keys(v).map(function (key) {
      var x = v[key];
      if (key === "color") return "color: " + hex0x(x);
      if (Array.isArray(x)) return key + ": [" + x.join(", ") + "]";
      return key + ": " + x;
    });
    return k + ": { " + parts.join(", ") + " },";
  }

  function copy() {
    var lines = ["Change the " + state.opts.title + " to this:"];
    changed().forEach(function (k) { lines.push(describe(k, state.opts.lights[k])); });
    var text = lines.join("\n");
    var btn = state.copyBtn;
    var done = function () {
      btn.textContent = "Copied";
      setTimeout(refreshActions, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy this:", text); });
    } else window.prompt("Copy this:", text);
  }

  function onKey(e) { if (e.key === "Escape") close(); }
  function close() {
    if (!state || !state.box) return;
    state.box.remove();
    state.box = null;
    window.removeEventListener("keydown", onKey);
  }

  window.LightTuner = {
    open: function (opts) {
      if (!document.getElementById("light-tuner-css")) {
        document.head.appendChild(el("style", { id: "light-tuner-css" }, [css]));
      }
      if (!state || state.opts.lights !== opts.lights) {
        state = { opts: opts, initial: clone(opts.lights), selected: null, box: null };
      }
      state.opts = opts;
      if (!state.selected) state.selected = lightNames().indexOf("key") >= 0 ? "key" : lightNames()[0];
      if (!state.box) {
        state.box = el("div", { class: "light-tuner", role: "dialog", "aria-label": "Light tuner" });
        document.body.appendChild(state.box);
        window.addEventListener("keydown", onKey);
      }
      render();
    },
    close: close,
    isOpenAt: function (target) { return !!(state && state.box && state.box.contains(target)); },
  };
})();
