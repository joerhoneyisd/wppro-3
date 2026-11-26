/* ===== js-present.js ===== */
/**
 * wppro-hf — the HEAD script. Five duties, none of them behaviour.
 *
 * This file exists so the collapse of a mobile nav can be a CSS fact rather than a
 * JavaScript action. Everything HF hides on a phone -- the drawer, a search panel, an
 * overlay dialog -- is hidden by channel 1 keyed on attributes THIS script puts on
 * <html> before <body> is parsed, and every toggle that reveals one is hidden by default
 * and revealed by the same attributes. So at first paint the page is already in a
 * consistent state (collapsed list + visible toggle, or expanded list + no toggle) and
 * there is no expanded-then-collapsed flash for a runtime to cause.
 *
 * The five duties (landing plan 1.F):
 *   1. stamp `data-wppro-hf-js` on <html> immediately;
 *   2. add/remove `data-wppro-hf-mobile` from matchMedia, and on its change -- never a
 *      falsy VALUE, because every consumer is a presence selector;
 *   3. at DOMContentLoaded, measure the sticky chrome and publish its height as
 *      `--wppro-hf-sticky-h-<edge>` so the scroll-padding in site.css is real;
 *   4. capture an EARLY ACTIVATION: a tap on a toggle that the drawer runtime has not
 *      bound yet drops `data-wppro-hf-js`, which expands the list and hides every toggle
 *      in the same frame. A visitor who is fast is never left tapping a dead control;
 *   5. run the WATCHDOG: if the drawer runtime never arrived, drop `data-wppro-hf-js` so
 *      the page falls back to the no-JS shape rather than keeping a collapsed list behind
 *      a toggle nothing is listening to.
 *
 * MUST be enqueued in the head, blocking, and NEVER as a module: `document.currentScript`
 * is null in a module, and the breakpoint arrives as a query argument on this file's own
 * src (`js-present.js?bp=768`) because nothing in WordPress obliges a theme to call
 * language_attributes(), which is where the `data-wppro-hf-bp` fallback comes from.
 */
