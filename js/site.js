/* Page behaviour for the home page: starfield pausing and the services showcase. */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------------------------------------------------------------------------
     Starfield: each .starry-sky section draws two full-screen fixed layers whose
     twinkle animation restyles and repaints them every frame. A section's stars
     are only visible while the section is on screen, so pause the rest.
     ------------------------------------------------------------------------- */
  function initStarfield() {
    var skies = document.querySelectorAll(".starry-sky");
    if (!skies.length || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle("is-offscreen", !entry.isIntersecting);
      });
    });
    skies.forEach(function (sky) {
      io.observe(sky);
    });
  }

  /* ---------------------------------------------------------------------------
     Services showcase: a tab list that auto-advances.
     A change runs one step at a time: the old pane slides out, the new pane
     slides in, then its icon draws itself stroke by stroke.
     Autoplay is timed by the CSS progress line on the active tab
     (animationend = advance), so pausing the line pauses the timer.
     ------------------------------------------------------------------------- */
  function initServices(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panes = tabs.map(function (tab) {
      return document.getElementById(tab.getAttribute("aria-controls"));
    });
    var stage = root.querySelector(".services-stage");
    var indicator = root.querySelector(".services-indicator");
    var playBtn = root.querySelector(".services-autoplay");
    var compact = window.matchMedia("(max-width: 900px)");
    var EASE_IN = "cubic-bezier(0.7, 0, 0.84, 0)";
    var EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
    var current = 0;
    var busy = false;
    var userPaused = reducedMotion.matches;
    var hovered = false;
    var focused = false;
    var visible = false;
    var drawnOnce = false;

    function placeIndicator() {
      var tab = tabs[current];
      var vertical = !compact.matches;
      root.style.setProperty("--ind-pos", (vertical ? tab.offsetTop : tab.offsetLeft) + "px");
      root.style.setProperty("--ind-size", (vertical ? tab.offsetHeight : tab.offsetWidth) + "px");
      tabs[0].parentNode.setAttribute("aria-orientation", vertical ? "vertical" : "horizontal");
    }
    function syncAutoplay() {
      var playing = !userPaused && !reducedMotion.matches;
      root.classList.toggle("is-autoplaying", playing);
      root.classList.toggle("is-held", hovered || focused || !visible);
      playBtn.setAttribute("aria-pressed", playing ? "false" : "true");
      playBtn.setAttribute("aria-label", playing ? "Pause autoplay" : "Start autoplay");
    }
    function slide(el, from, to, easing, duration) {
      if (reducedMotion.matches) return Promise.resolve();
      return el.animate([{ transform: from }, { transform: to }], { duration: duration, easing: easing }).finished;
    }

    var queued = null;
    function select(index, moveFocus) {
      if (busy) {
        queued = index; // run the most recent request once this change finishes
        if (moveFocus) tabs[index].focus();
        return;
      }
      if (index === current) return;
      busy = true;
      var dir = index > current ? 1 : -1;
      if (current === tabs.length - 1 && index === 0 && !moveFocus) dir = 1; // autoplay wrap keeps moving forward
      var oldPane = panes[current];
      var newPane = panes[index];
      tabs.forEach(function (tab, i) {
        var on = i === index;
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
      });
      if (moveFocus) tabs[index].focus();
      current = index;
      placeIndicator();

      var off = "translateX(calc(" + (dir > 0 ? "-" : "") + "100% - 6rem))";
      var on = "translateX(calc(" + (dir > 0 ? "" : "-") + "100% + 6rem))";
      oldPane.classList.remove("is-active", "is-drawn");
      oldPane.classList.add("is-leaving");
      slide(oldPane, "none", off, EASE_IN, 320)
        .then(function () {
          oldPane.classList.remove("is-leaving");
          newPane.classList.add("is-active");
          return slide(newPane, on, "none", EASE_OUT, 560);
        })
        .then(function () {
          newPane.classList.add("is-drawn");
          busy = false;
          if (queued !== null) {
            var next = queued;
            queued = null;
            select(next, false);
          }
        });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(i, false); });
      tab.addEventListener("keydown", function (e) {
        var next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        var target = null;
        if (next) target = (i + next + tabs.length) % tabs.length;
        else if (e.key === "Home") target = 0;
        else if (e.key === "End") target = tabs.length - 1;
        if (target === null) return;
        e.preventDefault();
        select(target, true);
      });
      tab.querySelector(".services-tab-progress").addEventListener("animationend", function () {
        if (i === current) select((current + 1) % tabs.length, false);
      });
    });
    playBtn.addEventListener("click", function () {
      userPaused = !userPaused;
      syncAutoplay();
    });
    root.addEventListener("mouseenter", function () { hovered = true; syncAutoplay(); });
    root.addEventListener("mouseleave", function () { hovered = false; syncAutoplay(); });
    root.addEventListener("focusin", function (e) { focused = e.target !== playBtn; syncAutoplay(); });
    root.addEventListener("focusout", function () { focused = false; syncAutoplay(); });

    // Swipe on touch screens.
    var startX = null;
    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse") startX = e.clientX;
    });
    stage.addEventListener("pointerup", function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50) select((current + (dx < 0 ? 1 : -1) + tabs.length) % tabs.length, false);
    });

    function onVisible(isVisible) {
      visible = isVisible;
      if (visible && !drawnOnce) {
        drawnOnce = true;
        panes[current].classList.add("is-drawn");
      }
      syncAutoplay();
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        onVisible(entries[0].isIntersecting);
      }, { threshold: 0.35 }).observe(root.querySelector(".services-board"));
    } else {
      onVisible(true);
    }

    window.addEventListener("resize", placeIndicator);
    compact.addEventListener("change", placeIndicator);
    if (document.fonts) document.fonts.ready.then(placeIndicator);
    reducedMotion.addEventListener("change", function (e) {
      if (e.matches) userPaused = true;
      syncAutoplay();
    });

    panes.forEach(function (pane, i) { pane.classList.toggle("is-active", i === current); });
    placeIndicator();
    syncAutoplay();
  }

  function init() {
    initStarfield();
    document.querySelectorAll(".services-showcase").forEach(initServices);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
