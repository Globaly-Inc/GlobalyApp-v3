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
  try { reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}

  // Brand colour → the glow under the orb. Default is the app's indigo.
  var brand = [79, 70, 229];
  function parseHex(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function glow(strong) {
    return "0 " + (strong ? 12 : 8) + "px " + (strong ? 32 : 24) + "px " + rgba(brand, strong ? 0.45 : 0.35) +
      ",0 0 0 " + (strong ? 4 : 3) + "px " + rgba(brand, 0.18);
  }

  var root = document.createElement("div");
  root.id = ID;
  // A high z-index but not 2147483647: a host's own cookie banner or modal should still
  // be able to sit above the launcher.
  root.style.cssText = "position:fixed;bottom:20px;" + side + ":20px;z-index:2147480000";

  var panel = document.createElement("iframe");
  panel.title = "AI Counsellor";
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
  button.setAttribute("aria-label", "Ask our AI counsellor");
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "position:relative;width:56px;height:56px;padding:0;border:0;border-radius:9999px;background:#fff;cursor:pointer;" +
    "display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:" + glow(false) +
    ";transition:transform .18s ease-out,box-shadow .18s ease-out;-webkit-appearance:none;appearance:none";
  button.onmouseenter = function () { if (!open) { button.style.transform = "scale(1.06)"; button.style.boxShadow = glow(true); } };
  button.onmouseleave = function () { button.style.transform = ""; button.style.boxShadow = glow(false); };

  // The azure orb only fills the middle of its frame, so it is scaled up and nudged
  // down to sit centred in the button — same correction the in-app AlyOrbIcon applies.
  // The orb only fills the middle ~59% of its frame, so it is scaled up and nudged down to
  // sit centred in the button — same correction the in-app AlyOrbIcon applies.
  var orb = document.createElement("img");
  orb.src = origin + "/globaly-orb-azure.svg";
  orb.alt = "";
  orb.setAttribute("aria-hidden", "true");
  orb.style.cssText = "width:56px;height:56px;transform:translateY(3.1%) scale(1.75)";

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

  function paint() {
    button.style.boxShadow = glow(false);
    path.setAttribute("stroke", "rgb(" + brand.join(",") + ")");
  }
  paint();

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
    if (open && !panel.src) panel.src = origin + "/embed/" + encodeURIComponent(key);
    panel.style.cssText = isMobile() ? PANEL_MOBILE : PANEL_DESKTOP;
    panel.style.display = open ? "block" : "none";
    orb.style.display = open ? "none" : "block";
    chevron.style.display = open ? "block" : "none";
    if (breathe) { if (open) breathe.pause(); else breathe.play(); }
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.setAttribute("aria-label", open ? "Close AI counsellor" : "Ask our AI counsellor");
  };
  window.addEventListener("resize", function () {
    if (open) { panel.style.cssText = isMobile() ? PANEL_MOBILE : PANEL_DESKTOP; panel.style.display = "block"; }
  });

  button.appendChild(orb);
  button.appendChild(chevron);
  root.appendChild(panel);
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
      })
      .catch(function () {});
  }
})();