(function () {
    'use strict';

    var root = document.documentElement;
    var BP_DEFAULT = 768;

    /* ---- the breakpoint, from the most reliable source available ------------- */

    // Read at top level, synchronously: document.currentScript is only meaningful
    // while this script is executing.
    function bpFromSrc() {
        var s = document.currentScript;
        if (!s || !s.src) { return 0; }
        var m = /[?&]bp=(\d+)/.exec(s.src);
        return m ? parseInt(m[1], 10) : 0;
    }

    var bp = bpFromSrc() || parseInt(root.getAttribute('data-wppro-hf-bp'), 10) || BP_DEFAULT;
    if (!(bp >= 320 && bp <= 1600)) { bp = BP_DEFAULT; }

    /* ---- 1. JavaScript is present ------------------------------------------- */

    root.setAttribute('data-wppro-hf-js', '');

    /* ---- 2. below the breakpoint? ------------------------------------------- */

    function syncMobile(matches) {
        if (matches) { root.setAttribute('data-wppro-hf-mobile', ''); }
        else { root.removeAttribute('data-wppro-hf-mobile'); }
    }

    var mq = window.matchMedia ? window.matchMedia('(max-width: ' + bp + 'px)') : null;
    if (mq) {
        syncMobile(mq.matches);
        if (mq.addEventListener) {
            mq.addEventListener('change', function (e) { syncMobile(e.matches); });
        } else if (mq.addListener) {
            mq.addListener(function (e) { syncMobile(e.matches); });
        }
    }

    /* ---- 4. the early activation -------------------------------------------- */

    // A toggle carries `data-wppro-hf-toggle-bound` once mobile-drawer.js has wired it.
    // Until then a tap on one would do nothing, so we take the no-JS branch instead:
    // dropping `data-wppro-hf-js` releases the collapse (the list expands) and re-hides
    // every toggle, in the same frame, with no node moved. The runtime arriving later
    // binds without re-collapsing, because nothing imperative collapses any more.
    function earlyActivation(e) {
        var t = (e.target && e.target.closest) ? e.target.closest('[data-wppro-hf-toggle]') : null;
        if (!t) { return; }
        standDown();
        if (!t.hasAttribute('data-wppro-hf-toggle-bound')) {
            root.removeAttribute('data-wppro-hf-js');
        }
    }

    function standDown() {
        document.removeEventListener('click', earlyActivation, true);
    }

    document.addEventListener('click', earlyActivation, true);

    /* ---- 3 + 5. DOMContentLoaded work --------------------------------------- */

    // Publish the sticky bar's height so site.css's scroll-padding clears it exactly
    // instead of guessing 6rem. Writing a custom property on <html> is the one runtime
    // style write this plugin makes: it is a MEASUREMENT, and no stylesheet can hold it.
    function observeSticky() {
        if (typeof window.ResizeObserver !== 'function') { return; }
        // The property names are written OUT, not assembled from an edge, so a grep for
        // either one finds this writer. site.css reads them by the same literal.
        var pairs = [
            { sel: 'header[class*="wppro-header-p"]', prop: '--wppro-hf-sticky-h-top' },
            { sel: 'footer[class*="wppro-footer-p"]', prop: '--wppro-hf-sticky-h-bottom' }
        ];
        for (var i = 0; i < pairs.length; i++) {
            (function (pair) {
                var el = document.querySelector(pair.sel);
                if (!el) { return; }
                var ro = new ResizeObserver(function () {
                    var h = Math.round(el.getBoundingClientRect().height);
                    root.style.setProperty(pair.prop, h + 'px');
                });
                ro.observe(el);
            }(pairs[i]));
        }
    }

    function watchdog() {
        if (!root.hasAttribute('data-wppro-hf-drawer-ready')) {
            root.removeAttribute('data-wppro-hf-js');
            standDown();
        }
    }

    // A parser-blocking classic footer script, and a deferred one, have executed (or
    // failed) before DOMContentLoaded; only an `async` tag may still be in flight, so
    // for that one case the check moves to `load`. No tag at all is treated as blocking,
    // which is the safe answer: the runtime is not coming.
    //
    // The setTimeout is not a delay for its own sake. mobile-drawer.js stamps
    // `data-wppro-hf-drawer-ready` from ITS DOMContentLoaded listener, which is
    // registered later than this one and therefore runs after it; a macrotask queued at
    // DOMContentLoaded runs after every listener for that event, which is the earliest
    // instant at which the question "did the runtime arrive?" has a true answer.
    function scheduleWatchdog() {
        var tag = document.querySelector('script[src*="mobile-drawer"]');
        if (tag && tag.async) {
            window.addEventListener('load', function () { window.setTimeout(watchdog, 0); });
            return;
        }
        window.setTimeout(watchdog, 0);
    }

    function onReady() {
        observeSticky();
        scheduleWatchdog();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
}());
;

/* ===== hf-modal.js ===== */
/**
 * wppro-hf — the modal/dismissal contract, extracted so more than one thing can wear it.
 *
 * Everything a revealed panel owes a keyboard or screen-reader user, in one place:
 * focus moved in and trapped, body scroll locked, a backdrop that closes on click,
 * Escape (innermost first), an outside tap, and focus restored to the control that
 * opened it. The mobile drawer was the only consumer when this lived inline in
 * mobile-drawer.js; a placed Menu Toggle's target region wants the identical contract, and
 * a second copy of a focus trap is a second place to get it wrong.
 *
 * Three options is the whole seam:
 *   isInnerOpen()  -- something inside the panel is itself open, so Escape belongs to
 *                     THAT and this handler stands aside (a dropdown inside the drawer).
 *   backdropHost   -- the element the scrim is appended to (the nav, not the drawer:
 *                     a scrim inside the thing it dims would be covered by it).
 *   onActivate()   -- what to focus once the panel is up. Defaults to the first
 *                     focusable inside it.
 *
 * ONE MODAL AT A TIME. Every handler begins by standing down while a native
 * `dialog[open]` is on screen: the UA has made the rest of the document inert and owns
 * Escape, so a second listener answering it would close the wrong thing. HF emits no
 * <dialog> of its own any more (the search's modal mode is gone), so the dialog this
 * guards against is now someone else's -- a theme's, another plugin's -- which is exactly
 * the case where getting Escape wrong is least excusable.
 */
(function () {
    'use strict';

    var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    function visibleFocusables(root) {
        return Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE))
            .filter(function (el) {
                return el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
            });
    }

    function nativeDialogOpen() {
        return !!document.querySelector('dialog[open]');
    }

    /**
     * @param {object} opts
     *   panel        {Element}  the revealed region
     *   trigger      {Element}  the control that opened it (focus is restored here)
     *   modal        {boolean}  trap + scrim + scroll lock, or just Escape/outside
     *   onClose      {Function} the consumer's own close(); called by Escape/backdrop/outside
     *   isInnerOpen  {Function} optional
     *   backdropHost {Element}  optional
     *   backdropClass{string}   optional
     *   onActivate   {Function} optional
     *   boundary     {Element}  optional; the node an "outside" click is measured against
     *   includeTrigger {boolean} optional; the trigger stays in view as the close control
     *                          (a menu laid over the page BELOW its bar), so the focus loop
     *                          is [trigger, ...panel] in that order, whatever the DOM order
     */
    function create(opts) {
        var panel = opts.panel;
        var trigger = opts.trigger;
        var modal = !!opts.modal;
        var includeTrigger = !!opts.includeTrigger;
        var onClose = opts.onClose || function () {};
        var isInnerOpen = opts.isInnerOpen || function () { return false; };
        var backdropHost = opts.backdropHost || panel.parentNode;
        var backdropClass = opts.backdropClass || 'wppro-hf-drawer-backdrop';
        var onActivate = opts.onActivate || null;
        var boundary = opts.boundary || panel;

        var backdrop = null;
        var keyHandler = null;
        var outsideHandler = null;
        var savedOverflow = '';

        function focusables() {
            var list = visibleFocusables(panel);
            if (includeTrigger && trigger && trigger.getClientRects().length) {
                list.unshift(trigger);
            }
            return list;
        }

        function engage() {
            if (modal) {
                backdrop = document.createElement('div');
                backdrop.className = backdropClass;
                backdrop.setAttribute('data-wppro-hf-open', '');
                backdropHost.appendChild(backdrop);
                backdrop.addEventListener('click', function () { onClose(); });

                savedOverflow = document.body.style.overflow;
                document.body.style.overflow = 'hidden';

                if (onActivate) {
                    onActivate(panel);
                } else {
                    // Into the panel, never onto the trigger the loop may also hold.
                    var f = visibleFocusables(panel);
                    if (f.length) { f[0].focus(); }
                }

                keyHandler = function (e) {
                    if (nativeDialogOpen()) { return; }
                    if (e.key === 'Escape') {
                        if (isInnerOpen()) { return; }
                        e.preventDefault();
                        onClose();
                        return;
                    }
                    if (e.key !== 'Tab') { return; }
                    var list = focusables();
                    if (!list.length) { return; }
                    if (includeTrigger) {
                        // An explicit loop: the trigger may come AFTER the panel in the
                        // document (a menu button at the end of its bar), so the browser's
                        // own order cannot be left to fill in the middle.
                        var at = list.indexOf(document.activeElement);
                        var to = (at === -1) ? 0 : (at + (e.shiftKey ? -1 : 1) + list.length) % list.length;
                        e.preventDefault();
                        list[to].focus();
                        return;
                    }
                    var first = list[0], last = list[list.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                };
                document.addEventListener('keydown', keyHandler, true);
                return;
            }

            keyHandler = function (e) {
                if (nativeDialogOpen()) { return; }
                if (e.key === 'Escape') {
                    if (isInnerOpen()) { return; }
                    onClose();
                }
            };
            document.addEventListener('keydown', keyHandler);

            outsideHandler = function (e) {
                if (nativeDialogOpen()) { return; }
                if (!boundary.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) {
                    onClose();
                }
            };
            // Deferred by one turn so the click that opened the panel does not
            // immediately close it again.
            window.setTimeout(function () { document.addEventListener('click', outsideHandler); }, 0);
        }

        function release() {
            if (backdrop) {
                // Fade out, then remove once the transition has had its say.
                var bd = backdrop;
                bd.removeAttribute('data-wppro-hf-open');
                window.setTimeout(function () {
                    if (bd.parentNode) { bd.parentNode.removeChild(bd); }
                }, 260);
                backdrop = null;
            }
            if (modal) { document.body.style.overflow = savedOverflow; }
            if (keyHandler) {
                document.removeEventListener('keydown', keyHandler, true);
                document.removeEventListener('keydown', keyHandler);
                keyHandler = null;
            }
            if (outsideHandler) {
                document.removeEventListener('click', outsideHandler);
                outsideHandler = null;
            }
            // WAI-ARIA: closing a disclosure returns focus to its trigger -- but only
            // when focus is still inside the region that is going away, so we never
            // steal it from someone who tabbed or clicked on elsewhere.
            if (trigger && (panel.contains(document.activeElement) || document.activeElement === document.body)) {
                trigger.focus();
            }
        }

        return { engage: engage, release: release, focusables: focusables };
    }

    window.WpproHfModal = { create: create, focusables: visibleFocusables, FOCUSABLE: FOCUSABLE };
}());
;

