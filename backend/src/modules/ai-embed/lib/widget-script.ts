// The script a third-party page loads. Served as JavaScript by
// GET /api/v3/ai-embed/widget.js — never bundled into the frontend, because the
// pages that load it are not ours.
//
// V1 had no equivalent: its ai-embed-validate function was called by V1's own React
// app, so there was never a loader to embed. This is a V3 addition and every rule
// below is deliberate.
//
// SECRETS. The only credential in the page is the embed key, and it is public by
// construction — the host page author pastes it into their own HTML, exactly like a
// Stripe publishable key. No provider key ever crosses this boundary: generation
// happens server-side in routes/widget.routes.ts, which reads GEMINI_API_KEY from
// the server config the page cannot see. What stops a scraped embed key being used
// elsewhere is the server-side origin allowlist, not secrecy of the key.
//
// NO INSTRUCTIONS FROM THE HOST PAGE. The key is read once, synchronously, from
// this script's own <script> tag via `document.currentScript` — which is null in
// every async callback, so it cannot be re-read later against a swapped tag. The
// widget registers NO `message` listener and exports NO global, so there is no
// channel through which the host page can hand it a different embed key and read
// another tenant's config. (It could of course put another tenant's key in its own
// script tag — and the origin check is what refuses that.)
//
// NO HTML FROM THE SERVER. Model output lands via `textContent`, never innerHTML.
// A widget that renders untrusted text as markup is a stored-XSS hole in every
// customer's site at once.
//
// CLOSED SHADOW ROOT. The UI is mounted in `attachShadow({ mode: "closed" })` so
// the host page's CSS cannot reshape it into something it is not, and host page
// scripts cannot walk into the transcript.

/**
 * @param apiBase Absolute origin of this API, e.g. https://api.globaly.example.
 *                Baked in at serve time so the host page never guesses it.
 */
