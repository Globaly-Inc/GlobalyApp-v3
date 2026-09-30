/**
 * Globaly AI Counsellor — floating launcher.
 *
 * Host pages drop in ONE script tag:
 *   <script src="https://app.globalyhub.com/embed.js" data-key="EMBED_KEY" async></script>
 *   Optional: data-position="left"
 *
 * It renders the orb bottom-right and opens the chat in an iframe on click — the same
 * shape as the in-app Ask Aly launcher, so a university's site gets the assistant without
 * the host having to lay out a 420x640 block in its own markup.
 *
 * Plain ES5-ish DOM, no build step and no framework: this file is served as-is to
 * arbitrary third-party sites, so it must not assume a bundler, a polyfill or a module
 * loader. Everything is inline-styled and animated through the Web Animations API for the
 * same reason — a host stylesheet must not be able to restyle the launcher, and we must
 * not inject a stylesheet into theirs. All ids are prefixed so a second copy of the tag is
 * a no-op.
 *
 * Branding: the widget's public config (brand colour, name) is fetched from our origin
 * (/api/embed/KEY) so the orb's glow carries the brand before the panel ever loads. If that
 * fetch fails the launcher still renders in its default look.
 */
(function () {
  var ID = "globaly-ai-launcher";
  if (document.getElementById(ID)) return; // tag pasted twice

  var script = document.currentScript;
  if (!script) {
    var all = document.getElementsByTagName("script");
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && all[i].src.indexOf("/embed.js") !== -1) { script = all[i]; break; }
    }
  }
  var key = script && script.getAttribute("data-key");
  if (!key) return; // nothing to open without a key — fail silent, never break the host page

  // The panel must reach our origin, not the host's, so derive it from this script's own src.
  var origin = new URL(script.src, location.href).origin;
  var side = script.getAttribute("data-position") === "left" ? "left" : "right";
  var reduceMotion = false;
  try { reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch {}

  // Brand colour → the orb's own fill, not just a glow under it. Default is the app's indigo.
  var brand = [79, 70, 229];
  function parseHex(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }

  /** WCAG relative luminance. */
  function luminance(c) {
    var lin = [];
    for (var j = 0; j < 3; j++) {
      var s = c[j] / 255;
      lin.push(s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
    }
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  var INK = "#0B1220";
  // Derived, never typed in: a literal here drifts from the panel's and moves the crossover.
  var INK_L = luminance([0x0b, 0x12, 0x20]);

  /**
   * Readable foreground for the brand fill, measured rather than assumed — a tenant can save any
   * hex, and a white mark on a bright yellow orb is invisible. Mirrors widgetTheme's `onAccent`
   * in the panel (src/app/embed/[key]/utils), so the orb and the panel header never disagree.
   */
  function onBrand(c) {
    var L = luminance(c);
    return (L + 0.05) / (INK_L + 0.05) > 1.05 / (L + 0.05) ? INK : "#FFFFFF";
  }

  function glow(strong) {
    return "0 " + (strong ? 12 : 8) + "px " + (strong ? 32 : 24) + "px " + rgba(brand, strong ? 0.45 : 0.3) +
      ",0 0 0 1px " + rgba(brand, 0.1);
  }

  var root = document.createElement("div");
  root.id = ID;
  // A high z-index but not 2147483647: a host's own cookie banner or modal should still
  // be able to sit above the launcher.
  root.style.cssText = "position:fixed;bottom:20px;" + side + ":20px;z-index:2147480000";

  var panel = document.createElement("iframe");
  // Mirrors DEFAULT_WIDGET_NAME in src/app/embed/[key]/const — a static file served to
  // third-party sites cannot import it, so the two are kept in step by hand.
  panel.title = "Aly";
  panel.setAttribute("allow", "clipboard-write");
  // Created hidden and with no src: the chat page (and its credit-consuming session)
  // must not load until someone actually opens the widget.
  var PANEL_DESKTOP =
    "display:none;position:fixed;bottom:88px;" + side + ":20px;width:400px;height:min(704px,calc(100vh - 108px));" +
    "max-width:calc(100vw - 40px);border:0;border-radius:24px;background:#fff;color-scheme:normal;" +
    "box-shadow:0 12px 48px rgba(0,0,0,.25)";
  // Under 480px the panel IS the screen; the orb stays on top of it as the way back.
  var PANEL_MOBILE = "display:none;position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff;color-scheme:normal";
  var isMobile = function () { return window.innerWidth < 480; };
  panel.style.cssText = PANEL_DESKTOP;

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Ask Aly");
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "position:relative;width:56px;height:56px;padding:0;border:0;border-radius:9999px;background:" + rgb(brand) + ";cursor:pointer;" +
    "display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:" + glow(false) +
    ";transition:transform .18s ease-out,box-shadow .18s ease-out;-webkit-appearance:none;appearance:none";
  button.onmouseenter = function () { if (!open) { button.style.transform = "scale(1.06)"; button.style.boxShadow = glow(true); } };
  button.onmouseleave = function () { button.style.transform = ""; button.style.boxShadow = glow(false); };
  // Keyboard users get the same ring the panel uses; the host's :focus styles can't reach here.
  button.onfocus = function () { button.style.boxShadow = glow(true) + ",0 0 0 3px " + rgba(brand, 0.35); };
  button.onblur = function () { button.style.boxShadow = glow(false); };

  // A neutral speech mark in the measured foreground, not the azure Globaly orb: on a customer's
  // own website the launcher should read as THEIR assistant. Inline SVG rather than an <img>, so
  // it recolours with the brand and costs no second request.
  var orb = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  orb.setAttribute("viewBox", "0 0 24 24");
  orb.setAttribute("width", "26");
  orb.setAttribute("height", "26");
  orb.setAttribute("aria-hidden", "true");
  var bubble = document.createElementNS("http://www.w3.org/2000/svg", "path");
  bubble.setAttribute("d", "M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 0 1 12.5 3a8.38 8.38 0 0 1 8.5 8.5z");
  bubble.setAttribute("fill", "none");
  bubble.setAttribute("stroke-width", "2");
  bubble.setAttribute("stroke-linecap", "round");
  bubble.setAttribute("stroke-linejoin", "round");
  orb.appendChild(bubble);

  // Open state: a chevron in the brand colour, not an "×" — the same target closes it again.
  var chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("width", "24");
  chevron.setAttribute("height", "24");
  chevron.setAttribute("aria-hidden", "true");
  chevron.style.display = "none";
  var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M6 9l6 6 6-6");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  chevron.appendChild(path);

  /**
   * A one-time nudge beside the orb. A bare circle gives a visitor no reason to click it; this
   * says what the thing is for. Shown once per browser — a teaser that returns on every page view
   * is an ad, not an offer — and dismissed by opening the widget, by its own close control, or by
   * a timeout. Storage is the HOST's origin and some sites block it, so every access is guarded
   * and a failure just means the teaser shows again rather than breaking the launcher.
   */
  var TEASER_KEY = "globaly_teaser_seen";
  function teaserSeen() {
    try { return localStorage.getItem(TEASER_KEY) === "1"; } catch { return false; }
  }
  function markTeaserSeen() {
    try { localStorage.setItem(TEASER_KEY, "1"); } catch {}
  }

  var teaser = document.createElement("div");
  teaser.style.cssText =
    "display:none;position:absolute;bottom:4px;" + (side === "right" ? "right:70px" : "left:70px") +
    ";max-width:240px;padding:10px 12px;border-radius:14px;border:1px solid " + rgba(brand, 0.25) +
    ";background:#fff;color:#0B1220;font:500 13px/18px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
    "box-shadow:0 8px 28px rgba(0,0,0,.16);text-align:left;white-space:normal";

  var teaserText = document.createElement("span");
  teaserText.textContent = "Ask me about fees, intakes or entry requirements.";
  teaser.appendChild(teaserText);

  var teaserClose = document.createElement("button");
  teaserClose.type = "button";
  teaserClose.setAttribute("aria-label", "Dismiss");
  teaserClose.textContent = "×";
  teaserClose.style.cssText =
    "position:absolute;top:-8px;" + (side === "right" ? "left:-8px" : "right:-8px") +
    ";width:22px;height:22px;padding:0;border:1px solid rgba(0,0,0,.08);border-radius:9999px;background:#fff;" +
    "color:#64748B;font-size:14px;line-height:20px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12)";

  function hideTeaser() {
    teaser.style.display = "none";
    markTeaserSeen();
  }
  teaserClose.onclick = function (e) { e.stopPropagation(); hideTeaser(); };
  teaser.appendChild(teaserClose);

  function paint() {
    var fg = onBrand(brand);
    button.style.background = rgb(brand);
    button.style.boxShadow = glow(false);
    bubble.setAttribute("stroke", fg);
    path.setAttribute("stroke", fg);
    teaser.style.borderColor = rgba(brand, 0.25);
  }
  paint();

  // After the page has settled, so it reads as an offer rather than an interruption on load.
  if (!teaserSeen()) {
    setTimeout(function () {
      if (open || teaserSeen()) return;
      teaser.style.display = "block";
      if (!reduceMotion && teaser.animate) {
        teaser.animate(
          [{ opacity: 0, transform: "translateY(6px) scale(.96)" }, { opacity: 1, transform: "none" }],
          { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      }
      // Unclaimed after a while is a no — stop occupying the corner of someone's website.
      setTimeout(function () { if (teaser.style.display === "block") hideTeaser(); }, 12000);
    }, 2500);
  }

  // Breathing while idle. Web Animations, not a keyframes rule, so nothing is injected into
  // the host's stylesheets; honours reduced motion by never starting.
  var breathe = null;
  if (!reduceMotion && button.animate) {
    breathe = button.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }],
      { duration: 4000, iterations: Infinity, easing: "ease-in-out" }
    );
  }

  var open = false;
  button.onclick = function () {
    open = !open;
    if (open) hideTeaser();
    if (open && !panel.src) panel.src = origin + "/embed/" + encodeURIComponent(key);
    panel.style.cssText = isMobile() ? PANEL_MOBILE : PANEL_DESKTOP;
    panel.style.display = open ? "block" : "none";
    orb.style.display = open ? "none" : "block";
    chevron.style.display = open ? "block" : "none";

    // Grows out of the orb instead of appearing: the corner it expands from is the control that
    // opened it, which is what makes the panel feel attached to the button rather than dropped on
    // top of the host's page. Desktop only — on mobile the panel IS the screen, so there is no
    // corner to grow from. Web Animations, never a keyframes rule: nothing may enter the host's
    // stylesheets.
    if (open && !reduceMotion && panel.animate && !isMobile()) {
      panel.animate(
        [
          { opacity: 0, transform: "translateY(12px) scale(.94)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
      panel.style.transformOrigin = side === "right" ? "bottom right" : "bottom left";
    }

    if (breathe) { if (open) breathe.pause(); else breathe.play(); }
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.setAttribute("aria-label", open ? "Close Aly" : "Ask Aly");
  };
  window.addEventListener("resize", function () {
    if (open) { panel.style.cssText = isMobile() ? PANEL_MOBILE : PANEL_DESKTOP; panel.style.display = "block"; }
  });

  button.appendChild(orb);
  button.appendChild(chevron);
  root.appendChild(panel);
  root.appendChild(teaser);
  root.appendChild(button);

  // The tag is async, so the body may not exist yet on a slow parse.
  if (document.body) document.body.appendChild(root);
  else document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(root); });

  // Branding, best-effort: a slow or failed fetch leaves the default look in place.
  if (window.fetch) {
    fetch(origin + "/api/embed/" + encodeURIComponent(key))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg) return;
        var c = parseHex(cfg.brand_color);
        if (c) { brand = c; paint(); }
        if (cfg.display_name) {
          panel.title = cfg.display_name;
          button.setAttribute("aria-label", open ? "Close " + cfg.display_name : "Ask " + cfg.display_name);
        }
        // The tenant's own opening line, so the nudge speaks in their voice rather than ours.
        // Capped because this is a 240px bubble on someone else's page, not a paragraph.
        if (cfg.greeting && String(cfg.greeting).trim().length <= 90) {
          teaserText.textContent = String(cfg.greeting).trim();
        }
      })
      .catch(function () {});
  }
})();
