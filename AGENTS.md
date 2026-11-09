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
## 📚 Documentation lives in ONE place (mandatory)

All documentation for every repository in this workspace is **single-sourced** in the
umbrella repository:

```
c:\ws\docs\okf├── bundle.md            collection overview
├── index.md             catalogue of every concept and script note
├── concepts/            shared knowledge (architecture, testing, metadata, …)
└── scripts/             one note per userscript repository
```

### Rules

1. **Never create an `okf/` folder in this repository.** It is not duplicated here, by
   design. There was once a copy in every repo: 278 files describing 42 unique documents,
   with `concepts/architecture.md` physically present 32 times. Every edit had to be
   propagated to 30 repositories and drift was unavoidable.
2. **Never hand-edit a copy.** There are no copies. Edit the canonical file under
   `c:\ws\docs\okf\`.
3. **This repository's note is** `c:\ws\docs\okf\scripts\<repo-name>.md`. If it does not
   exist, add it before adding the script.
4. **Link, do not paste.** In `README.md`, link to the canonical note with a relative path
   from the workspace, e.g. `[documentation](../../../../../docs/okf/scripts/<repo-name>.md)`.
5. **Verify** with `node c:\ws\scripts\check-okf.mjs` — it exits `0` only when nothing is
   duplicated and every repository is linked and documented.
6. When adding a new script: create the repo, add `docs/okf/scripts/<repo-name>.md`, add it
   to the tables in `docs/okf/bundle.md` and `docs/okf/index.md`, then run the checker.

Full detail: `c:\ws\docs\okf\concepts\okf-requirement.md`.
