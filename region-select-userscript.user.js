// ==UserScript==
// @name         Region & Geo Unlock
// @namespace    https://github.com/chirag127
// @version      1.0.0
// @description  Override the region a site reads from its own cookie on any host that trusts a client-side signal, with a per-site cookie table, an IP-locked "you need a proxy" notice, and dry-run → apply → reset. No proxy, no tunnel.
// @author       chirag127
// @license      MIT
// @match        *://*/*
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ctext y='20' font-size='20'%3E%F0%9F%8C%8D%3C/text%3E%3C/svg%3E
// @homepageURL  https://github.com/chirag127/region-select-userscript
// @supportURL   https://github.com/chirag127/region-select-userscript/issues
// @downloadURL  https://github.com/chirag127/region-select-userscript/raw/main/region-select-userscript.user.js
// @updateURL    https://github.com/chirag127/region-select-userscript/raw/main/region-select-userscript.user.js
// @grant        none
// @noframes
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * A region gate is usually one of two things:
   *   1) client-trust - the service reads a cookie/header on every request
   *      and picks the catalog based on that. A userscript can set that cookie.
   *   2) IP-lock      - the service refuses outright for the source IP. No
   *      cookie helps; a proxy or relay is the only honest fix.
   *
   * This tool covers (1). For (2) it tells you so and does not pretend.
   * TikTok India is the proven (1) case where the mirror handoff in
   * tiktok-india-unlock-userscript is a better fix; this tool is the general
   * cookie-override path for everything else.
   *
   * Gray: licensing deals, not consumer rights. Respect the target service's
   * terms; the tool only changes a cookie the page already reads.
   * ------------------------------------------------------------------ */

  /* Preset regions - add your own ISO codes in the panel without editing. */
  const REGIONS = [
    { iso: "US", label: "United States" },
    { iso: "GB", label: "United Kingdom" },
    { iso: "DE", label: "Germany" },
    { iso: "FR", label: "France" },
    { iso: "CA", label: "Canada" },
    { iso: "IN", label: "India" },
    { iso: "JP", label: "Japan" },
    { iso: "AU", label: "Australia" },
    { iso: "SG", label: "Singapore" },
    { iso: "AE", label: "UAE" },
    { iso: "BR", label: "Brazil" },
    { iso: "MX", label: "Mexico" },
    { iso: "CUSTOM", label: "Custom ISO…" },
  ];

  /* Per-host overrides. Values are best-effort, community-reported, and
   * expire when the service changes its cookie names - the "verify" note on
   * an entry means the exact cookie was not re-confirmed at build time.
   * Cookie value builders receive the selected ISO code. */
  const KNOWN = {
    "netflix.com": {
      cookies: [{ name: "nv_geo", value: (iso) => iso, reloadAfter: true, verify: true }],
      note: "nv_geo picks the catalog only if the source IP already allows it; most Netflix regions are IP-locked, so a proxy is usually the real fix.",
      proxyHint: "Netflix is IP-locked for most territories. Set up a proxy/relay for the target country; nv_geo alone will not unlock.",
    },
    "spotify.com": {
      cookies: [{ name: "country", value: (iso) => iso, reloadAfter: true, verify: true }],
      note: "Spotify reads the country cookie on load; the catalog follows.",
    },
    "amazon.com": {
      cookies: [
        { name: "i18n-prefs", value: () => "en_US", reloadAfter: true, verify: true },
        { name: "glow-locale", value: () => "en_US", reloadAfter: true, verify: true },
      ],
      note: "Amazon's storefront cookies are region-coded (en_US / en_GB / de_DE …). i18n-prefs is the storefront hint, glow-locale is the display locale.",
    },
    "bbc.co.uk": {
      cookies: [{ name: "editionid", value: () => "uk", reloadAfter: false, verify: true }],
      note: "BBC News region cookie; the page still loads in your own region.",
    },
    "disneyplus.com": {
      cookies: [{ name: "regionalPreference", value: (iso) => iso, reloadAfter: true, verify: true }],
      note: "Disney+'s region preference; IP-based catalog check may still apply.",
    },
    "vimeo.com": {
      cookies: [{ name: "region", value: (iso) => iso, reloadAfter: true, verify: true }],
      note: "Vimeo's region cookie for player localization.",
    },
  };

  /* Hosts that are IP-locked in almost every region, so the tool can say
   * "you need a proxy" up front instead of burning the user's time. */
  const IPLOCK = {
    "netflix.com": "Netflix gates most catalogs on source IP; a proxy/relay to the target country is the honest fix. nv_geo is a catalog hint, not an unlock.",
    "disneyplus.com": "Disney+ is IP-locked; set up a proxy for the target territory.",
    "vimeo.com": "Vimeo enforces availability by IP; a proxy is the reliable unlock.",
  };

  const GATE_SIGNALS = /not available (in your|in the|at) (region|country|area)|unavailable in your|unavailable in this|restricted in your|restricted in the|isn'?t available (in|at)|is not available (in|at)|geo.restricted|region.?(locked|limited)|regional restriction/i;

  const STALE_STORAGE_RE = /(regi|country|locale|territory|nation|geo.?region)/i;

  const state = {
    host: location.host.replace(/^www\./, ""),
    snapshot: null,             // { cookieName -> previous value }, for reset
    region: null,               // { iso, label }
    busy: false,
    route: "",
    applied: false,
  };

  /* ----------------------------- utils ----------------------------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "style") Object.assign(n.style, v);
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }

  const isTyping = () => {
    const a = document.activeElement;
    if (!a) return false;
    const t = (a.tagName || "").toUpperCase();
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || a.isContentEditable;
  };

  function setCookie(name, value, host, path) {
    const base = host.replace(/^www\./, "");
    const domains = [location.hostname];
    const parts = base.split(".");
    if (parts.length >= 2) domains.push(parts.slice(-2).join("."));
    const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    for (const d of new Set(domains)) {
      document.cookie = name + "=" + value + "; path=" + (path || "/") + "; domain=" + d + "; expires=" + far;
    }
  }

  function delCookie(name) {
    const past = "Thu, 01 Jan 1970 00:00:00 GMT";
    const domains = [location.hostname, "." + location.hostname];
    for (const d of new Set(domains)) document.cookie = name + "=; path=/; domain=" + d + "; expires=" + past;
  }
  function readCookie(name) {
    return (document.cookie.match(new RegExp("(^|; )(" + name + ")=([^;]*)")) || [])[3] || "";
  }
  function hostConf() {
    const conf = KNOWN[state.host];
    if (conf) return conf;
    const parent = Object.keys(KNOWN).find((h) => state.host !== h && state.host.endsWith("." + h));
    return parent ? KNOWN[parent] : null;
  }

  function detectGate() {
    const text = (document.body && document.body.innerText || "").slice(0, 6000);
    return GATE_SIGNALS.test(text);
  }

  function ipLocked() {
    const hint = IPLOCK[state.host] || hostConf()?.proxyHint;
    const gate = detectGate();
    return { hint: hint || "", gate: gate };
  }

  /* ----------------------------- panel ---------------------------- */
  let ui = null;
  const log = [];
  function say(m, kind) {
    log.unshift({ t: new Date().toLocaleTimeString() + "  " + m, k: kind || "" });
    log.length = Math.min(log.length, 40);
    if (ui) renderList();
  }

  function currentPlan() {
    const conf = hostConf();
    if (!conf || !state.region) return { conf: conf, rows: [] };
    const rows = conf.cookies.map((c) => {
      const val = c.value(state.region.iso);
      const before = document.cookie.match(new RegExp("(^|; )(" + c.name + ")=([^;]*)"))?.[3] || "";
      return { name: c.name, planned: val, before: before, reloadAfter: !!c.reloadAfter, verify: !!c.verify };
    });
    return { conf: conf, rows: rows };
  }

  function apply() {
    if (state.busy) return;
    const { conf, rows } = currentPlan();
    if (!state.region) { say("Pick a region first.", "warn"); return; }
    if (!rows.length) {
      say("No cookie override known for " + state.host + " - edit the KNOWN table or use a per-site override.", "warn");
      return;
    }
    state.busy = true;
    ui && ui.busy(true);
    state.snapshot = {};
    for (const r of rows) {
      state.snapshot[r.name] = document.cookie.match(new RegExp("(^|; )" + r.name + "=([^;]*)"))?.[2] || "";
      try { setCookie(r.name, r.planned, state.host); }
      catch (e) { say("set " + r.name + " failed: " + e.message, "bad"); }
    }
    // clear stale region storage that would out-weigh the fresh cookie
    let cleared = 0;
    for (const store of [localStorage, sessionStorage]) {
      try {
        for (const k of Object.keys(store)) {
          if (STALE_STORAGE_RE.test(k)) { store.removeItem(k); cleared++; }
        }
      } catch (_) { /* blocked */ }
    }
    if (cleared) say("Cleared " + cleared + " stale region key(s) from site storage.", "info");
    state.busy = false;
    ui && ui.busy(false);
    state.applied = true;
    const willReload = rows.some((r) => r.reloadAfter);
    say("Set " + rows.length + " cookie(s) for " + state.region.iso + "." + (willReload ? " Reloading…" : " Reload to apply."), "good");
    ui && ui.setNote("Applied " + state.region.iso);
    if (willReload) setTimeout(() => location.reload(), 1000);
  }

  function reset() {
    if (!state.applied || !state.snapshot) { say("Nothing to reset yet.", "warn"); return; }
    for (const name of Object.keys(state.snapshot)) {
      const old = state.snapshot[name];
      if (old === "") delCookie(name);     // did not exist before - just drop it
      else setCookie(name, old, state.host); // restore the original value
    }
    state.snapshot = null;
    state.applied = false;
    say("Restored original cookie value(s). Reloading…", "info");
    setTimeout(() => location.reload(), 400);
  }

  function renderList() {
    if (!ui) return;
    const box = ui.listbox;
    if (!box) return;
    box.textContent = "";
    for (const m of log) box.appendChild(el("div", { class: "rgs-log-line" + (m.k ? " rgs-" + m.k : "") }, m.t));
  }

  function closePanel() {
    if (!ui) return;
    ui.root.remove();
    ui = null;
    document.removeEventListener("keydown", keys, true);
  }

  function panel() {
    if (ui) { closePanel(); return; }
    const root = el("div", { id: "rgs-root", class: "rgs-root" });
    root.append(
      el("div", { class: "rgs-hdr" },
        el("span", { class: "rgs-dot" }),
        el("strong", null, "Region & geo · " + state.host),
        el("span", { class: "rgs-spacer" }),
        el("button", { class: "rgs-x", title: "Close", onclick: closePanel }, "×")
      ),
      el("div", { class: "rgs-body" },
        el("div", { class: "rgs-row" },
          el("label", { class: "rgs-lbl" }, "Region", el("select", { id: "rgs-region", onchange: onRegionChange },
            REGIONS.map((r) => el("option", { value: r.iso }, r.label))))
          ,
          el("input", { id: "rgs-custom", class: "rgs-custom", placeholder: "ISO", style: { display: "none" }, oninput: onCustomChange })
        ),
        el("div", { class: "rgs-status", id: "rgs-status" }, "—"),
        el("div", { class: "rgs-plan", id: "rgs-plan" }),
        el("div", { class: "rgs-row" },
          el("button", { class: "rgs-btn rgs-ghost", id: "rgs-dry", onclick: onDry }, "Dry run"),
          el("button", { class: "rgs-btn rgs-primary", id: "rgs-apply", onclick: apply }, "Apply"),
          el("button", { class: "rgs-btn rgs-ghost", id: "rgs-reset", onclick: reset }, "Reset")
        ),
        el("div", { class: "rgs-note", id: "rgs-note" }),
        el("div", { class: "rgs-log", id: "rgs-log" })
      )
    );
    document.body.appendChild(root);
    ui = {
      root: root,
      logbox: root.querySelector("#rgs-log"),
      listbox: root.querySelector("#rgs-log"),
      say: say,
      busy: (b) => {
        const btn = root.querySelector("#rgs-apply");
        btn.disabled = b;
        root.querySelectorAll("#rgs-dry,#rgs-reset").forEach((x) => (x.disabled = b));
      },
      setNote: (t) => { const n = root.querySelector("#rgs-note"); if (n) n.textContent = t; },
      remove: () => root.remove(),
    };
    refresh();
    document.addEventListener("keydown", keys, true);
  }

  function onRegionChange() {
    const sel = document.getElementById("rgs-region");
    const custom = document.getElementById("rgs-custom");
    if (sel.value === "CUSTOM") {
      custom.style.display = "";
      custom.value = "";
      state.region = null; // don't let the literal "CUSTOM" become a cookie value
      custom.focus();
    } else {
      custom.style.display = "none";
      state.region = { iso: sel.value, label: (REGIONS.find((r) => r.iso === sel.value) || {}).label };
    }
    refresh();
  }
  function onCustomChange() {
    const v = document.getElementById("rgs-custom").value.trim().toUpperCase();
    state.region = /^[A-Z]{2}$/.test(v) ? { iso: v, label: "custom " + v } : null;
    refresh();
  }

  function onDry() {
    const { rows, conf } = currentPlan();
    if (!state.region) { say("Pick a region first.", "warn"); return; }
    say("Dry run · " + rows.length + " cookie(s) planned on " + state.host + " for " + state.region.iso + ".", "info");
    renderPlan(rows, conf);
  }

  function renderPlan(rows, conf) {
    const box = document.getElementById("rgs-plan");
    if (!box) return;
    box.textContent = "";
    if (!rows.length) {
      box.appendChild(el("div", { class: "rgs-plan-empty" },
        "No cookie override known for " + state.host + ". Add it to KNOWN in the script and bump @version."));
      return;
    }
    for (const r of rows) {
      box.appendChild(el("div", { class: "rgs-plan-row" },
        el("code", { class: "rgs-code" }, r.name + "=" + r.planned + " (was: " + (r.before || "—") + ")"),
        r.verify ? el("span", { class: "rgs-warn" }, "verify") : null,
        r.reloadAfter ? el("span", { class: "rgs-tag" }, "reload") : null,
      ));
    }
    if (conf && conf.note) box.appendChild(el("div", { class: "rgs-plan-note" }, conf.note));
    const ip = ipLocked();
    if (ip.hint) box.appendChild(el("div", { class: "rgs-plan-note rgs-lock" }, "⚠ " + ip.hint));
  }

  function refresh() {
    if (!ui) return;
    const status = document.getElementById("rgs-status");
    const note = document.getElementById("rgs-note");
    const plan = document.getElementById("rgs-plan");
    const { conf, rows } = currentPlan();
    const ip = ipLocked();
    if (status) {
      const bits = [];
      if (conf) bits.push("site: " + (conf.cookies ? conf.cookies.length + " cookie(s)" : ""));
      else bits.push("no KNOWN entry for this host");
      if (ip.gate) bits.push("gate signal detected");
      status.textContent = bits.join(" · ");
    }
    if (note) note.textContent = state.applied
      ? "Applied " + state.region.iso + " · reload to take effect"
      : (ip.gate ? "Gate signal on this page" : "Idle");
    if (plan && !state.applied && conf && rows.length) renderPlan(rows, conf);
    else if (plan && !state.applied && conf && !rows.length) renderPlan([], conf);
  }

  function keys(e) {
    if (e.key === "Escape") { e.preventDefault(); panel(); }
  }

  /* ----------------------------- boot ----------------------------- */
  function styleSheet() {
    return `
      #rgs-root{position:fixed;right:18px;bottom:18px;width:420px;max-height:80vh;background:#181818;color:#e8e8e8;border:1px solid #2c2c2c;border-radius:10px;box-shadow:0 12px 40px #000a;z-index:2147483000;font:12px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;display:flex;flex-direction:column;overflow:hidden}
      .rgs-hdr{display:flex;align-items:center;gap:8px;padding:9px 10px;background:#111;border-bottom:1px solid #2c2c2c;cursor:grab;user-select:none}
      .rgs-dot{width:8px;height:8px;border-radius:50%;background:#f0b429;box-shadow:0 0 0 3px #f0b42933}
      .rgs-spacer{flex:1}
      .rgs-x{background:none;border:0;color:#aaa;font-size:15px;cursor:pointer}
      .rgs-body{display:flex;flex-direction:column;gap:8px;padding:10px}
      .rgs-row{display:flex;gap:8px;align-items:center}
      .rgs-lbl{display:flex;gap:6px;align-items:center;color:#9aa}
      .rgs-lbl select{background:#0d0d0d;border:1px solid #333;color:#e8e8e8;border-radius:6px;padding:5px 8px;font-size:11px;flex:1}
      .rgs-custom{width:64px;background:#0d0d0d;border:1px solid #333;color:#e8e8e8;border-radius:6px;padding:5px;font-size:11px;text-align:center}
      .rgs-status{color:#9aa;font-size:11px;min-height:16px}
      .rgs-plan{max-height:160px;overflow:auto;background:#101010;border:1px solid #262626;border-radius:6px;padding:6px;font:11px/1.5 ui-monospace,Consolas,monospace}
      .rgs-plan-row{display:flex;gap:8px;align-items:center;padding:3px 4px;border-bottom:1px solid #1f1f1f}
      .rgs-code{flex:1;color:#5fd68a}
      .rgs-warn{color:#f0b429;font-size:10px}
      .rgs-tag{color:#58a6ff;font-size:10px}
      .rgs-plan-empty{color:#8a8a8a;padding:4px}
      .rgs-plan-note{color:#8a8a8a;padding:4px 6px;font:11px/1.5 -apple-system,Segoe UI,sans-serif}
      .rgs-plan-note.rgs-lock{color:#f0b429}
      .rgs-btn{flex:1;background:#222;border:1px solid #333;color:#ddd;border-radius:6px;padding:6px 8px;font-size:11px;cursor:pointer}
      .rgs-primary{background:#065fd4;border-color:#065fd4;color:#fff}
      .rgs-ghost{flex:0 0 auto}
      .rgs-btn:hover:not(:disabled){filter:brightness(1.14)}
      .rgs-btn:disabled{opacity:.5;cursor:not-allowed}
      .rgs-note{color:#9aa;font-size:11px;min-height:16px}
      .rgs-log{height:80px;overflow:auto;background:#101010;border:1px solid #262626;border-radius:6px;padding:5px;font:10px/1.5 ui-monospace,Consolas,monospace}
      .rgs-log-line{white-space:pre-wrap}
      .rgs-good{color:#5fd68a}.rgs-bad{color:#ff7b72}.rgs-warn{color:#f0b429}.rgs-info{color:#58a6ff}
      #rgs-chip{position:fixed;right:18px;bottom:18px;width:42px;height:42px;border-radius:999px;background:#181818;border:1px solid #f0b429;color:#fff;font-size:18px;cursor:pointer;z-index:2147482999;display:none}
    `;
  }

  function shouldShowChip() {
    if (!state.host) return false;
    const known = KNOWN[state.host] || Object.keys(KNOWN).some((h) => state.host.endsWith("." + h));
    return !!known;
  }

  function boot() {
    if (document.documentElement.dataset.rgsBooted) return;
    document.documentElement.dataset.rgsBooted = "1";
    document.head.append(el("style", null, styleSheet()));

    const chip = el("button", { id: "rgs-chip", class: "rgs-chip", title: "Region & geo (Alt+G)" }, "🌍");
    document.body.appendChild(chip);
    chip.onclick = panel;
    chip.style.display = shouldShowChip() ? "" : "none";

    new MutationObserver(() => {
      if (document.body && !document.body.contains(chip)) document.body.appendChild(chip);
    }).observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener("keydown", (e) => {
      if (isTyping()) return;
      if (e.altKey && (e.key === "g" || e.key === "G")) { e.preventDefault(); panel(); }
    }, true);
  }

  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
