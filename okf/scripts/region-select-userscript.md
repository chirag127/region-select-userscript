---
type: Script
title: Region & Geo Unlock
description: Overrides the region a service reads from its own cookie on any client-trust host, with a per-site cookie table, an IP-locked "you need a proxy" notice, and dry-run → apply → reset.
repo: https://github.com/chirag127/region-select-userscript
install: https://github.com/chirag127/region-select-userscript/raw/main/region-select-userscript.user.js
version: "1.0.0"
tags: [userscript, region, geo, locale, cookie, unlock]
timestamp: 2026-11-09T00:00:00Z
---

# Region & Geo Unlock

A cross-region convenience script. It writes the region cookie the page already reads, so
the catalog/territory follows. It never bypasses a server check and never routes around a
source-IP gate - for IP-locked services it says "you need a proxy" and stops. `@grant none`.

TikTok India is the proven ✅ case in this collection, but it is better solved by the
mirror handoff in `tiktok-india-unlock-userscript`. This tool is the **general
cookie-override path** for everything else, and the two are complementary, not overlapping.

## Method

| Step | Source |
|------|--------|
| Classify | client-trust (cookie picks the catalog) vs IP-lock (source IP refused); this tool does (1), honestly reports (2) |
| Cookie table | `KNOWN[host]` → `{ name, value(iso), reloadAfter, verify }` + optional `proxyHint`; subdomains fall back to the parent host |
| Apply | snapshot the previous values → set each cookie on `host` + `.host` → clear stale `localStorage`/`sessionStorage` region keys → reload if `reloadAfter` |
| Reset | restore the snapshot (delete if it was empty) → reload |
| Gate detect | `GATE_SIGNALS` regex over `document.body.innerText` → "gate signal detected" hint |

The apply path is **dry-run → user confirms → apply**, and it snapshots previous values so
**Reset** restores them. The chip only surfaces on `KNOWN` hosts; the panel is reachable on
any host via `Alt+G` for dry-run or a per-site entry.

## IP-locked services

Netflix, Disney+ and most CDNs gate on the **source IP**, not a cookie. The `IPLOCK` table +
per-entry `proxyHint` tell the user to set up a proxy/relay for the target country; a cookie
like `nv_geo` is a catalog hint, not an unlock.

## Limitations

- **Cookie names change** and are marked `verify` where not re-confirmed. Edit `KNOWN` and
  bump `@version` as sites change.
- Some services re-derive the region server-side after a while, or on login; the cookie only
  steers the catalog until then.
- Broad `@match *://*/*` is intentional; the UI is gated to known hosts plus the hotkey.

## Risk

**Gray: licensing deals, not consumer rights.** Writes a cookie the page already reads; does
not bypass a server check, decrypt DRM, or route around a source-IP gate. Respect each
service's terms and where you're entitled to access its catalog.