/* ===== nav-runtime.js ===== */
/**
 * wppro-hf — the nav disclosure runtime.
 *
 * Implements the WAI-ARIA Authoring Practices DISCLOSURE pattern for site navigation
 * (NOT a menubar -- that hurts screen-reader users here). Two trigger shapes the view
 * emits:
 *   .wppro-hf-nav-disclosure : a no-link dropdown item -- the label IS the button.
 *   .wppro-hf-nav-expand     : sits after a real <a> (link + expand = two tab stops).
 * Both carry aria-controls -> the panel and aria-expanded, kept in sync with the panel's
 * `wppro-hf-active` class AND with `data-wppro-hf-open` on the item's <li>, which is what
 * the open-state colour rule in channel 1 keys on.
 *
 * Two things this file used to do and does not any more:
 *   - it extracted an `hf_p<id>_` class prefix out of every nav and RETURNED SILENTLY
 *     when the regex missed, which disabled every dropdown on the page with no error.
 *     Classes are bare literals now.
 *   - it matched the current URL against every link and stamped aria-current. That is a
 *     server-side fact -- the view knows the permalink -- so the view stamps
 *     `aria-current="page"` and `data-wppro-hf-current`, and this file reads them.
 *
 * Nav-level data attributes (from the element's inspector):
 *   data-expand-trigger  hover-click (default) | click-only
 *   data-open-current    1 | 0   -- open the group containing the current page on load
 *   data-remember        none | session | local
 *   data-open-mode       single (accordion) | multi
 *   data-nav-key         stable key for storage scoping
 * Per item: data-group-key on the disclosure <li>.
 *
 * Keyboard: Enter/Space toggles (native button); Escape closes and restores focus to the
 * trigger; ArrowDown/Up + Home/End move within an open panel. Zero dependencies.
 */
