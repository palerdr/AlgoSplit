# AlgoSplit Backend → Client Coverage Audit

No-losses audit of **every** HTTP endpoint exposed by `backend/` against the typed client
`app/src/api/backend.ts`. Source lines reference the route decorator in the backend file.

**Status legend:** `client-only` = client function exists, no screen wired yet; `wired` = a
screen or shared app state consumes it. Nothing is omitted from the client.

## Count summary

| Metric | Count |
| --- | --- |
| Total backend endpoints (method + path) | **89** |
| Total client functions in `backend.ts` | **89** (1:1 with endpoints) |
| Endpoints without a client function | **0** |
| Routers covered | 16 of 16 (misc/root, auth, splits, imports, workouts, overrides, custom exercises, comparisons, programs, session templates, program sessions, program diagnostics, periodization, meso templates, bodyweight, analysis) |

Notes:
- `bodyweight.list()` and `customExercises.list()` unwrap the backend's `{ entries|exercises, total }` envelope to a plain array per the app API contract; the endpoints are still called 1:1.
- `overrides.update()` sends `pattern_override` as a **query** parameter — that is how the backend declares it (bare `str` param, overrides.py:198).
- Browser mutations attach the `X-CSRF-Token` header from the `algosplit_csrf_token` cookie. Native sessions use Keychain-backed Bearer tokens and automatically rotate them once on 401.

## misc — `backend/main.py`

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| GET | `/` | main.py:243 | `misc.root()` | client-only |
| GET | `/health` | main.py:330 | `misc.health()` | client-only |
| GET | `/keepalive` | main.py:341 | `misc.keepalive()` | client-only |
| HEAD | `/keepalive` | main.py:340 | `misc.keepaliveHead()` | client-only |

## auth — `backend/api/routes/auth.py` (prefix `/auth`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/auth/signup` | api/routes/auth.py:33 | `auth.signup(email, password)` | wired |
| POST | `/auth/login` | api/routes/auth.py:124 | `auth.login(email, password)` | wired (dedicated app entry screen) |
| GET | `/auth/user` | api/routes/auth.py:209 | `auth.me()` | wired |
| POST | `/auth/refresh` | api/routes/auth.py:234 | `auth.refresh(refreshToken?)` | wired (automatic native and browser session rotation) |
| POST | `/auth/forgot-password` | api/routes/auth.py:301 | `auth.forgotPassword(email)` | wired (sign-in recovery flow) |
| POST | `/auth/reset-password` | api/routes/auth.py:329 | `auth.resetPassword(accessToken, newPassword)` | wired (web and app recovery-link screen) |
| POST | `/auth/logout` | api/routes/auth.py:384 | `auth.logout()` | wired |
| DELETE | `/auth/account` | api/routes/auth.py:421 | `auth.deleteAccount()` | wired (confirmed destructive action in Account) |

## splits — `backend/api/routes/splits.py` (prefix `/api/splits`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/api/splits` | api/routes/splits.py:279 | `splits.create(split)` | client-only |
| GET | `/api/splits?include_exercises=` | api/routes/splits.py:401 | `splits.list(includeExercises?)` | wired (analysis, Workouts list, and Start Workout plans) |
| GET | `/api/splits/{split_id}` | api/routes/splits.py:457 | `splits.get(splitId)` | client-only |
| PUT | `/api/splits/{split_id}` | api/routes/splits.py:512 | `splits.update(splitId, update)` | client-only |
| PUT | `/api/splits/{split_id}/full` | api/routes/splits.py:584 | `splits.replace(splitId, split)` | wired (new/edit workout day builder with drag order and resistance profiles) |
| PUT | `/api/splits/{split_id}/exercises/batch` | api/routes/splits.py:734 | `splits.batchUpdateExercises(splitId, updates)` | client-only |
| DELETE | `/api/splits/{split_id}` | api/routes/splits.py:832 | `splits.remove(splitId)` | client-only |
| POST | `/api/splits/{split_id}/analyze?include_breakdowns=` | api/routes/splits.py:880 | `splits.analyze(splitId, includeBreakdowns?)` | client-only |

