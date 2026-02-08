"""
Periodization routes - macro/meso/micro cycle management
"""

from fastapi import APIRouter, HTTPException, Depends, status
from db.supabase import get_supabase_client_with_token
from schemas.periodization import (
    MacroCycleCreate, MacroCycleUpdate, MacroCycleResponse, MacroCycleListResponse,
    MesoCycleCreate, MesoCycleUpdate, MesoCycleResponse, MesoCycleListResponse,
    MicroCycleCreate, MicroCycleUpdate, MicroCycleResponse, MicroCycleListResponse,
    AssignSessionsRequest,
)
from api.dependencies import get_current_user, AuthUser

router = APIRouter(prefix="/api/programs/{program_id}/periodization", tags=["Periodization"])


# ============================================================================
# Helpers
# ============================================================================

def build_micro_response(m: dict) -> MicroCycleResponse:
    # Extract session IDs from linked program_sessions
    sessions = m.get("program_sessions", []) or []
    session_ids = [s["id"] for s in sessions] if sessions else []
    return MicroCycleResponse(
        id=m["id"], meso_id=m["meso_id"], week_index=m["week_index"],
        start_date=m.get("start_date"), end_date=m.get("end_date"),
        deload=m.get("deload", False), notes=m.get("notes"),
        session_ids=session_ids,
        created_at=m["created_at"], updated_at=m["updated_at"],
    )

def build_meso_response(me: dict) -> MesoCycleResponse:
    micros = [build_micro_response(mi) for mi in sorted(me.get("program_micros", []) or [], key=lambda x: x.get("week_index", 0))]
    return MesoCycleResponse(
        id=me["id"], macro_id=me["macro_id"], name=me["name"],
        focus=me.get("focus"), order_index=me.get("order_index", 0),
        start_date=me.get("start_date"), end_date=me.get("end_date"),
        progression_type=me.get("progression_type", "linear"),
        notes=me.get("notes"), micros=micros,
        created_at=me["created_at"], updated_at=me["updated_at"],
    )

def build_macro_response(ma: dict) -> MacroCycleResponse:
    mesos = [build_meso_response(me) for me in sorted(ma.get("program_mesos", []) or [], key=lambda x: x.get("order_index", 0))]
    return MacroCycleResponse(
        id=ma["id"], program_id=ma["program_id"], name=ma["name"],
        order_index=ma.get("order_index", 0),
        start_date=ma.get("start_date"), end_date=ma.get("end_date"),
        notes=ma.get("notes"), mesos=mesos,
        created_at=ma["created_at"], updated_at=ma["updated_at"],
    )


# ============================================================================
# Macrocycle CRUD
# ============================================================================