(function () {
    'use strict';

    var ROOT = document.documentElement;
    var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    var STORAGE_PREFIX = 'wppro-hf-nav-open:';
    var ACTIVE = 'wppro-hf-active';
    var INSTANT = 'wppro-hf-nav-instant';

    function readSettings(nav) {
        var trigger = (nav.getAttribute('data-expand-trigger') || 'hover-click').toLowerCase();
        if (trigger === 'click_only') { trigger = 'click-only'; }
        if (trigger !== 'click-only') { trigger = 'hover-click'; }
        var remember = (nav.getAttribute('data-remember') || 'none').toLowerCase();
        if (remember !== 'session' && remember !== 'local') { remember = 'none'; }
        var openMode = (nav.getAttribute('data-open-mode') || 'single').toLowerCase();
        if (openMode !== 'multi') { openMode = 'single'; }
        return {
            expandTrigger: trigger,
            openCurrent: nav.getAttribute('data-open-current') === '1',
            remember: remember,
            openMode: openMode,
            navKey: nav.getAttribute('data-nav-key') || nav.getAttribute('data-nav-name') || 'nav'
        };
    }

    function storageApi(kind) {
        try {
            if (kind === 'session') { return window.sessionStorage; }
            if (kind === 'local') { return window.localStorage; }
        } catch (e) { /* private mode */ }
        return null;
    }

    function storageKey(navKey) {
        return STORAGE_PREFIX + navKey;
    }

    function loadOpenKeys(navKey, remember) {
        var store = storageApi(remember);
        if (!store) { return []; }
        try {
            var raw = store.getItem(storageKey(navKey));
            if (!raw) { return []; }
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch (e) {
            return [];
        }
    }

    function saveOpenKeys(navKey, remember, keys) {
        var store = storageApi(remember);
        if (!store) { return; }
        try {
            if (!keys.length) { store.removeItem(storageKey(navKey)); }
            else { store.setItem(storageKey(navKey), JSON.stringify(keys)); }
        } catch (e) { /* quota / private mode */ }
    }

    function groupKeyOf(g) {
        if (g.li) {
            var k = g.li.getAttribute('data-group-key');
            if (k) { return k; }
        }
        return g.trigger ? (g.trigger.getAttribute('aria-controls') || '') : '';
    }

    function setupNav(nav) {
        if (nav.getAttribute('data-wppro-hf-nav-ready') === '1') { return; }

        var settings = readSettings(nav);
        var instantTimer;

        // Briefly suppress the panel open/close animation, so switching directly between
        // two open dropdowns swaps instantly instead of re-popping each one -- what read
        // as a "flash" on a fast hover sweep.
        function flashInstant() {
            nav.classList.add(INSTANT);
            clearTimeout(instantTimer);
            instantTimer = setTimeout(function () { nav.classList.remove(INSTANT); }, 90);
        }

        var bpAttr = parseInt(ROOT.getAttribute('data-wppro-hf-bp'), 10)
                  || parseInt(nav.getAttribute('data-breakpoint'), 10)
                  || 768;

        // One source of "are we on the bar or in the drawer": the root attribute
        // js-present.js maintains. The width compare is only the fallback for a page
        // that never got the head script.
        function isDesktop() {
            if (ROOT.hasAttribute('data-wppro-hf-js')) {
                return !ROOT.hasAttribute('data-wppro-hf-mobile');
            }
            return window.innerWidth > bpAttr;
        }

        var triggers = nav.querySelectorAll('.wppro-hf-nav-disclosure,.wppro-hf-nav-expand');
        var groups = [];

        function persistOpen() {
            if (settings.remember === 'none') { return; }
            var keys = [];
            groups.forEach(function (g) {
                if (g.isOpen()) {
                    var k = groupKeyOf(g);
                    if (k) { keys.push(k); }
                }
            });
            saveOpenKeys(settings.navKey, settings.remember, keys);
        }

        Array.prototype.forEach.call(triggers, function (trigger) {
            var panel = document.getElementById(trigger.getAttribute('aria-controls'));
            var li = trigger.closest('li');
            if (!panel || !li) { return; }
            var g = { trigger: trigger, panel: panel, li: li };
            groups.push(g);

            function panelFocusables() {
                return Array.prototype.slice.call(panel.querySelectorAll(FOCUSABLE))
                    .filter(function (el) { return el.offsetParent !== null; });
            }

            g.open = function (opts) {
                opts = opts || {};
                clearTimeout(g.closeTimer);
                var swapped = 0;
                if (settings.openMode === 'single') { swapped = closeOthers(g); }
                if (swapped) { flashInstant(); }
                // A full-bleed mega is sized to the viewport BEFORE it is shown, so it
                // never paints once at its narrow li-anchored width and then jumps.
                var isFullMega = (li.getAttribute('data-wppro-hf-mega-width') === 'full');
                if (isFullMega) { positionPanel(panel); }
                panel.classList.add(ACTIVE);
                // The trigger's state and the item's state are written together: the
                // colour rule keys on the <li>, the assistive tech on the button.
                trigger.setAttribute('aria-expanded', 'true');
                li.setAttribute('data-wppro-hf-open', '');
                if (!isFullMega) { positionPanel(panel); }
                if (!opts.silent) { persistOpen(); }
            };
            g.close = function (opts) {
                opts = opts || {};
                panel.classList.remove(ACTIVE);
                trigger.setAttribute('aria-expanded', 'false');
                li.removeAttribute('data-wppro-hf-open');
                if (!opts.silent) { persistOpen(); }
            };
            g.isOpen = function () { return panel.classList.contains(ACTIVE); };

            trigger.addEventListener('click', function (e) {
                e.preventDefault();
                if (g.isOpen()) { g.close(); } else { g.open(); focusFirst(); }
            });

            function focusFirst() {
                // Only pull focus into the panel for keyboard/AT activation, not a mouse
                // click (which would yank the page). No cross-browser :focus-visible test
                // exists here, so the heuristic is that the keyboard path leaves the
                // trigger focused before the click.
                if (document.activeElement === trigger) {
                    var f = panelFocusables();
                    if (f.length) { f[0].focus(); }
                }
            }

            // Desktop hover, with a short close delay so a boundary crossing on the way
            // to a wide panel does not close and reopen it.
            if (settings.expandTrigger === 'hover-click') {
                li.addEventListener('mouseenter', function () {
                    if (isDesktop()) { clearTimeout(g.closeTimer); g.open(); }
                });
                li.addEventListener('mouseleave', function () {
                    if (isDesktop()) {
                        clearTimeout(g.closeTimer);
                        g.closeTimer = setTimeout(function () { g.close(); }, 140);
                    }
                });
            }

            g.li.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && g.isOpen()) {
                    e.preventDefault();
                    g.close();
                    trigger.focus();
                }
            });

            panel.addEventListener('keydown', function (e) {
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(e.key) === -1) { return; }
                var f = panelFocusables();
                if (!f.length) { return; }
                var i = f.indexOf(document.activeElement);
                e.preventDefault();
                if (e.key === 'Home') { f[0].focus(); }
                else if (e.key === 'End') { f[f.length - 1].focus(); }
                else if (e.key === 'ArrowDown') { f[(i + 1 + f.length) % f.length].focus(); }
                else if (e.key === 'ArrowUp') { f[(i - 1 + f.length) % f.length].focus(); }
            });

            // Focus leaving the whole group closes it (desktop tab-through). Hover menus
            // only -- a click-only / multi vertical rail should stay open.
            if (settings.expandTrigger === 'hover-click') {
                g.li.addEventListener('focusout', function (e) {
                    if (!isDesktop()) { return; }
                    var to = e.relatedTarget;
                    if (!to || (!g.li.contains(to) && !panel.contains(to))) { g.close(); }
                });
            }
        });

        function closeOthers(except) {
            var closed = 0;
            groups.forEach(function (g) {
                if (g === except) { return; }
                clearTimeout(g.closeTimer);
                if (g.isOpen()) { g.close({ silent: true }); closed++; }
            });
            if (closed) { persistOpen(); }
            return closed;
        }

        document.addEventListener('click', function (e) {
            if (nav.contains(e.target)) { return; }
            if (settings.openMode === 'multi' && settings.expandTrigger === 'click-only') { return; }
            closeOthers(null);
        });

        /**
         * Keep an open panel inside the viewport.
         *
         * Every panel is `position:absolute; left:0` against its own <li>, so an item in
         * the right-hand half of a nav opens a panel that runs off the right edge. Three
         * things have to be right at once:
         *
         *  1. IT RUNS FOR EVERY PANEL, not only megas. The rightmost item on a nav is very
         *     often a plain single-column dropdown (a language menu, a utility list).
         *  2. IT MEASURES GEOMETRICALLY, from the <li>'s position plus the panel's
         *     offsetWidth -- neither of which a transform can distort -- because the open
         *     animation transitions `transform` and a mid-flight rect has not settled.
         *  3. IT CLAMPS BOTH EDGES, left winning: a panel wider than the viewport pushed
         *     until its right edge fits drives its LEFT edge off instead.
         *
         * The correction is written to `left`, which is not in the transition list, so it
         * applies immediately rather than sliding into place. Channel 1's
         * max-width:calc(100vw - 2rem) guarantees a fit is always findable.
         */
        function positionPanel(panel) {
            var vw = document.documentElement.clientWidth;
            var li = panel.parentNode;
            if (!li || !li.getBoundingClientRect) { return; }

            // Positioning is a desktop job. Below the breakpoint the panel is in flow
            // inside the drawer -- position:static -- so `left` does nothing but `width`
            // very much does. The inline values are CLEARED rather than merely skipped, or
            // a visitor who opened a mega on a desktop and then narrowed the window would
            // carry a stale width into a drawer with nothing left to remove it.
            if (!isDesktop()) {
                panel.style.left = '';
                panel.style.width = '';
                return;
            }

            if (li.getAttribute && li.getAttribute('data-wppro-hf-mega-width') === 'full') {
                panel.style.left = (-li.getBoundingClientRect().left) + 'px';
                panel.style.width = vw + 'px';
                return;
            }

            panel.style.left = '';

            var GUTTER = 8;
            var liLeft = li.getBoundingClientRect().left;
            var width = panel.offsetWidth;
            var left = liLeft;
            var shift = 0;

            if (left + width > vw - GUTTER) { shift = (vw - GUTTER) - (left + width); }
            if (left + shift < GUTTER) { shift = GUTTER - left; }

            if (shift) { panel.style.left = Math.round(shift) + 'px'; }
        }

        // Crossing the breakpoint re-runs the positioning for anything still open.
        var reflow;
        window.addEventListener('resize', function () {
            clearTimeout(reflow);
            reflow = setTimeout(function () {
                groups.forEach(function (g) {
                    if (g.isOpen && g.isOpen()) { positionPanel(g.panel); }
                    else if (g.panel) { g.panel.style.left = ''; g.panel.style.width = ''; }
                });
            }, 120);
        });

        // Restore remembered groups, then open the current-page ancestor if configured.
        // `data-wppro-hf-current-ancestor` is stamped by the view from a server-side URL
        // match, so this needs no client-side comparison of its own.
        var remembered = loadOpenKeys(settings.navKey, settings.remember);
        if (remembered.length) {
            groups.forEach(function (g) {
                if (remembered.indexOf(groupKeyOf(g)) !== -1) { g.open({ silent: true }); }
            });
        }
        if (settings.openCurrent) {
            groups.forEach(function (g) {
                if (g.li && g.li.hasAttribute('data-wppro-hf-current-ancestor')) {
                    g.open({ silent: true });
                }
            });
        }
        persistOpen();

        // READY IS THE LAST THING, not the first. It used to be stamped on entry and then
        // the function bailed two lines later, so a nav that failed to wire still claimed
        // to be wired -- and channel 1's no-JS panel fallback stands down on this exact
        // attribute.
        nav.setAttribute('data-wppro-hf-nav-ready', '1');
    }

    function init(root) {
        var ctx = root || document;
        var navs = ctx.querySelectorAll('nav.wppro-hf-nav');
        Array.prototype.forEach.call(navs, setupNav);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
        init();
    }
    window.initWpproHfNav = init;
}());
;