## imports — `backend/api/routes/imports.py` (prefix `/api/splits/import`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/api/splits/import/preview` | api/routes/imports.py:34 | `imports.preview(request)` | client-only |

## workouts — `backend/api/routes/workouts.py` (prefix `/api/workouts`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/api/workouts` | api/routes/workouts.py:152 | `workouts.create(payload)` | wired (validated logger, account-scoped durable outbox, visible idempotent retry) |
| GET | `/api/workouts?limit=&offset=&days=` | api/routes/workouts.py:278 | `workouts.list(params?)` | wired (complete paginated History tab and Progress ranges) |
| GET | `/api/workouts/summaries?limit=&offset=&days=` | api/routes/workouts.py:352 | `workouts.summaries(params?)` | client-only |
| GET | `/api/workouts/dates?days=` | api/routes/workouts.py:432 | `workouts.dates(days?)` | client-only |
| DELETE | `/api/workouts/exercises/by-name/{exercise_name}` | api/routes/workouts.py:489 | `workouts.clearExerciseHistory(exerciseName)` | client-only |
| PUT | `/api/workouts/{workout_id}` | api/routes/workouts.py:532 | `workouts.update(workoutId, payload)` | client-only |
| GET | `/api/workouts/{workout_id}` | api/routes/workouts.py:623 | `workouts.get(workoutId)` | client-only |
| GET | `/api/workouts/stats/summary?days=` | api/routes/workouts.py:676 | `workouts.stats(days?)` | client-only |
| DELETE | `/api/workouts/{workout_id}` | api/routes/workouts.py:788 | `workouts.remove(workoutId)` | client-only |

## overrides — `backend/api/routes/overrides.py` (prefix `/api/exercise-overrides`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| GET | `/api/exercise-overrides` | api/routes/overrides.py:24 | `overrides.list()` | client-only |
| POST | `/api/exercise-overrides` | api/routes/overrides.py:70 | `overrides.create(override)` | client-only |
| GET | `/api/exercise-overrides/{override_id}` | api/routes/overrides.py:148 | `overrides.get(overrideId)` | client-only |
| PUT | `/api/exercise-overrides/{override_id}?pattern_override=` | api/routes/overrides.py:198 | `overrides.update(overrideId, patternOverride)` | client-only |
| DELETE | `/api/exercise-overrides/{override_id}` | api/routes/overrides.py:260 | `overrides.remove(overrideId)` | client-only |

## customExercises — `backend/api/routes/custom_exercises.py` (prefix `/api/custom-exercises`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| GET | `/api/custom-exercises` | api/routes/custom_exercises.py:52 | `customExercises.list()` | client-only |
| POST | `/api/custom-exercises` | api/routes/custom_exercises.py:76 | `customExercises.create(payload)` | client-only |
| GET | `/api/custom-exercises/{exercise_id}` | api/routes/custom_exercises.py:137 | `customExercises.get(exerciseId)` | client-only |
| PUT | `/api/custom-exercises/{exercise_id}` | api/routes/custom_exercises.py:158 | `customExercises.update(exerciseId, payload)` | client-only |
| DELETE | `/api/custom-exercises/{exercise_id}` | api/routes/custom_exercises.py:253 | `customExercises.remove(exerciseId)` | client-only |

## comparisons — `backend/api/routes/comparisons.py` (prefix `/api/comparisons`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| GET | `/api/comparisons` | api/routes/comparisons.py:20 | `comparisons.list()` | client-only |
| POST | `/api/comparisons` | api/routes/comparisons.py:62 | `comparisons.create(comparison)` | client-only |
| GET | `/api/comparisons/{comparison_id}` | api/routes/comparisons.py:129 | `comparisons.get(comparisonId)` | client-only |
| PUT | `/api/comparisons/{comparison_id}` | api/routes/comparisons.py:177 | `comparisons.update(comparisonId, update)` | client-only |
| DELETE | `/api/comparisons/{comparison_id}` | api/routes/comparisons.py:266 | `comparisons.remove(comparisonId)` | client-only |

