# 🌍 Region & Geo Unlock

Override the **region** a site reads from its **own cookie** on any host that trusts a
client-side signal — with a per-site cookie table, a "you need a proxy" notice for
IP-locked services, and **dry-run → apply → reset**. No proxy, no tunnel, no build.

> A region gate is one of two things. **(1) Client-trust** — the service picks its catalog
> from a cookie/header on every request; a userscript can write that cookie. **(2) IP-lock** —
> the service refuses outright for the source IP; no cookie helps, only a proxy or relay.
> This tool does **(1)** and is honest about **(2)**. TikTok India is the proven case, but it's
> better served by the [TikTok mirror handoff](https://github.com/chirag127/tiktok-india-unlock-userscript) —
> this is the general cookie-override path for everything else.

## Install

First read the shared **[userscript install guide](https://github.com/chirag127/userscript-install-guide)**
(how to set up ScriptCat / Tampermonkey). Then click:

**[Install region-select-userscript.user.js](https://github.com/chirag127/region-select-userscript/raw/main/region-select-userscript.user.js)**

## Use

Open a site that has a region cookie. A 🌍 chip appears on hosts with a known override
(press **Alt+G** anywhere to open the panel and dry-run / add a per-site entry).

| Button | What it does |
|--------|--------------|
| **Dry run** | Shows the exact cookies that would be set (`name=value`, the previous value, and `verify`/`reload` tags) and any "you need a proxy" note. **No page change.** |
| **Apply** | Writes the chosen region into each cookie (across host + `.host`), clears stale region keys in site storage, snapshots the old values, and reloads if a cookie needs it. |
| **Reset** | Restores the snapshotted values (or deletes the cookie if it wasn't there before) and reloads. |

Pick a **region** from the preset list, or enter a **Custom ISO** (two letters). `Amazon`
uses its locale cookies (`i18n-prefs`/`glow-locale`); most others take the ISO directly.

## Method

| Step | Source |
|------|--------|
| Classify | client-trust (cookie) vs IP-lock (source IP); the tool only does client-trust and says so for IP-lock |
| Cookie table | `KNOWN[host]` → `{ name, value(iso), reloadAfter, verify }` + optional `proxyHint`; subdomains fall back to the parent host |
| Apply | snapshot previous values → set cookies on `host` + `.host` → clear stale `localStorage`/`sessionStorage` region keys → reload if `reloadAfter` |
| Reset | restore the snapshot (delete if it was empty) → reload |
| Gate detect | `GATE_SIGNALS` regex over the page text → "gate signal detected" hint |

`@grant none` - everything runs with the page's own origin.

## Limitations

- **IP-locked services won't unlock with a cookie.** Netflix, Disney+ and most CDNs gate on
  source IP. The `proxyHint`/`IPLOCK` note tells you a proxy is the real fix; the tool will
  not pretend otherwise.
- **Cookie names change.** The `KNOWN` table is best-effort and marked `verify` where the exact
  cookie wasn't re-confirmed. Add or edit entries (and bump `@version`) as sites change.
- Some services re-derive the region server-side after a short while, or on login; the
  cookie only steers the catalog until then.
- The broad `@match *://*/*` is intentional; the chip only appears on known hosts, and the
  panel is `Alt+G` on any host for dry-run / custom entries.

## Risk

**Gray: licensing deals, not consumer rights.** The tool only writes a cookie the page already
reads; it does **not** bypass a server check, decrypt DRM, or route around a source-IP gate.
Respect each service's terms and where you're entitled to access its catalog.

Part of the [userscript collection](https://github.com/chirag127/userscript-install-guide).

## License

[MIT](LICENSE) © 2026 chirag127

<!-- docs-single-source -->
## 📚 Documentation

Documentation for this repository lives in the umbrella workspace, in exactly **one** place:

| What | Where |
|------|-------|
| This script's note | [`docs/okf/scripts/region-select-userscript.md`](../../../../../docs/okf/scripts/region-select-userscript.md) |
| All notes, catalogued | [`docs/okf/index.md`](../../../../../docs/okf/index.md) |
| Shared knowledge | [`docs/okf/concepts/`](../../../../../docs/okf/concepts/) |

It is **not** copied into this repository. Nothing in this workspace is duplicated: one
document, one file. Verify with `node c:\ws\scripts\check-okf.mjs`.