/* ===== mobile-drawer.js ===== */
/**
 * wppro-hf — the mobile drawer controller.
 *
 * WHAT THIS FILE NO LONGER DOES, which is most of the change.
 *
 * It used to COLLAPSE the nav: the markup shipped expanded and this script added a
 * `has-drawer` class that switched the list to display:none, plus an `anim-off` class to
 * stop that first collapse animating, plus an `is-ready` class to reveal a placed toggle.
 * Three imperative states, one visible flash, and a nav that was unusable for the
 * milliseconds before a footer script ran. Collapse is now a CSS fact keyed on attributes
 * js-present.js writes on <html> in the head (see that file), so this script's only job is
 * BEHAVIOUR: open, close, trap, restore.
 *
 * It also no longer extracts an `hf_p<id>_` scope prefix out of a class attribute. Every
 * class is now the bare literal, and every lookup is bounded by `closest('nav')` or
 * `closest('[data-wppro-hf-chrome]')` instead.
 *
 * The state lives on the <nav>, as `data-drawer-open`, and is written in the SAME call
 * that writes `aria-expanded` on every toggle bound to that drawer -- the nav's own
 * hamburger and any placed Menu Toggle -- so the two can never disagree.
 *
 * Reveal styles split modal vs non-modal (ADA-correct):
 *   dropdown                   -> NON-modal: Escape + outside click, no trap, no lock.
 *   slide / overlay / fullscreen -> MODAL: focus in and trapped, scroll locked, a scrim,
 *                                 Escape/backdrop close, focus restored. See hf-modal.js.
 */