## programs — `backend/api/routes/programs.py` (prefix `/api/programs`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/api/programs` | api/routes/programs.py:60 | `programs.create(program)` | client-only |
| GET | `/api/programs` | api/routes/programs.py:88 | `programs.list()` | client-only |
| GET | `/api/programs/sessions/today?date=` | api/routes/programs.py:117 | `programs.todaySessions(date)` | client-only |
| GET | `/api/programs/{program_id}` | api/routes/programs.py:156 | `programs.get(programId)` | client-only |
| PUT | `/api/programs/{program_id}` | api/routes/programs.py:193 | `programs.update(programId, update)` | client-only |
| DELETE | `/api/programs/{program_id}` | api/routes/programs.py:220 | `programs.remove(programId)` | client-only |

## sessionTemplates — `backend/api/routes/session_templates.py` (prefix `/api/session-templates`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/api/session-templates` | api/routes/session_templates.py:36 | `sessionTemplates.create(template)` | client-only |
| POST | `/api/session-templates/from-session` | api/routes/session_templates.py:74 | `sessionTemplates.createFromSession(body)` | client-only |
| GET | `/api/session-templates` | api/routes/session_templates.py:127 | `sessionTemplates.list()` | client-only |
| GET | `/api/session-templates/{template_id}` | api/routes/session_templates.py:144 | `sessionTemplates.get(templateId)` | client-only |
| DELETE | `/api/session-templates/{template_id}` | api/routes/session_templates.py:161 | `sessionTemplates.remove(templateId)` | client-only |

## programSessions — `backend/api/routes/program_sessions.py` (prefix `/api/programs/{program_id}/sessions`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/api/programs/{program_id}/sessions` | api/routes/program_sessions.py:42 | `programSessions.schedule(programId, session)` | client-only |
| POST | `/api/programs/{program_id}/sessions/batch` | api/routes/program_sessions.py:85 | `programSessions.scheduleBatch(programId, sessions)` | client-only |
| GET | `/api/programs/{program_id}/sessions?start_date=&end_date=` | api/routes/program_sessions.py:131 | `programSessions.list(programId, params?)` | client-only |
| PUT | `/api/programs/{program_id}/sessions/{session_id}` | api/routes/program_sessions.py:157 | `programSessions.update(programId, sessionId, update)` | client-only |
| DELETE | `/api/programs/{program_id}/sessions/{session_id}` | api/routes/program_sessions.py:192 | `programSessions.remove(programId, sessionId)` | client-only |
| GET | `/api/programs/{program_id}/sessions/{session_id}/exercises` | api/routes/program_sessions.py:210 | `programSessions.exercises(programId, sessionId)` | client-only |
| PUT | `/api/programs/{program_id}/sessions/{session_id}/detach` | api/routes/program_sessions.py:276 | `programSessions.detach(programId, sessionId)` | client-only |

## programDiagnostics — `backend/api/routes/program_diagnostics.py` (prefix `/api/programs/{program_id}/diagnostics`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/api/programs/{program_id}/diagnostics` | api/routes/program_diagnostics.py:32 | `programDiagnostics.run(programId, request)` | client-only |

