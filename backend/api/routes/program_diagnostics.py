"""
Program diagnostics routes - bridges to existing analysis engine
"""

from fastapi import APIRouter, HTTPException, Depends, status
from db.supabase import get_supabase_client_with_token
from schemas.programs import DiagnosticsRequest
from schemas.auth import ErrorResponse
from api.dependencies import get_current_user, AuthUser
from schemas.models import SplitRequest, SessionInput, ExerciseInput
from api.analysis_routes import analyze_split as run_analysis

router = APIRouter(prefix="/api/programs/{program_id}/diagnostics", tags=["Program Diagnostics"])


async def get_session_exercises(supabase, session_data: dict) -> list:
    """Resolve exercises for a program session (template or overrides)"""
    overrides = session_data.get("program_session_exercises", []) or []
    if overrides:
        return sorted(overrides, key=lambda e: e.get("order_index", 0))

    template_id = session_data.get("template_id")
    if template_id:
        result = supabase.table("session_template_exercises").select("*").eq(
            "template_id", template_id
        ).order("order_index").execute()
        return result.data or []

    return []


@router.post("")
async def run_diagnostics(
    program_id: str,
    request: DiagnosticsRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Get program settings
        prog = supabase.table("programs").select("*").eq("id", program_id).execute()
        if not prog.data:
            raise HTTPException(status_code=404, detail="Program not found")
        program = prog.data[0]

        if request.level == "session":
            if not request.target_id:
                raise HTTPException(status_code=400, detail="target_id required for session diagnostics")

            sess = supabase.table("program_sessions").select(
                "*, program_session_exercises(*)"
            ).eq("id", request.target_id).eq("program_id", program_id).execute()

            if not sess.data:
                raise HTTPException(status_code=404, detail="Session not found")

            session_data = sess.data[0]
            exercises = await get_session_exercises(supabase, session_data)

            if not exercises:
                raise HTTPException(status_code=400, detail="Session has no exercises")

            session_name = session_data.get("custom_name") or "Session"
            analysis_exercises = [
                ExerciseInput(
                    name=ex["exercise_name"],
                    sets=ex["sets"],
                    unilateral=ex.get("unilateral", False),
                    resistance_profile=ex.get("resistance_profile"),
                )
                for ex in exercises
            ]

            split_request = SplitRequest(
                name=f"Diagnostics: {session_name}",
                sessions=[SessionInput(name=session_name, day=1, exercises=analysis_exercises)],
                cycle_length=1,
                stimulus_duration=program.get("stimulus_duration", 48),
                maintenance_volume=program.get("maintenance_volume", 4),
                dataset=program.get("dataset", "schoenfeld"),
            )

            return await run_analysis(split_request)

        elif request.level == "micro":
            if not request.target_id:
                raise HTTPException(status_code=400, detail="target_id required for micro diagnostics")

            # Get all sessions in this microcycle
            micro_sessions = supabase.table("program_sessions").select(
                "*, program_session_exercises(*)"
            ).eq("micro_id", request.target_id).eq("program_id", program_id).order("date").execute()

            if not micro_sessions.data:
                raise HTTPException(status_code=400, detail="Microcycle has no sessions")

            # Build multi-session SplitRequest
            analysis_sessions = []
            from datetime import datetime as dt
            for sess in micro_sessions.data:
                exercises = await get_session_exercises(supabase, sess)
                if not exercises:
                    continue
                # Day number from weekday (Mon=1 ... Sun=7)
                session_date = dt.strptime(sess["date"], "%Y-%m-%d")
                day_num = session_date.isoweekday()  # Mon=1, Sun=7
                session_name = sess.get("custom_name") or f"Day {day_num}"

                analysis_exercises = [
                    ExerciseInput(
                        name=ex["exercise_name"],
                        sets=ex["sets"],
                        unilateral=ex.get("unilateral", False),
                        resistance_profile=ex.get("resistance_profile"),
                    )
                    for ex in exercises
                ]
                analysis_sessions.append(
                    SessionInput(name=session_name, day=day_num, exercises=analysis_exercises)
                )

            if not analysis_sessions:
                raise HTTPException(status_code=400, detail="No exercises found in microcycle sessions")

            split_request = SplitRequest(
                name=f"Micro Diagnostics",
                sessions=analysis_sessions,
                cycle_length=7,
                stimulus_duration=program.get("stimulus_duration", 48),
                maintenance_volume=program.get("maintenance_volume", 4),
                dataset=program.get("dataset", "schoenfeld"),
            )

            return await run_analysis(split_request)
        elif request.level == "meso":
            if not request.target_id:
                raise HTTPException(status_code=400, detail="target_id required for meso diagnostics")

            # Get all micros in this meso
            micros = supabase.table("program_micros").select("id, week_index").eq(
                "meso_id", request.target_id
            ).order("week_index").execute()

            if not micros.data:
                raise HTTPException(status_code=400, detail="Mesocycle has no microcycles")

            # For each micro, run week-level analysis
            from datetime import datetime as dt
            weekly_results = []
            for micro in micros.data:
                micro_sessions = supabase.table("program_sessions").select(
                    "*, program_session_exercises(*)"
                ).eq("micro_id", micro["id"]).order("date").execute()

                if not micro_sessions.data:
                    weekly_results.append({"week_index": micro["week_index"], "analysis": None})
                    continue

                analysis_sessions = []
                for sess in micro_sessions.data:
                    exercises = await get_session_exercises(supabase, sess)
                    if not exercises:
                        continue
                    session_date = dt.strptime(sess["date"], "%Y-%m-%d")
                    day_num = session_date.isoweekday()
                    session_name = sess.get("custom_name") or f"Day {day_num}"
                    analysis_exercises = [
                        ExerciseInput(
                            name=ex["exercise_name"], sets=ex["sets"],
                            unilateral=ex.get("unilateral", False),
                            resistance_profile=ex.get("resistance_profile"),
                        )
                        for ex in exercises
                    ]
                    analysis_sessions.append(
                        SessionInput(name=session_name, day=day_num, exercises=analysis_exercises)
                    )

                if not analysis_sessions:
                    weekly_results.append({"week_index": micro["week_index"], "analysis": None})
                    continue

                split_request = SplitRequest(
                    name=f"Week {micro['week_index'] + 1}",
                    sessions=analysis_sessions,
                    cycle_length=7,
                    stimulus_duration=program.get("stimulus_duration", 48),
                    maintenance_volume=program.get("maintenance_volume", 4),
                    dataset=program.get("dataset", "schoenfeld"),
                )
                result = await run_analysis(split_request)
                weekly_results.append({"week_index": micro["week_index"], "analysis": result})

            # Build progression data: region_id -> [week0_net, week1_net, ...]
            progression = {}
            for wr in weekly_results:
                if wr["analysis"] is None:
                    continue
                for muscle in wr["analysis"].muscles:
                    rid = muscle.region_id
                    if rid not in progression:
                        progression[rid] = {"region_id": rid, "display_name": muscle.display_name, "parent_group": muscle.parent_group, "values": []}
                    progression[rid]["values"].append({
                        "week_index": wr["week_index"],
                        "net_stimulus": muscle.net_stimulus,
                        "stimulus": muscle.stimulus,
                        "atrophy": muscle.atrophy,
                    })

            return {
                "level": "meso",
                "target_id": request.target_id,
                "weeks": weekly_results,
                "progression": list(progression.values()),
            }

        elif request.level == "macro":
            if not request.target_id:
                raise HTTPException(status_code=400, detail="target_id required for macro diagnostics")

            # Get all mesos in this macro
            mesos = supabase.table("program_mesos").select(
                "id, name, order_index"
            ).eq("macro_id", request.target_id).order("order_index").execute()

            if not mesos.data:
                raise HTTPException(status_code=400, detail="Macrocycle has no mesocycles")

            # For each meso, get average stimulus across all its weeks
            meso_summaries = []
            for meso in mesos.data:
                micros = supabase.table("program_micros").select("id").eq("meso_id", meso["id"]).execute()
                if not micros.data:
                    meso_summaries.append({"meso_id": meso["id"], "name": meso["name"], "avg_stimulus": {}})
                    continue

                all_muscle_stimulus = {}
                week_count = 0
                from datetime import datetime as dt
                for micro in micros.data:
                    micro_sessions = supabase.table("program_sessions").select(
                        "*, program_session_exercises(*)"
                    ).eq("micro_id", micro["id"]).order("date").execute()

                    if not micro_sessions.data:
                        continue

                    analysis_sessions = []
                    for sess in micro_sessions.data:
                        exercises = await get_session_exercises(supabase, sess)
                        if not exercises:
                            continue
                        session_date = dt.strptime(sess["date"], "%Y-%m-%d")
                        day_num = session_date.isoweekday()
                        analysis_exercises = [
                            ExerciseInput(
                                name=ex["exercise_name"], sets=ex["sets"],
                                unilateral=ex.get("unilateral", False),
                                resistance_profile=ex.get("resistance_profile"),
                            )
                            for ex in exercises
                        ]
                        analysis_sessions.append(
                            SessionInput(name=sess.get("custom_name") or f"Day {day_num}", day=day_num, exercises=analysis_exercises)
                        )

                    if not analysis_sessions:
                        continue

                    split_request = SplitRequest(
                        name=f"Micro analysis",
                        sessions=analysis_sessions, cycle_length=7,
                        stimulus_duration=program.get("stimulus_duration", 48),
                        maintenance_volume=program.get("maintenance_volume", 4),
                        dataset=program.get("dataset", "schoenfeld"),
                    )
                    result = await run_analysis(split_request)
                    week_count += 1
                    for muscle in result.muscles:
                        if muscle.region_id not in all_muscle_stimulus:
                            all_muscle_stimulus[muscle.region_id] = {"total": 0, "display_name": muscle.display_name, "parent_group": muscle.parent_group}
                        all_muscle_stimulus[muscle.region_id]["total"] += muscle.net_stimulus

                avg_stimulus = {}
                if week_count > 0:
                    for rid, data in all_muscle_stimulus.items():
                        avg_stimulus[rid] = {
                            "region_id": rid,
                            "display_name": data["display_name"],
                            "parent_group": data["parent_group"],
                            "avg_net_stimulus": round(data["total"] / week_count, 2),
                        }

                meso_summaries.append({
                    "meso_id": meso["id"],
                    "name": meso["name"],
                    "avg_stimulus": avg_stimulus,
                    "week_count": week_count,
                })

            return {
                "level": "macro",
                "target_id": request.target_id,
                "meso_summaries": meso_summaries,
            }
        else:
            raise HTTPException(status_code=400, detail=f"Unknown diagnostics level: {request.level}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diagnostics failed: {str(e)}")