(function () {
    'use strict';

    var ROOT = document.documentElement;

    /**
     * THE RUNTIME REFUSES TO BIND WITHOUT ITS MECHANICS.
     *
     * Channel 1 declares `html{--wppro-hf-mechanics:1}`. If that stylesheet did not load,
     * nothing is collapsed and nothing is hidden -- so binding a toggle would lock body
     * scroll and trap focus inside a panel the visitor can already see, with no visible
     * "close". Hiding every toggle and standing down leaves a plain, complete, reachable
     * nav, which is the correct failure.
     *
     * A render-blocking head stylesheet has parsed or failed before any footer script
     * runs, so this reads a settled value.
     */
    function mechanicsPresent() {
        try {
            return getComputedStyle(ROOT).getPropertyValue('--wppro-hf-mechanics').trim() !== '';
        } catch (e) {
            return false;
        }
    }

    function drawerOf(nav) {
        return nav.querySelector(':scope > .wppro-hf-drawer');
    }

    /* ---- where a dropdown opens --------------------------------------------- */

    // Element children that take part in layout: no <style>/<script>, and a box.
    function laidOutChildren(el) {
        return Array.prototype.filter.call(el.children, function (c) {
            return !/^(STYLE|SCRIPT|TEMPLATE|LINK)$/.test(c.tagName) && c.getClientRects().length > 0;
        });
    }

    function isRow(el) {
        var cs = getComputedStyle(el);
        return (cs.display.indexOf('flex') !== -1 && cs.flexDirection.indexOf('row') === 0)
            || cs.display.indexOf('grid') !== -1;
    }

    /**
     * THE BAR A DROPPED-DOWN MENU OPENS UNDER, found from the chrome's own structure and
     * never from a class name: past the single-child wrappers under the landmark (plAI's
     * render wrapper, a lone section), what is left either stacks several bands -- and the
     * bar is the band holding the button -- or is one row, and the bar is the landmark.
     * Returns the bar and the row whose content edge the menu's rows line up with.
     */
    function barOf(anchor, chrome) {
        var root = chrome;
        var kids = laidOutChildren(root);
        while (kids.length === 1 && !isRow(root)) {
            root = kids[0];
            kids = laidOutChildren(root);
        }
        var bar = chrome;
        if (!isRow(root)) {
            for (var i = 0; i < kids.length; i++) {
                if (kids[i].contains(anchor)) { bar = kids[i]; break; }
            }
        }
        // The row: descend the bar's own single-child wrappers to the first element that
        // lays several things out, which is where the bar's side padding lives.
        var row = bar;
        var inner = laidOutChildren(row);
        while (inner.length === 1 && !isRow(row)) {
            row = inner[0];
            inner = laidOutChildren(row);
        }
        return { bar: bar, row: row };
    }

    /**
     * Place an open dropdown: its top at the bar's bottom, its left edge and width the
     * chrome's, and its side padding the bar's content inset. Written as custom properties
     * the mechanics sheet reads -- MEASUREMENTS, the one kind of runtime style write this
     * plugin makes -- relative to the nav, which is the drawer's containing block (it is
     * position:relative, or absolute once a placed toggle has taken its button over).
     */
    function placeDropdown(nav, drawer, anchor) {
        // The nav carries data-wppro-hf-chrome itself, so the landmark is its nearest
        // ANCESTOR that does, else the document body.
        var chrome = (nav.parentElement && nav.parentElement.closest('[data-wppro-hf-chrome]')) || document.body;
        var found = barOf(anchor || nav, chrome);
        var nr = nav.getBoundingClientRect();
        var br = found.bar.getBoundingClientRect();
        var cr = chrome.getBoundingClientRect();
        var rr = found.row.getBoundingClientRect();
        var rs = getComputedStyle(found.row);
        var inset = (rr.left + (parseFloat(rs.borderLeftWidth) || 0) + (parseFloat(rs.paddingLeft) || 0)) - cr.left;
        drawer.style.setProperty('--wppro-hf-drop-top', Math.round(br.bottom - nr.top - nav.clientTop) + 'px');
        drawer.style.setProperty('--wppro-hf-drop-left', Math.round(cr.left - nr.left - nav.clientLeft) + 'px');
        drawer.style.setProperty('--wppro-hf-drop-width', Math.round(cr.width) + 'px');
        drawer.style.setProperty('--wppro-hf-drop-inset', Math.max(0, Math.round(inset)) + 'px');
        // The overlay's line, in VIEWPORT coordinates (it is position:fixed, and the page
        // cannot scroll while it is up). On the nav, so its scrim reads the same value.
        nav.style.setProperty('--wppro-hf-overlay-top', Math.max(0, Math.round(br.bottom)) + 'px');
    }

    /* ---- one controller per nav --------------------------------------------- */

    var controllers = (typeof WeakMap === 'function') ? new WeakMap() : null;
    var fallbackKey = '__wpproHfDrawer';

    function getController(nav) {
        return controllers ? controllers.get(nav) : nav[fallbackKey];
    }

    function setController(nav, c) {
        if (controllers) { controllers.set(nav, c); } else { nav[fallbackKey] = c; }
    }

    function makeController(nav, drawer) {
        var reveal = nav.getAttribute('data-reveal') || 'dropdown';
        var modal = (reveal === 'slide' || reveal === 'overlay' || reveal === 'fullscreen');
        var toggles = [];
        var session = null;
        var opener = null;

        function isOpen() { return nav.hasAttribute('data-drawer-open'); }

        function isMobile() {
            if (ROOT.hasAttribute('data-wppro-hf-mobile')) { return true; }
            // Only reachable when js-present.js is absent, in which case nothing is
            // collapsed either; answering "no" keeps the resize close a no-op.
            return false;
        }

        // A per-item dropdown open INSIDE the drawer owns Escape first.
        function subPanelOpen() {
            return !!drawer.querySelector('.wppro-hf-panel.wppro-hf-active');
        }

        // ONE WRITE for the whole open/closed fact: the nav's attribute and every bound
        // toggle's aria-expanded, together. A spec asserts they never disagree.
        function setState(open) {
            if (open) { nav.setAttribute('data-drawer-open', ''); }
            else { nav.removeAttribute('data-drawer-open'); }
            for (var i = 0; i < toggles.length; i++) {
                toggles[i].setAttribute('aria-expanded', open ? 'true' : 'false');
            }
        }

        /**
         * A PLACED BUTTON THAT COMES AFTER ITS MENU IN THE PAGE -- a menu button at the end
         * of the bar, its nav earlier in the row -- opens a non-modal dropdown the keyboard
         * cannot reach: Tab moves on from the button to whatever follows it. So while it is
         * open, Tab from the button goes into the menu, Shift+Tab from the menu's first
         * control comes back to the button, and Tab from its last control carries on from
         * the button: the order the menu is SEEN in. A modal reveal moves focus in itself.
         */
        function onTab(e) {
            if (e.key !== 'Tab' || modal || !isOpen() || !opener || !window.WpproHfModal) { return; }
            if (!(opener.compareDocumentPosition(drawer) & Node.DOCUMENT_POSITION_PRECEDING)) { return; }
            var list = window.WpproHfModal.focusables(drawer);
            if (!list.length) { return; }
            var active = document.activeElement;
            if (active === opener && !e.shiftKey) {
                e.preventDefault();
                list[0].focus();
            } else if (active === list[0] && e.shiftKey) {
                e.preventDefault();
                opener.focus();
            } else if (active === list[list.length - 1] && !e.shiftKey) {
                // No preventDefault: focus moves to the button, and the Tab carries on
                // from there to the next control after it.
                opener.focus();
            }
        }

        function open(trigger) {
            if (isOpen()) { return; }
            opener = trigger || toggles[0] || null;
            setState(true);
            if (reveal === 'dropdown' || reveal === 'overlay') {
                placeDropdown(nav, drawer, opener);
            }
            if (reveal === 'dropdown') {
                document.addEventListener('keydown', onTab, true);
            }
            if (window.WpproHfModal) {
                session = window.WpproHfModal.create({
                    panel: drawer,
                    trigger: opener,
                    modal: modal,
                    onClose: close,
                    isInnerOpen: subPanelOpen,
                    backdropHost: nav,
                    backdropClass: 'wppro-hf-drawer-backdrop',
                    boundary: nav,
                    // The overlay leaves its button in view as the close control, so the
                    // focus loop runs through that button as well as the menu.
                    includeTrigger: reveal === 'overlay'
                });
                session.engage();
            }
        }

        function close() {
            if (!isOpen()) { return; }
            setState(false);
            document.removeEventListener('keydown', onTab, true);
            if (session) { session.release(); session = null; }
        }

        function toggleOpen(trigger) {
            if (isOpen()) { close(); } else { open(trigger); }
        }

        var closeBtn = drawer.querySelector('.wppro-hf-drawer-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) { e.preventDefault(); close(); });
        }

        // Activating a real navigation link inside the drawer closes it. `href="#"` is
        // the disclosure sentinel -- that one belongs to nav-runtime.js.
        drawer.addEventListener('click', function (e) {
            var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!a) { return; }
            var href = a.getAttribute('href') || '';
            if (href && href !== '#') { close(); }
        });

        // Back above the breakpoint: the drawer is no longer the way the nav is shown,
        // so leaving it "open" would strand the scroll lock and the trap. Still below it,
        // an open dropdown is measured again: the bar it hangs under has just reflowed.
        window.addEventListener('resize', function () {
            if (!isMobile()) { close(); return; }
            if (isOpen() && (reveal === 'dropdown' || reveal === 'overlay')) { placeDropdown(nav, drawer, opener); }
        });

        return {
            addToggle: function (toggle) {
                if (toggle.hasAttribute('data-wppro-hf-toggle-bound')) { return; }
                toggle.setAttribute('data-wppro-hf-toggle-bound', '');
                toggle.setAttribute('aria-controls', drawer.id);
                toggle.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
                toggles.push(toggle);
                toggle.addEventListener('click', function (e) {
                    e.preventDefault();
                    toggleOpen(toggle);
                });
            },
            close: close
        };
    }

    function controllerFor(nav) {
        var c = getController(nav);
        if (c) { return c; }
        var drawer = drawerOf(nav);
        if (!drawer || !drawer.id) { return null; }
        c = makeController(nav, drawer);
        setController(nav, c);
        return c;
    }

    /* ---- placed Menu Toggle -> which nav? ------------------------------------ */

    function resolveNav(toggle) {
        var target = toggle.getAttribute('data-target-nav');
        if (target) {
            var esc = (window.CSS && CSS.escape) ? CSS.escape(target) : target;
            var byName = document.querySelector('nav[data-nav-name="' + esc + '"]');
            if (byName && drawerOf(byName)) { return byName; }
            var el = document.getElementById(target);
            if (el) {
                var n = el.matches('nav') ? el : el.querySelector('nav');
                if (n && drawerOf(n)) { return n; }
            }
        }
        var root = toggle.closest('[data-wppro-hf-chrome]') || document;
        var navs = root.querySelectorAll('nav');
        for (var i = 0; i < navs.length; i++) {
            if (drawerOf(navs[i])) { return navs[i]; }
        }
        return null;
    }

    /* ---- placed Menu Toggle -> its own region -------------------------------- */

    /**
     * A Menu Toggle that carries children drives THAT content, not a nav: the view emits
     * it as a sibling region and puts the region's id in `data-wppro-hf-target`, so this
     * needs no search and no fallback -- a missing id means the author deleted the region,
     * and binding nothing is the correct answer.
     *
     * The open/closed fact lives on the region as `data-wppro-hf-open` and is written in
     * the SAME call as `aria-expanded` on every toggle bound to it, exactly as the drawer
     * does, so the two can never disagree.
     *
     * ALWAYS MODAL. The panel fills the viewport, so the rest of the document has to be
     * inert and the scroll has to be locked; the scrim goes to the region's own parent
     * rather than <body> because a sticky header is a stacking context and a scrim outside
     * it cannot be sat above from within it.
     */
    var regions = (typeof WeakMap === 'function') ? new WeakMap() : null;
    var regionKey = '__wpproHfRegion';

    function makeRegionController(region) {
        var toggles = [];
        var session = null;

        function isOpen() { return region.hasAttribute('data-wppro-hf-open'); }

        function setState(open) {
            if (open) { region.setAttribute('data-wppro-hf-open', ''); }
            else { region.removeAttribute('data-wppro-hf-open'); }
            for (var i = 0; i < toggles.length; i++) {
                toggles[i].setAttribute('aria-expanded', open ? 'true' : 'false');
            }
        }

        function open(trigger) {
            if (isOpen()) { return; }
            setState(true);
            if (window.WpproHfModal) {
                session = window.WpproHfModal.create({
                    panel: region,
                    trigger: trigger || toggles[0] || null,
                    modal: true,
                    onClose: close,
                    backdropHost: region.parentNode || region,
                    backdropClass: 'wppro-hf-drawer-backdrop',
                    boundary: region
                });
                session.engage();
            }
        }

        function close() {
            if (!isOpen()) { return; }
            setState(false);
            if (session) { session.release(); session = null; }
        }

        var closeBtn = region.querySelector('.wppro-hf-region-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) { e.preventDefault(); close(); });
        }

        // A real navigation link inside the region closes it, the same courtesy the drawer
        // extends: the page is about to change under an open modal otherwise.
        region.addEventListener('click', function (e) {
            var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!a) { return; }
            var href = a.getAttribute('href') || '';
            if (href && href !== '#') { close(); }
        });

        return {
            addToggle: function (toggle) {
                if (toggle.hasAttribute('data-wppro-hf-toggle-bound')) { return; }
                toggle.setAttribute('data-wppro-hf-toggle-bound', '');
                toggle.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
                toggles.push(toggle);
                toggle.addEventListener('click', function (e) {
                    e.preventDefault();
                    if (isOpen()) { close(); } else { open(toggle); }
                });
            },
            close: close
        };
    }

    function regionControllerFor(toggle) {
        var id = toggle.getAttribute('data-wppro-hf-target');
        if (!id) { return null; }
        var region = document.getElementById(id);
        if (!region) { return null; }
        var c = regions ? regions.get(region) : region[regionKey];
        if (c) { return c; }
        c = makeRegionController(region);
        if (regions) { regions.set(region, c); } else { region[regionKey] = c; }
        return c;
    }

    /* ---- init ---------------------------------------------------------------- */

    function init(root) {
        var ctx = root || document;

        if (!mechanicsPresent()) {
            var dead = document.querySelectorAll('[data-wppro-hf-toggle]');
            for (var d = 0; d < dead.length; d++) { dead[d].setAttribute('hidden', ''); }
            return;
        }

        var claimed = [];

        // 1) A placed Menu Toggle claims its nav and suppresses that nav's own hamburger,
        //    so a phone shows exactly one trigger, where the author put it. `hidden` (not
        //    an inline display) because `hidden` also removes it from the a11y tree, and
        //    because channel 1's reveal rules all carry `:not([hidden])`.
        var placed = ctx.querySelectorAll('[data-wppro-hf-menu-toggle]');
        Array.prototype.forEach.call(placed, function (toggle) {
            // A toggle that names its own region drives THAT and never touches a nav.
            // Without this branch resolveNav()'s "first nav with a drawer" fallback would
            // quietly hand it the primary menu, and the region would never open.
            if (toggle.hasAttribute('data-wppro-hf-target')) {
                var rc = regionControllerFor(toggle);
                if (rc) { rc.addToggle(toggle); }
                return;
            }
            // A nav-targeting toggle is a MOBILE-ONLY control, so one the author hid on
            // mobile can never be operated -- and claiming the nav anyway would take that
            // nav's own hamburger away and leave the menu with no trigger at all. Stand
            // down instead and let the nav keep its own.
            if (toggle.classList.contains('wppro-hf-hide-mobile')) { return; }
            var nav = resolveNav(toggle);
            if (!nav) { return; }
            var c = controllerFor(nav);
            if (!c) { return; }
            var auto = nav.querySelector('.wppro-hf-drawer-toggle');
            if (auto) {
                auto.setAttribute('hidden', '');
                auto.setAttribute('data-wppro-hf-toggle-bound', '');
            }
            c.addToggle(toggle);
            claimed.push(nav);
        });

        // 2) Every remaining nav's own hamburger (the zero-config case).
        var autos = ctx.querySelectorAll('.wppro-hf-drawer-toggle');
        Array.prototype.forEach.call(autos, function (toggle) {
            var nav = toggle.closest('nav');
            if (!nav || claimed.indexOf(nav) !== -1) { return; }
            var c = controllerFor(nav);
            if (!c) { return; }
            c.addToggle(toggle);
        });

        // ONE stamp, at the end, unconditionally: it means "mobile-drawer.js ran", which
        // is exactly what js-present.js's watchdog asks. Set even when this page has no
        // drawer at all -- the answer to "did the runtime arrive?" is still yes.
        ROOT.setAttribute('data-wppro-hf-drawer-ready', '');
    }

    /**
     * CLOSE WHATEVER DRAWER IS OPEN, from outside this module.
     *
     * It exists so that anything which is about to make the rest of the document inert --
     * a native <dialog> above all -- can put the drawer down first, rather than leaving it
     * visible, focus-trapped and unreachable behind the new layer. It closes through the
     * controller rather than by synthesising a click on a toggle, which would also trip the
     * head script's early-activation capture.
     *
     * HF's own search no longer has a modal mode (owner's rule, 2026-09-10), so nothing in
     * this plugin calls it today; it stays because the drawer is the only thing that knows
     * how to close itself correctly, and a page that opens a dialog of its own still needs
     * a way to say so. Its mirror -- hf-modal.js standing down while a `dialog[open]` is on
     * screen -- is what keeps Escape going to the right layer.
     */
    function closeOpen() {
        var navs = document.querySelectorAll('nav[data-drawer-open]');
        for (var i = 0; i < navs.length; i++) {
            var c = getController(navs[i]);
            if (c && c.close) { c.close(); }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
        init();
    }
    window.initWpproHfDrawer = init;
    window.WpproHfDrawer = { init: init, closeOpen: closeOpen };
}());
;

