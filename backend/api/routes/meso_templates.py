"""
Meso template routes - save/load/apply mesocycle templates
"""

from fastapi import APIRouter, HTTPException, Depends, status
from db.supabase import get_supabase_client_with_token
from schemas.meso_templates import (
    MesoTemplateCreate,
    MesoTemplateResponse,
    MesoTemplateListResponse,
    MesoTemplateWeek,
    MesoTemplateSession,
    MesoTemplateExercise,
    ApplyMesoTemplateRequest,
)
from api.dependencies import get_current_user, AuthUser
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/meso-templates", tags=["Meso Templates"])


# ============================================================================
# Helpers
# ============================================================================

async def get_session_exercises(supabase, session_data: dict) -> list:
    """Resolve exercises for a program session (overrides first, then template fallback)"""
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


def build_template_response(template: dict, weeks: list) -> MesoTemplateResponse:
    """Build a full MesoTemplateResponse from DB rows"""
    return MesoTemplateResponse(
        id=template["id"],
        user_id=template["user_id"],
        name=template["name"],
        focus=template.get("focus"),
        progression_type=template.get("progression_type"),
        notes=template.get("notes"),
        weeks=weeks,
        created_at=template["created_at"],
    )


def build_weeks_from_db(week_rows: list, session_rows: list, exercise_rows: list) -> list[MesoTemplateWeek]:
    """Assemble nested week/session/exercise structure from flat DB rows"""
    # Index exercises by session_id
    exercises_by_session = {}
    for ex in exercise_rows:
        sid = ex["session_id"]
        if sid not in exercises_by_session:
            exercises_by_session[sid] = []
        exercises_by_session[sid].append(MesoTemplateExercise(
            exercise_name=ex["exercise_name"],
            sets=ex["sets"],
            order_index=ex["order_index"],
            unilateral=ex.get("unilateral", False),
            resistance_profile=ex.get("resistance_profile"),
        ))

    # Index sessions by week_id
    sessions_by_week = {}
    for sess in session_rows:
        wid = sess["week_id"]
        if wid not in sessions_by_week:
            sessions_by_week[wid] = []
        sessions_by_week[wid].append(MesoTemplateSession(
            name=sess["name"],
            day_of_week=sess["day_of_week"],
            order_index=sess["order_index"],
            exercises=sorted(
                exercises_by_session.get(sess["id"], []),
                key=lambda e: e.order_index,
            ),
        ))

    # Build weeks
    weeks = []
    for w in sorted(week_rows, key=lambda x: x.get("week_index", 0)):
        weeks.append(MesoTemplateWeek(
            week_index=w["week_index"],
            deload=w.get("deload", False),
            sessions=sorted(
                sessions_by_week.get(w["id"], []),
                key=lambda s: s.order_index,
            ),
        ))

    return weeks


# ============================================================================
# POST "" — Save a mesocycle as a template
# ============================================================================

