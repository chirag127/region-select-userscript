# AGENTS.md - region-select-userscript

Single-file userscript. `region-select-userscript.user.js` at repo root IS the
product. No build, no deps, `@grant none`.

## Method

| Step | Source |
|------|--------|
| Classify | region gate is either **client-trust** (service picks a catalog from a cookie) or **IP-lock** (source IP is refused). This tool does (1); for (2) it says "use a proxy" and stops |
| Cookie table | `KNOWN[host]` → list of `{ name, value(iso), reloadAfter, verify }` + an optional `proxyHint`; subdomain checkouts fall back to the parent host |
| Apply | snapshot the previous value of each cookie (`state.snapshot`), set the new value across the host + `.` host, clear stale `localStorage`/`sessionStorage` region keys, reload if any cookie has `reloadAfter` |
| Reset | restore the snapshot values (or delete the cookie if it was empty), reload |
| Gate detect | `GATE_SIGNALS` regex over `document.body.innerText` → "gate signal detected" hint |

TikTok India is the proven ✅ case, but it is better served by the mirror handoff in
`tiktok-india-unlock-userscript` - this tool is the **general cookie-override path** for
everything else. The two are complementary, not overlapping.

## Rules

- One file, zero deps, `@grant none`. Bump `@version`; keep `@updateURL`/`@downloadURL` on raw `main`.
- Broad `@match *://*/*` is intentional (a cross-region tool). The 🌍 chip only appears on
  hosts with a `KNOWN` entry; the panel is reachable on any host via `Alt+G` so the user can
  still dry-run / add a per-site override.
- **Always dry-run before applying.** The apply path is user-triggered; it snapshots the
  previous values so reset can restore them. Never auto-apply on load.
- **Be honest about IP-locks.** Netflix / Disney+ / most CDNs gate on source IP; the
  `proxyHint` + `IPLOCK` table must tell the user "you need a proxy" instead of pretending a
  cookie unlocks it.
- **Guard every global hotkey with `isTyping()`.**
- **Gray classification: licensing deals, not consumer rights.** The tool only writes a
  cookie the page already reads; it does not bypass a server check, decrypt DRM, or route
  around a source-IP gate. Put that in the README and the OKF note.

## Install docs

Shared guide: https://github.com/chirag127/userscript-install-guide - link it, never duplicate install steps.

## Test

`sctl install ./region-select-userscript.user.js`, open a `KNOWN` host (e.g. `netflix.com`),
press `Alt+G`, run **Dry run**, confirm the plan lists `nv_geo` with a `verify` + `reload`
tag and the "you need a proxy" note, then **Apply** and confirm the cookie is set and the page
reloads. On a clean page, **Reset** restores it. Check `sctl debug console --level error`.

<!-- okf-requirement -->
## OKF documentation requirement (mandatory)

Every repository in this collection MUST ship an Open Knowledge Format bundle in `okf/`.

- Canonical bundle: `repos/own/public/userscripts/okf/` in the `c:\ws` monorepo. Never hand-edit a repo's `okf/` copy.
- After changing the canonical bundle run `node okf/sync-okf.mjs`; verify with `node okf/sync-okf.mjs --check` (must exit 0).
- `README.md` must link to `okf/`.