/* ===== search-runtime.js ===== */
/**
 * wppro-hf — the search element's runtime.
 *
 * The smaller job applies to EVERY search form: an empty submit is stopped and focus
 * returns to the field, because letting it through navigates to `/?s=` -- the home page,
 * which reads as a broken search. The FORM is the feature and it submits correctly
 * without this file.
 *
 * The larger job is the reveal, for the two modes that have one:
 *   collapsible -- a magnifier beside the nav that expands into the field in place;
 *   panel       -- a full-width strip under the chrome (bos's masthead).
 *
 * BOTH ARE IN FLOW. A third mode used to open a native <dialog> modally over the page and
 * it is gone (owner's rule, 2026-09-10): this plugin does not fake the search ACTION. What
 * went with it was the whole modal apparatus below -- showModal(), an explicit body-scroll
 * lock, and a one-modal-at-a-time handshake that had to close the drawer first. None of
 * that is needed by a form that opens where it already is.
 *
 * PROGRESSIVE ENHANCEMENT, the same shape as the drawer and for the same reason. The
 * markup ships with the form IN FLOW and every toggle hidden; channel 1 collapses the
 * panel and reveals the toggle only under `html[data-wppro-hf-js]`. So with JavaScript
 * off -- or blocked, or still loading -- the search is a plain always-open form rather
 * than a magnifier that reveals nothing, and there is never a toggle that does nothing.
 *
 * Keyboard and screen-reader behaviour, which is most of why this is not three lines:
 *   - every toggle carries aria-expanded and aria-controls;
 *   - the toggle comes AFTER the form in the markup (hf_search/view.php), because while the
 *     search is open it is the close: the tab order is field, submit, close, which is
 *     also the order on screen (SC 2.4.3). Nothing here depends on that order;
 *   - the closed collapsible form uses the `hidden` ATTRIBUTE, so its input leaves the
 *     tab order (visibility/opacity would leave a Tab landing in an invisible box);
 *   - opening moves focus INTO the input, because that is what someone who pressed a
 *     search button is asking for;
 *   - Escape closes and returns focus to the toggle, matching the nav's disclosures;
 *   - a click outside closes it, but NOT a click inside -- closing the form while
 *     someone is typing in it is the bug that makes these things unusable.
 */
