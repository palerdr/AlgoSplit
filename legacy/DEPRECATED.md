# Legacy Directory - DEPRECATED

This directory contains the **original prototype code** from Split.AI's early development. All modules here have been superseded by the current `backend/core/` implementation.

## Files

| File | Replaced By | What Changed |
|------|-------------|--------------|
| `baseClasses.py` | `backend/core/MainClasses.py` | 16-muscle model -> 29-region granular model with tiered stimulus, leverage matching, CNS fatigue, consecutive day penalties |
| `netweeklystim.py` | `backend/core/MainClasses.py` (`Split.simulate_split`) | Fixed 7-day sim -> arbitrary cycle lengths with multi-week LCM normalization |
| `user_input.py` | `backend/api/routes/` + `app/` | CLI input -> REST API + React Native mobile app |

## Do NOT

- Import from these files in any new code
- Use these classes as a reference for current behavior (the math has changed significantly)

## Safe to Delete

These files can be removed entirely without affecting any active code path. They are retained only for historical reference of the original algorithm design.