@router.post("/macros", response_model=MacroCycleResponse, status_code=status.HTTP_201_CREATED)
async def create_macro(program_id: str, macro: MacroCycleCreate, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        prog = supabase.table("programs").select("id").eq("id", program_id).execute()
        if not prog.data:
            raise HTTPException(status_code=404, detail="Program not found")

        insert = {"program_id": program_id, "name": macro.name, "order_index": macro.order_index}
        if macro.start_date: insert["start_date"] = macro.start_date.isoformat()
        if macro.end_date: insert["end_date"] = macro.end_date.isoformat()
        if macro.notes: insert["notes"] = macro.notes

        result = supabase.table("program_macros").insert(insert).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create macrocycle")
        r = result.data[0]
        r["program_mesos"] = []
        return build_macro_response(r)
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create macrocycle: {str(e)}")


@router.get("/macros", response_model=MacroCycleListResponse)
async def list_macros(program_id: str, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("program_macros").select(
            "*, program_mesos(*, program_micros(*, program_sessions(id)))"
        ).eq("program_id", program_id).order("order_index").execute()

        macros = [build_macro_response(ma) for ma in (result.data or [])]
        return MacroCycleListResponse(macros=macros, total=len(macros))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list macrocycles: {str(e)}")


@router.put("/macros/{macro_id}", response_model=MacroCycleResponse)
async def update_macro(program_id: str, macro_id: str, update: MacroCycleUpdate, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        data = {}
        for f in ["name", "order_index", "notes"]:
            v = getattr(update, f, None)
            if v is not None: data[f] = v
        for f in ["start_date", "end_date"]:
            v = getattr(update, f, None)
            if v is not None: data[f] = v.isoformat()
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = supabase.table("program_macros").update(data).eq("id", macro_id).eq("program_id", program_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Macrocycle not found")

        full = supabase.table("program_macros").select("*, program_mesos(*, program_micros(*, program_sessions(id)))").eq("id", macro_id).execute()
        return build_macro_response(full.data[0])
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update macrocycle: {str(e)}")


@router.delete("/macros/{macro_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_macro(program_id: str, macro_id: str, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("program_macros").delete().eq("id", macro_id).eq("program_id", program_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Macrocycle not found")
        return None
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete macrocycle: {str(e)}")


# ============================================================================
# Mesocycle CRUD
# ============================================================================

@router.post("/macros/{macro_id}/mesos", response_model=MesoCycleResponse, status_code=status.HTTP_201_CREATED)
async def create_meso(program_id: str, macro_id: str, meso: MesoCycleCreate, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        insert = {"macro_id": macro_id, "name": meso.name, "order_index": meso.order_index, "progression_type": meso.progression_type}
        if meso.focus: insert["focus"] = meso.focus
        if meso.start_date: insert["start_date"] = meso.start_date.isoformat()
        if meso.end_date: insert["end_date"] = meso.end_date.isoformat()
        if meso.notes: insert["notes"] = meso.notes

        result = supabase.table("program_mesos").insert(insert).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create mesocycle")
        r = result.data[0]
        r["program_micros"] = []
        return build_meso_response(r)
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create mesocycle: {str(e)}")


@router.put("/mesos/{meso_id}", response_model=MesoCycleResponse)
async def update_meso(program_id: str, meso_id: str, update: MesoCycleUpdate, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        data = {}
        for f in ["name", "focus", "order_index", "progression_type", "notes"]:
            v = getattr(update, f, None)
            if v is not None: data[f] = v
        for f in ["start_date", "end_date"]:
            v = getattr(update, f, None)
            if v is not None: data[f] = v.isoformat()
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = supabase.table("program_mesos").update(data).eq("id", meso_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Mesocycle not found")
        full = supabase.table("program_mesos").select("*, program_micros(*, program_sessions(id))").eq("id", meso_id).execute()
        return build_meso_response(full.data[0])
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update mesocycle: {str(e)}")


@router.delete("/mesos/{meso_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meso(program_id: str, meso_id: str, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("program_mesos").delete().eq("id", meso_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Mesocycle not found")
        return None
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete mesocycle: {str(e)}")


# ============================================================================
# Microcycle CRUD
# ============================================================================

@router.post("/mesos/{meso_id}/micros", response_model=MicroCycleResponse, status_code=status.HTTP_201_CREATED)
async def create_micro(program_id: str, meso_id: str, micro: MicroCycleCreate, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        insert = {"meso_id": meso_id, "week_index": micro.week_index, "deload": micro.deload}
        if micro.start_date: insert["start_date"] = micro.start_date.isoformat()
        if micro.end_date: insert["end_date"] = micro.end_date.isoformat()
        if micro.notes: insert["notes"] = micro.notes

        result = supabase.table("program_micros").insert(insert).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create microcycle")
        r = result.data[0]
        r["program_sessions"] = []
        return build_micro_response(r)
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create microcycle: {str(e)}")


@router.put("/micros/{micro_id}", response_model=MicroCycleResponse)
async def update_micro(program_id: str, micro_id: str, update: MicroCycleUpdate, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        data = {}
        for f in ["week_index", "deload", "notes"]:
            v = getattr(update, f, None)
            if v is not None: data[f] = v
        for f in ["start_date", "end_date"]:
            v = getattr(update, f, None)
            if v is not None: data[f] = v.isoformat()
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = supabase.table("program_micros").update(data).eq("id", micro_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Microcycle not found")
        full = supabase.table("program_micros").select("*, program_sessions(id)").eq("id", micro_id).execute()
        return build_micro_response(full.data[0])
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update microcycle: {str(e)}")


@router.delete("/micros/{micro_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_micro(program_id: str, micro_id: str, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("program_micros").delete().eq("id", micro_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Microcycle not found")
        return None
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete microcycle: {str(e)}")


# ============================================================================
# Session Assignment
# ============================================================================

@router.put("/micros/{micro_id}/assign-sessions", response_model=MicroCycleResponse)
async def assign_sessions(program_id: str, micro_id: str, body: AssignSessionsRequest, current_user: AuthUser = Depends(get_current_user)):
    """Assign program sessions to a microcycle"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Verify micro exists
        micro = supabase.table("program_micros").select("id").eq("id", micro_id).execute()
        if not micro.data:
            raise HTTPException(status_code=404, detail="Microcycle not found")

        # Update each session's micro_id
        for sid in body.session_ids:
            supabase.table("program_sessions").update({"micro_id": micro_id}).eq("id", sid).eq("program_id", program_id).execute()

        # Return updated micro
        full = supabase.table("program_micros").select("*, program_sessions(id)").eq("id", micro_id).execute()
        return build_micro_response(full.data[0])
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to assign sessions: {str(e)}")
