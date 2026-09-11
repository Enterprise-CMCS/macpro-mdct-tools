# MDCT StackPort fork

This tree is a **local soft-fork** of [StackPort](https://github.com/DaviReisVieira/stackport) for MDCT MiniStack DX.

- Keep changes here under `macpro-mdct-tools`.
- Do **not** open upstream PRs, push remotes, or contribute these patches back to the StackPort project (at least any of the MDCT ergonomics changes).
- Launch with `../scripts/run-stackport.sh` (or `./run stackport` from an app repo).
- Do not commit `ui/dist/` — `mdct-setup.sh` and `scripts/run-stackport.sh` build it locally.

## Where this diverges from upstream

Nested `.git` was removed, so Git in this repo cannot diff against StackPort. For info on the changes reference:
- [STACKPORT_CHANGES.md](./STACKPORT_CHANGES.md) — by-file / by-function summary 