@router.post("", response_model=MesoTemplateResponse, status_code=status.HTTP_201_CREATED)
async def save_meso_as_template(
    body: MesoTemplateCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Save an existing mesocycle as a reusable template.
    Snapshots all weeks, sessions, and exercises.
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.rpc("save_meso_template_from_meso", {
            "p_source_meso_id": body.source_meso_id,
            "p_name": body.name,
            "p_notes": body.notes,
        }).execute()
        payload = result.data[0] if isinstance(result.data, list) else result.data
        if not isinstance(payload, dict):
            raise RuntimeError("save_meso_template_from_meso returned an invalid payload")
        return MesoTemplateResponse.model_validate(payload)

        # 1. Fetch the source meso
        meso_res = supabase.table("program_mesos").select("*").eq("id", body.source_meso_id).execute()
        if not meso_res.data:
            raise HTTPException(status_code=404, detail="Source mesocycle not found")
        meso = meso_res.data[0]

        # 2. Fetch micros for this meso
        micros_res = supabase.table("program_micros").select("*").eq(
            "meso_id", body.source_meso_id
        ).order("week_index").execute()
        micros = micros_res.data or []

        if not micros:
            raise HTTPException(status_code=400, detail="Mesocycle has no microcycles to save")

        # 3. Create the template record
        template_insert = {
            "user_id": current_user.id,
            "name": body.name,
            "focus": meso.get("focus"),
            "progression_type": meso.get("progression_type"),
            "notes": body.notes,
        }
        template_res = supabase.table("meso_templates").insert(template_insert).execute()
        if not template_res.data:
            raise HTTPException(status_code=500, detail="Failed to create template")
        template = template_res.data[0]
        template_id = template["id"]

        # 4. For each micro, create a template week and snapshot sessions + exercises
        all_weeks = []
        all_sessions = []
        all_exercises = []

        for micro in micros:
            # Create template week
            week_insert = {
                "template_id": template_id,
                "week_index": micro["week_index"],
                "deload": micro.get("deload", False),
            }
            week_res = supabase.table("meso_template_weeks").insert(week_insert).execute()
            if not week_res.data:
                continue
            week = week_res.data[0]
            all_weeks.append(week)

            # Fetch program sessions for this micro
            sessions_res = supabase.table("program_sessions").select(
                "*, program_session_exercises(*)"
            ).eq("micro_id", micro["id"]).order("date").execute()

            session_order = 0
            for sess in (sessions_res.data or []):
                exercises = await get_session_exercises(supabase, sess)
                if not exercises:
                    continue

                # Determine day_of_week from session date
                try:
                    sess_date = datetime.strptime(sess["date"], "%Y-%m-%d")
                    day_of_week = sess_date.weekday()  # 0=Mon, 6=Sun
                except (ValueError, KeyError):
                    day_of_week = session_order

                session_name = sess.get("custom_name") or sess.get("template_name") or f"Session {session_order + 1}"

                # Create template session
                tsess_insert = {
                    "week_id": week["id"],
                    "name": session_name,
                    "day_of_week": day_of_week,
                    "order_index": session_order,
                }
                tsess_res = supabase.table("meso_template_sessions").insert(tsess_insert).execute()
                if not tsess_res.data:
                    continue
                tsess = tsess_res.data[0]
                all_sessions.append(tsess)

                # Create template exercises
                for ex in exercises:
                    tex_insert = {
                        "session_id": tsess["id"],
                        "exercise_name": ex["exercise_name"],
                        "sets": ex["sets"],
                        "order_index": ex.get("order_index", 0),
                        "unilateral": ex.get("unilateral", False),
                        "resistance_profile": ex.get("resistance_profile"),
                    }
                    tex_res = supabase.table("meso_template_exercises").insert(tex_insert).execute()
                    if tex_res.data:
                        all_exercises.append(tex_res.data[0])

                session_order += 1

        # Build response
        weeks = build_weeks_from_db(all_weeks, all_sessions, all_exercises)
        return build_template_response(template, weeks)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save meso template: {str(e)}")


# ============================================================================
# GET "" — List all meso templates for the user
# ============================================================================

@router.get("", response_model=list[MesoTemplateListResponse])
async def list_meso_templates(
    current_user: AuthUser = Depends(get_current_user),
):
    """List all saved meso templates for the current user"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        result = supabase.table("meso_templates").select(
            "id, name, focus, created_at, meso_template_weeks(id)"
        ).eq("user_id", current_user.id).order("created_at", desc=True).execute()

        templates = []
        for t in (result.data or []):
            weeks = t.get("meso_template_weeks", []) or []
            templates.append(MesoTemplateListResponse(
                id=t["id"],
                name=t["name"],
                focus=t.get("focus"),
                week_count=len(weeks),
                created_at=t["created_at"],
            ))

        return templates

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list meso templates: {str(e)}")


# ============================================================================
# GET "/{template_id}" — Get full template detail
# ============================================================================

@router.get("/{template_id}", response_model=MesoTemplateResponse)
async def get_meso_template(
    template_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Get full template detail with weeks, sessions, and exercises"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Fetch template
        t_res = supabase.table("meso_templates").select("*").eq("id", template_id).eq("user_id", current_user.id).execute()
        if not t_res.data:
            raise HTTPException(status_code=404, detail="Template not found")
        template = t_res.data[0]

        # Fetch weeks
        weeks_res = supabase.table("meso_template_weeks").select("*").eq(
            "template_id", template_id
        ).order("week_index").execute()
        week_rows = weeks_res.data or []

        # Fetch sessions for all weeks
        week_ids = [w["id"] for w in week_rows]
        session_rows = []
        exercise_rows = []

        if week_ids:
            for wid in week_ids:
                s_res = supabase.table("meso_template_sessions").select("*").eq("week_id", wid).order("order_index").execute()
                session_rows.extend(s_res.data or [])

            # Fetch exercises for all sessions
            session_ids = [s["id"] for s in session_rows]
            for sid in session_ids:
                e_res = supabase.table("meso_template_exercises").select("*").eq("session_id", sid).order("order_index").execute()
                exercise_rows.extend(e_res.data or [])

        weeks = build_weeks_from_db(week_rows, session_rows, exercise_rows)
        return build_template_response(template, weeks)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get meso template: {str(e)}")


# ============================================================================
# DELETE "/{template_id}" — Delete a meso template
# ============================================================================

@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meso_template(
    template_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Delete a meso template and all its child records (cascade)"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Verify ownership
        t_res = supabase.table("meso_templates").select("id").eq("id", template_id).eq("user_id", current_user.id).execute()
        if not t_res.data:
            raise HTTPException(status_code=404, detail="Template not found")

        # Delete weeks (should cascade to sessions and exercises via FK)
        weeks_res = supabase.table("meso_template_weeks").select("id").eq("template_id", template_id).execute()
        for w in (weeks_res.data or []):
            sessions_res = supabase.table("meso_template_sessions").select("id").eq("week_id", w["id"]).execute()
            for s in (sessions_res.data or []):
                supabase.table("meso_template_exercises").delete().eq("session_id", s["id"]).execute()
            supabase.table("meso_template_sessions").delete().eq("week_id", w["id"]).execute()
        supabase.table("meso_template_weeks").delete().eq("template_id", template_id).execute()

        # Delete the template itself
        supabase.table("meso_templates").delete().eq("id", template_id).eq("user_id", current_user.id).execute()

        return None

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete meso template: {str(e)}")


# ============================================================================
# POST "/{template_id}/apply" — Apply a meso template to a program
# ============================================================================

@router.post("/{template_id}/apply")
async def apply_meso_template(
    template_id: str,
    body: ApplyMesoTemplateRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Apply a meso template to a macrocycle within a program.
    Creates a new meso with micros, sessions, and exercises derived from the template.
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.rpc("apply_meso_template_full", {
            "p_template_id": template_id,
            "p_macro_id": body.macro_id,
            "p_start_date": body.start_date,
            "p_name": body.name,
        }).execute()
        payload = result.data[0] if isinstance(result.data, list) else result.data
        if not isinstance(payload, dict):
            raise RuntimeError("apply_meso_template_full returned an invalid payload")
        return payload

        # 1. Verify template ownership
        t_res = supabase.table("meso_templates").select("*").eq("id", template_id).eq("user_id", current_user.id).execute()
        if not t_res.data:
            raise HTTPException(status_code=404, detail="Template not found")
        template = t_res.data[0]

        # 2. Verify macro exists and get its program_id
        macro_res = supabase.table("program_macros").select("id, program_id").eq("id", body.macro_id).execute()
        if not macro_res.data:
            raise HTTPException(status_code=404, detail="Macrocycle not found")
        program_id = macro_res.data[0]["program_id"]

        # 3. Parse start_date
        try:
            start_date = datetime.strptime(body.start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format, expected yyyy-MM-dd")

        # 4. Fetch template weeks, sessions, exercises
        weeks_res = supabase.table("meso_template_weeks").select("*").eq(
            "template_id", template_id
        ).order("week_index").execute()
        week_rows = weeks_res.data or []

        if not week_rows:
            raise HTTPException(status_code=400, detail="Template has no weeks")

        # Fetch all sessions and exercises
        all_sessions = []
        all_exercises = []
        for w in week_rows:
            s_res = supabase.table("meso_template_sessions").select("*").eq("week_id", w["id"]).order("order_index").execute()
            for s in (s_res.data or []):
                all_sessions.append(s)
                e_res = supabase.table("meso_template_exercises").select("*").eq("session_id", s["id"]).order("order_index").execute()
                all_exercises.extend(e_res.data or [])

        # Index exercises by template session id
        exercises_by_tsess = {}
        for ex in all_exercises:
            sid = ex["session_id"]
            if sid not in exercises_by_tsess:
                exercises_by_tsess[sid] = []
            exercises_by_tsess[sid].append(ex)

        # Index sessions by week id
        sessions_by_week = {}
        for s in all_sessions:
            wid = s["week_id"]
            if wid not in sessions_by_week:
                sessions_by_week[wid] = []
            sessions_by_week[wid].append(s)

        # 5. Determine next meso order_index
        existing_mesos = supabase.table("program_mesos").select("order_index").eq("macro_id", body.macro_id).execute()
        max_order = max((m.get("order_index", 0) for m in (existing_mesos.data or [])), default=-1)

        # 6. Create the new meso
        meso_name = body.name or template["name"]
        num_weeks = len(week_rows)
        end_date = start_date + timedelta(weeks=num_weeks) - timedelta(days=1)

        meso_insert = {
            "macro_id": body.macro_id,
            "name": meso_name,
            "order_index": max_order + 1,
            "focus": template.get("focus"),
            "progression_type": template.get("progression_type", "linear"),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        }
        meso_res = supabase.table("program_mesos").insert(meso_insert).execute()
        if not meso_res.data:
            raise HTTPException(status_code=500, detail="Failed to create mesocycle")
        new_meso = meso_res.data[0]
        meso_id = new_meso["id"]

        # 7. For each week, create micro + sessions
        for w in week_rows:
            week_start = start_date + timedelta(weeks=w["week_index"])
            week_end = week_start + timedelta(days=6)

            micro_insert = {
                "meso_id": meso_id,
                "week_index": w["week_index"],
                "deload": w.get("deload", False),
                "start_date": week_start.isoformat(),
                "end_date": week_end.isoformat(),
            }
            micro_res = supabase.table("program_micros").insert(micro_insert).execute()
            if not micro_res.data:
                continue
            micro = micro_res.data[0]
            micro_id = micro["id"]

            # Create sessions for this week
            for tsess in sessions_by_week.get(w["id"], []):
                # Compute session date from day_of_week offset
                session_date = week_start + timedelta(days=tsess["day_of_week"])

                # Create a session template from template exercises
                tex_list = exercises_by_tsess.get(tsess["id"], [])

                # Create the session template
                st_insert = {
                    "user_id": current_user.id,
                    "name": tsess["name"],
                }
                st_res = supabase.table("session_templates").insert(st_insert).execute()
                if not st_res.data:
                    continue
                new_template = st_res.data[0]
                new_template_id = new_template["id"]

                # Insert template exercises
                for tex in tex_list:
                    ste_insert = {
                        "template_id": new_template_id,
                        "exercise_name": tex["exercise_name"],
                        "sets": tex["sets"],
                        "order_index": tex.get("order_index", 0),
                        "unilateral": tex.get("unilateral", False),
                        "resistance_profile": tex.get("resistance_profile"),
                    }
                    supabase.table("session_template_exercises").insert(ste_insert).execute()

                # Schedule a program session
                ps_insert = {
                    "program_id": program_id,
                    "micro_id": micro_id,
                    "date": session_date.isoformat(),
                    "template_id": new_template_id,
                    "custom_name": tsess["name"],
                    "status": "planned",
                }
                supabase.table("program_sessions").insert(ps_insert).execute()

        return {"meso_id": meso_id}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply meso template: {str(e)}")
