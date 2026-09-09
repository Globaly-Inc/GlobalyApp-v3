/**
 * Globaly AI Counsellor — floating launcher.
 *
 * Host pages drop in ONE script tag:
 *   <script src="https://app.globalyhub.com/embed.js" data-key="EMBED_KEY" async></script>
 *
 * It renders the animated orb bottom-right and opens the chat in an iframe on click —
 * the same shape as the in-app Ask Aly launcher, so a university's site gets the
 * assistant without the host having to lay out a 420x640 block in its own markup.
 *
 * Plain ES5-ish DOM, no build step and no framework: this file is served as-is to
 * arbitrary third-party sites, so it must not assume a bundler, a polyfill or a
 * module loader. Everything is inline-styled for the same reason — a host stylesheet
 * must not be able to restyle the launcher, and we must not inject a stylesheet into
 * theirs. All ids are prefixed so a second copy of the tag is a no-op.
 */
(function () {
  var ORB = "https://storage.googleapis.com/globalyapp-public-images/ai/avatar/globaly-orb-rose-crimson-240.gif";
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
  panel.style.cssText =
    "display:none;position:fixed;bottom:88px;" + side + ":20px;width:380px;height:600px;max-width:calc(100vw - 40px);" +
    "max-height:calc(100vh - 120px);border:0;border-radius:16px;background:#fff;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.18)";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Ask our AI counsellor");
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "width:56px;height:56px;padding:0;border:0;border-radius:9999px;background:#fff;cursor:pointer;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;overflow:hidden";

  // The orb is a 240x240 GIF that only fills the middle ~59% of its frame, so it is
  // scaled up and nudged down to sit centred in the button — same correction the
  // in-app AlyOrbIcon applies.
  var orb = document.createElement("img");
  orb.src = ORB;
  orb.alt = "";
  orb.setAttribute("aria-hidden", "true");
  orb.style.cssText = "width:56px;height:56px;transform:translateY(3.3%) scale(1.7)";

  var cross = document.createElement("span");
  cross.textContent = "×";
  cross.setAttribute("aria-hidden", "true");
  cross.style.cssText = "display:none;font:300 30px/1 system-ui,sans-serif;color:#111";

  var open = false;
  button.onclick = function () {
    open = !open;
    if (open && !panel.src) panel.src = origin + "/embed/" + encodeURIComponent(key);
    panel.style.display = open ? "block" : "none";
    orb.style.display = open ? "none" : "block";
    cross.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.setAttribute("aria-label", open ? "Close AI counsellor" : "Ask our AI counsellor");
  };

  button.appendChild(orb);
  button.appendChild(cross);
  root.appendChild(panel);
  root.appendChild(button);

  // The tag is async, so the body may not exist yet on a slow parse.
  if (document.body) document.body.appendChild(root);
  else document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(root); });
})();