export function buildWidgetScript(apiBase: string): string {
  return `/* Globaly AI embed widget */
(function () {
  "use strict";

  var API_BASE = ${JSON.stringify(apiBase)};

  // Synchronous, once. See the module comment: this is the whole "no instructions
  // from the host page" guarantee.
  var tag = document.currentScript;
  var EMBED_KEY = tag && tag.getAttribute("data-embed-key");
  if (!EMBED_KEY) {
    console.error("[globaly-ai] missing data-embed-key on the script tag");
    return;
  }

  function post(path, body) {
    return fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // No cookies: the widget is not a session and must not ride one.
      credentials: "omit",
      body: JSON.stringify(body)
    });
  }

  post("/api/v3/ai-embed/validate", { embed_key: EMBED_KEY })
    .then(function (res) {
      if (!res.ok) {
        // 401 wrong/inactive key, 403 origin not allowed, 402 out of credits.
        // Render nothing in every case — a broken widget is better than a
        // misleading one.
        console.warn("[globaly-ai] widget unavailable (" + res.status + ")");
        return null;
      }
      return res.json();
    })
    .then(function (payload) {
      if (payload && payload.config) mount(payload.config);
    })
    .catch(function (err) {
      console.warn("[globaly-ai] widget failed to load", err);
    });

  function mount(cfg) {
    var accent = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cfg.brand_color || "")
      ? cfg.brand_color
      : "#1a73e8";

    var host = document.createElement("div");
    host.setAttribute("data-globaly-ai", "");
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "closed" });

    var style = document.createElement("style");
    style.textContent = [
      ":host{all:initial}",
      ".launcher{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:999px;",
      "padding:14px 20px;font:600 15px/1.2 system-ui,sans-serif;color:#fff;cursor:pointer;background:" + accent + "}",
      ".panel{position:fixed;right:20px;bottom:84px;z-index:2147483000;width:360px;max-width:calc(100vw - 40px);",
      "height:520px;max-height:calc(100vh - 120px);display:none;flex-direction:column;background:#fff;color:#111;",
      "border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.22);overflow:hidden;font:14px/1.5 system-ui,sans-serif}",
      ".panel.open{display:flex}",
      ".head{display:flex;align-items:center;gap:8px;padding:12px 14px;background:" + accent + ";color:#fff;font-weight:600}",
      ".head img{width:22px;height:22px;border-radius:4px;object-fit:cover}",
      ".head button{margin-left:auto;background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1}",
      ".log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}",
      ".msg{padding:8px 11px;border-radius:10px;max-width:85%;white-space:pre-wrap;word-break:break-word}",
      ".msg.user{align-self:flex-end;background:" + accent + ";color:#fff}",
      ".msg.bot{align-self:flex-start;background:#f1f3f4}",
      ".chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}",
      ".chips button{border:1px solid #dadce0;background:#fff;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer}",
      ".form{display:flex;gap:8px;border-top:1px solid #e8eaed;padding:10px}",
      ".form input{flex:1;border:1px solid #dadce0;border-radius:8px;padding:9px 10px;font:inherit}",
      ".form button{border:0;border-radius:8px;padding:0 14px;color:#fff;cursor:pointer;background:" + accent + "}",
      ".form button[disabled]{opacity:.5;cursor:default}"
    ].join("");
    root.appendChild(style);

    var name = cfg.display_name || "Ask AI";

    var launcher = document.createElement("button");
    launcher.className = "launcher";
    launcher.type = "button";
    launcher.textContent = name;
    launcher.setAttribute("aria-expanded", "false");

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", name);

    var head = document.createElement("div");
    head.className = "head";
    if (cfg.logo_url) {
      var logo = document.createElement("img");
      logo.src = cfg.logo_url;
      logo.alt = "";
      head.appendChild(logo);
    }
    var title = document.createElement("span");
    title.textContent = name;
    head.appendChild(title);
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "\\u00d7";
    head.appendChild(close);

    var log = document.createElement("div");
    log.className = "log";
    log.setAttribute("aria-live", "polite");

    var chips = document.createElement("div");
    chips.className = "chips";

    var form = document.createElement("form");
    form.className = "form";
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Ask a question\\u2026";
    input.setAttribute("aria-label", "Your question");
    var send = document.createElement("button");
    send.type = "submit";
    send.textContent = "Send";
    form.appendChild(input);
    form.appendChild(send);

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(chips);
    panel.appendChild(form);
    root.appendChild(launcher);
    root.appendChild(panel);

    function bubble(kind, text) {
      var el = document.createElement("div");
      el.className = "msg " + kind;
      // textContent, never innerHTML — model output is not markup.
      el.textContent = text;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    }

    if (cfg.welcome_message) bubble("bot", cfg.welcome_message);
    (cfg.starter_questions || []).slice(0, 6).forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = q;
      b.addEventListener("click", function () { ask(q); });
      chips.appendChild(b);
    });

    function toggle(open) {
      panel.classList.toggle("open", open);
      launcher.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) input.focus();
    }
    launcher.addEventListener("click", function () { toggle(!panel.classList.contains("open")); });
    close.addEventListener("click", function () { toggle(false); });

    // A stable per-browser marker for the server's anti-abuse gate. Random and
    // stored locally; deliberately not a device fingerprint.
    var FP_KEY = "globaly-ai-embed-fp";
    var fingerprint;
    try {
      fingerprint = localStorage.getItem(FP_KEY);
      if (!fingerprint) {
        fingerprint = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
        localStorage.setItem(FP_KEY, fingerprint);
      }
    } catch (e) {
      fingerprint = String(Date.now()) + Math.random();
    }

    var busy = false;

    function ask(text) {
      if (busy || !text) return;
      busy = true;
      send.disabled = true;
      toggle(true);
      bubble("user", text);
      input.value = "";
      var out = bubble("bot", "\\u2026");
      var first = true;

      post("/api/v3/ai-embed/messages", {
        embed_key: EMBED_KEY,
        content: text,
        fingerprint: fingerprint
      }).then(function (res) {
        if (!res.ok || !res.body) {
          out.textContent = res.status === 402
            ? "This assistant has reached its monthly limit."
            : res.status === 429
              ? "Too many questions right now \\u2014 please wait a moment."
              : "Sorry, the assistant is unavailable right now.";
          return;
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return;
            buffer += decoder.decode(r.value, { stream: true });
            var parts = buffer.split("\\n\\n");
            buffer = parts.pop() || "";
            parts.forEach(function (block) {
              block.split("\\n").forEach(function (line) {
                if (line.indexOf("data: ") !== 0) return;
                var raw = line.slice(6);
                if (raw === "[DONE]") return;
                try {
                  var json = JSON.parse(raw);
                  var delta = json.choices && json.choices[0] && json.choices[0].delta;
                  if (delta && delta.content) {
                    if (first) { out.textContent = ""; first = false; }
                    out.textContent += delta.content;
                    log.scrollTop = log.scrollHeight;
                  }
                } catch (e) { /* a non-delta event (sources, usage) — ignored */ }
              });
            });
            return pump();
          });
        }
        return pump();
      }).catch(function () {
        if (first) out.textContent = "Sorry, the assistant is unavailable right now.";
      }).then(function () {
        busy = false;
        send.disabled = false;
      });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      ask(input.value.trim());
    });
  }
})();
`;
}