## periodization — `backend/api/routes/periodization.py` (prefix `/api/programs/{program_id}/periodization`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/api/programs/{program_id}/periodization/macros` | api/routes/periodization.py:60 | `periodization.createMacro(programId, macro)` | client-only |
| GET | `/api/programs/{program_id}/periodization/macros` | api/routes/periodization.py:84 | `periodization.listMacros(programId)` | client-only |
| PUT | `/api/programs/{program_id}/periodization/macros/{macro_id}` | api/routes/periodization.py:98 | `periodization.updateMacro(programId, macroId, update)` | client-only |
| DELETE | `/api/programs/{program_id}/periodization/macros/{macro_id}` | api/routes/periodization.py:123 | `periodization.removeMacro(programId, macroId)` | client-only |
| POST | `/api/programs/{program_id}/periodization/macros/{macro_id}/mesos` | api/routes/periodization.py:140 | `periodization.createMeso(programId, macroId, meso)` | client-only |
| PUT | `/api/programs/{program_id}/periodization/mesos/{meso_id}` | api/routes/periodization.py:161 | `periodization.updateMeso(programId, mesoId, update)` | client-only |
| DELETE | `/api/programs/{program_id}/periodization/mesos/{meso_id}` | api/routes/periodization.py:185 | `periodization.removeMeso(programId, mesoId)` | client-only |
| POST | `/api/programs/{program_id}/periodization/mesos/{meso_id}/micros` | api/routes/periodization.py:202 | `periodization.createMicro(programId, mesoId, micro)` | client-only |
| PUT | `/api/programs/{program_id}/periodization/micros/{micro_id}` | api/routes/periodization.py:222 | `periodization.updateMicro(programId, microId, update)` | client-only |
| DELETE | `/api/programs/{program_id}/periodization/micros/{micro_id}` | api/routes/periodization.py:246 | `periodization.removeMicro(programId, microId)` | client-only |
| PUT | `/api/programs/{program_id}/periodization/micros/{micro_id}/assign-sessions` | api/routes/periodization.py:263 | `periodization.assignSessions(programId, microId, sessionIds)` | client-only |

## mesoTemplates — `backend/api/routes/meso_templates.py` (prefix `/api/meso-templates`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/api/meso-templates` | api/routes/meso_templates.py:107 | `mesoTemplates.create(body)` | client-only |
| GET | `/api/meso-templates` | api/routes/meso_templates.py:229 | `mesoTemplates.list()` | client-only |
| GET | `/api/meso-templates/{template_id}` | api/routes/meso_templates.py:262 | `mesoTemplates.get(templateId)` | client-only |
| DELETE | `/api/meso-templates/{template_id}` | api/routes/meso_templates.py:312 | `mesoTemplates.remove(templateId)` | client-only |
| POST | `/api/meso-templates/{template_id}/apply` | api/routes/meso_templates.py:350 | `mesoTemplates.apply(templateId, body)` | client-only |

## bodyweight — `backend/api/routes/bodyweight.py` (prefix `/api/bodyweight`)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| GET | `/api/bodyweight` | api/routes/bodyweight.py:19 | `bodyweight.list()` | client-only |
| POST | `/api/bodyweight` | api/routes/bodyweight.py:38 | `bodyweight.log(weight, date?, notes?)` | client-only |
| POST | `/api/bodyweight/batch` | api/routes/bodyweight.py:72 | `bodyweight.logBatch(entries)` | client-only |
| DELETE | `/api/bodyweight/{entry_id}` | api/routes/bodyweight.py:108 | `bodyweight.remove(entryId)` | client-only |

## analysis — `backend/api/analysis_routes.py` (mounted at `/api`, main.py:389)

| Method | Path | Source | Client function | Status |
| --- | --- | --- | --- | --- |
| POST | `/api/analyze-split` | api/analysis_routes.py:94 | `analysis.analyzeSplit(request)` | wired |
| POST | `/api/analyze-workouts?days=&end_date=&timezone_offset_minutes=&stimulus_duration=&maintenance_volume=&dataset=` | api/analysis_routes.py:157 | `analysis.analyzeWorkouts(params?)` | wired (Home stimulus body with account-scoped defaults) |
| GET | `/api/muscle-regions` | api/analysis_routes.py:642 | `analysis.muscleRegions()` | client-only |
| POST | `/api/parse-exercise` | api/analysis_routes.py:688 | `analysis.parseExercise(text)` | client-only |
| GET | `/api/patterns` | api/analysis_routes.py:760 | `analysis.patterns()` | client-only |