(function () {
    'use strict';

    var READY = 'data-wppro-hf-search-ready';
    var MODE = 'data-wppro-hf-search';
    var OPEN = 'data-wppro-hf-open';

    function init(wrap) {
        if (wrap.getAttribute(READY) === '1') { return; }

        var form = wrap.querySelector('form[role="search"]');
        var input = form && form.querySelector('input[type="search"]');
        if (!form || !input) { return; }

        // Guarded in EVERY mode. This is why the runtime binds to inline forms at all.
        form.addEventListener('submit', function (e) {
            if (!input.value.trim()) {
                e.preventDefault();
                input.focus();
            }
        });

        var mode = wrap.getAttribute(MODE) || 'inline';
        var toggle = wrap.querySelector('[data-wppro-hf-toggle]');

        wrap.setAttribute(READY, '1');

        if (!toggle || mode === 'inline') {
            return; // inline: the form is the whole feature
        }

        toggle.setAttribute('data-wppro-hf-toggle-bound', '');
        toggle.setAttribute('aria-expanded', 'false');

        function isOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }

        function open() {
            if (mode === 'collapsible') { form.hidden = false; }
            wrap.setAttribute(OPEN, '');
            toggle.setAttribute('aria-expanded', 'true');
            input.focus();
        }

        function close(returnFocus) {
            if (mode === 'collapsible') { form.hidden = true; }
            wrap.removeAttribute(OPEN);
            toggle.setAttribute('aria-expanded', 'false');
            if (returnFocus) { toggle.focus(); }
        }

        if (mode === 'collapsible') {
            form.hidden = true;
        }

        toggle.addEventListener('click', function () {
            if (isOpen()) { close(true); } else { open(); }
        });

        wrap.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen()) {
                e.stopPropagation(); // do not also close an enclosing drawer
                close(true);
            }
        });

        document.addEventListener('click', function (e) {
            if (isOpen() && !wrap.contains(e.target)) { close(false); }
        });
    }

    function boot() {
        var all = document.querySelectorAll('[' + MODE + ']');
        for (var i = 0; i < all.length; i++) { init(all[i]); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}());
;

