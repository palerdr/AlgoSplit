import copy
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("AUTH_EXPOSE_ACCESS_TOKEN", "true")


from api.dependencies import AuthUser, get_current_user
import api.routes.auth as auth_routes
import api.routes.splits as splits_routes
from main import app, rate_limiter


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class FakeResult:
    def __init__(self, data: Any, count: int | None = None):
        self.data = data
        self.count = count


class FakeRpcError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class FakeRpcQuery:
    def __init__(self, client: "FakeSupabaseClient", function_name: str, params: dict[str, Any]):
        self.client = client
        self.function_name = function_name
        self.params = params

    def execute(self) -> FakeResult:
        return FakeResult(self.client.execute_rpc(self.function_name, self.params))


class FakeAuthResponse:
    def __init__(self, user_id: str, email: str, token: str):
        self.user = type("User", (), {"id": user_id, "email": email})()
        self.session = type(
            "Session",
            (),
            {"access_token": token, "refresh_token": f"refresh-{token}", "expires_in": 3600},
        )()


class FakeSupabaseAuth:
    def __init__(self):
        self.raise_on_signup: Exception | None = None
        self.raise_on_login: Exception | None = None
        self.sign_out_called = False
        self._users: dict[str, dict[str, str]] = {}

    def sign_up(self, payload: dict[str, str]) -> FakeAuthResponse:
        if self.raise_on_signup:
            raise self.raise_on_signup
        email = payload["email"].lower()
        if email in self._users:
            raise Exception("already registered")
        user_id = f"user-{len(self._users) + 1}"
        self._users[email] = {
            "id": user_id,
            "email": email,
            "password": payload["password"],
        }
        return FakeAuthResponse(user_id=user_id, email=email, token=f"token-{user_id}")

    def sign_in_with_password(self, payload: dict[str, str]) -> FakeAuthResponse:
        if self.raise_on_login:
            raise self.raise_on_login
        email = payload["email"].lower()
        user = self._users.get(email)
        if not user or user["password"] != payload["password"]:
            raise Exception("invalid credentials")
        return FakeAuthResponse(user_id=user["id"], email=user["email"], token=f"token-{user['id']}")

    def refresh_session(self, refresh_token: str) -> FakeAuthResponse:
        # Accept any refresh token in tests and return a new session
        return FakeAuthResponse(user_id="user-refreshed", email="refreshed@example.com", token="token-refreshed")

    def sign_out(self) -> None:
        self.sign_out_called = True


class FakeTableQuery:
    def __init__(self, client: "FakeSupabaseClient", table_name: str):
        self.client = client
        self.table_name = table_name
        self._op = "select"
        self._select_fields: str | None = "*"
        self._count_mode: str | None = None
        self._insert_rows: list[dict[str, Any]] | None = None
        self._update_row: dict[str, Any] | None = None
        self._filters: list[tuple[str, str, Any]] = []
        self._order_by: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._range_start: int | None = None
        self._range_end: int | None = None

    def select(self, fields: str = "*", count: str | None = None) -> "FakeTableQuery":
        self._op = "select"
        self._select_fields = fields
        self._count_mode = count
        return self

    def insert(self, rows: dict[str, Any] | list[dict[str, Any]]) -> "FakeTableQuery":
        self._op = "insert"
        if isinstance(rows, dict):
            rows = [rows]
        self._insert_rows = [copy.deepcopy(row) for row in rows]
        return self

    def update(self, row: dict[str, Any]) -> "FakeTableQuery":
        self._op = "update"
        self._update_row = copy.deepcopy(row)
        return self

    def delete(self) -> "FakeTableQuery":
        self._op = "delete"
        return self

    def eq(self, column: str, value: Any) -> "FakeTableQuery":
        self._filters.append(("eq", column, value))
        return self

    def in_(self, column: str, values: list[Any]) -> "FakeTableQuery":
        self._filters.append(("in", column, values))
        return self

    def gte(self, column: str, value: Any) -> "FakeTableQuery":
        self._filters.append(("gte", column, value))
        return self

    def lte(self, column: str, value: Any) -> "FakeTableQuery":
        self._filters.append(("lte", column, value))
        return self

    def order(self, column: str, desc: bool = False) -> "FakeTableQuery":
        self._order_by = (column, desc)
        return self

    def limit(self, value: int) -> "FakeTableQuery":
        self._limit = value
        return self

    def range(self, start: int, end: int) -> "FakeTableQuery":
        self._range_start = start
        self._range_end = end
        return self

    def execute(self) -> FakeResult:
        if self._op == "insert":
            return FakeResult(self._execute_insert())
        if self._op == "update":
            return FakeResult(self._execute_update())
        if self._op == "delete":
            return FakeResult(self._execute_delete())
        rows, count = self._execute_select()
        return FakeResult(rows, count=count)

    def _match_filters(self, row: dict[str, Any]) -> bool:
        for op, column, value in self._filters:
            row_value = row.get(column)
            if op == "eq" and row_value != value:
                return False
            if op == "in" and row_value not in value:
                return False
            if op == "gte" and row_value < value:
                return False
            if op == "lte" and row_value > value:
                return False
        return True

    def _sort_and_limit(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        data = rows
        if self._order_by:
            column, desc = self._order_by
            data = sorted(data, key=lambda row: row.get(column), reverse=desc)
        if self._range_start is not None and self._range_end is not None:
            data = data[self._range_start : self._range_end + 1]
        if self._limit is not None:
            data = data[: self._limit]
        return data

    def _execute_select(self) -> tuple[list[dict[str, Any]], int | None]:
        matched_rows = [
            copy.deepcopy(row)
            for row in self.client.tables[self.table_name]
            if self._match_filters(row)
        ]
        count = len(matched_rows) if self._count_mode == "exact" else None
        rows = self._sort_and_limit(matched_rows)

        if self.table_name == "splits" and self._select_fields and "sessions(" in self._select_fields:
            for split in rows:
                sessions = [
                    copy.deepcopy(session)
                    for session in self.client.tables["sessions"]
                    if session["split_id"] == split["id"]
                ]
                sessions = sorted(sessions, key=lambda session: session["day_number"])
                if "exercises(" in self._select_fields:
                    for session in sessions:
                        exercises = [
                            copy.deepcopy(ex)
                            for ex in self.client.tables["exercises"]
                            if ex["session_id"] == session["id"]
                        ]
                        exercises = sorted(exercises, key=lambda ex: ex["order_index"])
                        session["exercises"] = exercises
                split["sessions"] = sessions

        return rows, count

    def _execute_insert(self) -> list[dict[str, Any]]:
        if self._insert_rows is None:
            return []

        inserted = []
        for row in self._insert_rows:
            new_row = copy.deepcopy(row)
            new_row.setdefault("id", self.client.next_id(self.table_name))
            now = _utc_now_iso()

            if self.table_name in {"splits", "sessions", "workout_logs"}:
                new_row.setdefault("created_at", now)
            if self.table_name in {"splits", "sessions"}:
                new_row.setdefault("updated_at", now)
            elif self.table_name in {"exercises", "workout_exercises"}:
                new_row.setdefault("created_at", now)

            if self.table_name == "splits":
                new_row.setdefault("cycle_length", None)

            self.client.tables[self.table_name].append(new_row)
            inserted.append(copy.deepcopy(new_row))
        return inserted

    def _execute_update(self) -> list[dict[str, Any]]:
        if self._update_row is None:
            return []

        updated: list[dict[str, Any]] = []
        now = _utc_now_iso()
        for row in self.client.tables[self.table_name]:
            if not self._match_filters(row):
                continue
            row.update(copy.deepcopy(self._update_row))
            if self.table_name in {"splits", "sessions"}:
                row["updated_at"] = now
            updated.append(copy.deepcopy(row))
        return updated

    def _execute_delete(self) -> list[dict[str, Any]]:
        deleted = [copy.deepcopy(row) for row in self.client.tables[self.table_name] if self._match_filters(row)]
        if not deleted:
            return []

        kept = [row for row in self.client.tables[self.table_name] if not self._match_filters(row)]
        self.client.tables[self.table_name] = kept

        if self.table_name == "splits":
            split_ids = {row["id"] for row in deleted}
            sessions_to_delete = [s for s in self.client.tables["sessions"] if s["split_id"] in split_ids]
            session_ids = {s["id"] for s in sessions_to_delete}
            self.client.tables["sessions"] = [s for s in self.client.tables["sessions"] if s["id"] not in session_ids]
            self.client.tables["exercises"] = [
                ex for ex in self.client.tables["exercises"] if ex["session_id"] not in session_ids
            ]
        elif self.table_name == "sessions":
            session_ids = {row["id"] for row in deleted}
            self.client.tables["exercises"] = [
                ex for ex in self.client.tables["exercises"] if ex["session_id"] not in session_ids
            ]
        elif self.table_name == "workout_logs":
            workout_ids = {row["id"] for row in deleted}
            self.client.tables["workout_exercises"] = [
                ex for ex in self.client.tables["workout_exercises"] if ex["workout_log_id"] not in workout_ids
            ]
        return deleted


class FakeSupabaseClient:
    def __init__(self):
        self.auth = FakeSupabaseAuth()
        self.postgrest = type("Postgrest", (), {"headers": {}})()
        self.tables: dict[str, list[dict[str, Any]]] = {
            "splits": [],
            "sessions": [],
            "exercises": [],
            "workout_logs": [],
            "workout_exercises": [],
            "session_templates": [],
            "session_template_exercises": [],
            "program_sessions": [],
            "program_session_exercises": [],
        }
        self._ids: dict[str, int] = {name: 0 for name in self.tables}

    def next_id(self, table_name: str) -> str:
        self._ids[table_name] += 1
        return f"{table_name.rstrip('s')}-{self._ids[table_name]}"

    def table(self, table_name: str) -> FakeTableQuery:
        if table_name not in self.tables:
            self.tables[table_name] = []
            self._ids[table_name] = 0
        return FakeTableQuery(self, table_name)

    def rpc(self, function_name: str, params: dict[str, Any]) -> FakeRpcQuery:
        return FakeRpcQuery(self, function_name, params)

    def _session_payload(self, session: dict[str, Any]) -> dict[str, Any]:
        payload = copy.deepcopy(session)
        payload["exercises"] = sorted(
            [
                copy.deepcopy(exercise)
                for exercise in self.tables["exercises"]
                if exercise["session_id"] == session["id"]
            ],
            key=lambda exercise: exercise["order_index"],
        )
        return payload

    def execute_rpc(self, function_name: str, params: dict[str, Any]):
        if function_name == "save_split_session":
            split_id = params["p_split_id"]
            if not any(split["id"] == split_id for split in self.tables["splits"]):
                raise FakeRpcError("P0002", "split_not_found")
            session_id = params.get("p_session_id")
            day_number = params["p_day_number"]
            if any(
                session["split_id"] == split_id
                and session["day_number"] == day_number
                and session["id"] != session_id
                for session in self.tables["sessions"]
            ):
                raise FakeRpcError("23505", "duplicate key")
            now = _utc_now_iso()
            if session_id is None:
                session = {
                    "id": self.next_id("sessions"),
                    "split_id": split_id,
                    "name": params["p_name"],
                    "day_number": day_number,
                    "created_at": now,
                    "updated_at": now,
                }
                self.tables["sessions"].append(session)
            else:
                session = next(
                    (
                        row for row in self.tables["sessions"]
                        if row["id"] == session_id and row["split_id"] == split_id
                    ),
                    None,
                )
                if session is None:
                    raise FakeRpcError("P0002", "session_not_found")
                session.update(
                    name=params["p_name"],
                    day_number=day_number,
                    updated_at=now,
                )
                self.tables["exercises"] = [
                    exercise for exercise in self.tables["exercises"]
                    if exercise["session_id"] != session_id
                ]
            for index, exercise in enumerate(params.get("p_exercises") or []):
                self.tables["exercises"].append(
                    {
                        "id": self.next_id("exercises"),
                        "session_id": session["id"],
                        "exercise_name": exercise["name"],
                        "sets": exercise["sets"],
                        "order_index": index,
                        "unilateral": exercise.get("unilateral", False),
                        "resistance_profile": exercise.get("resistance_profile"),
                        "created_at": now,
                    }
                )
            return self._session_payload(session)

        if function_name == "replace_split_full":
            split = next(
                (row for row in self.tables["splits"] if row["id"] == params["p_split_id"]),
                None,
            )
            if split is None:
                raise FakeRpcError("P0002", "split_not_found")
            payload = params["p_split"]
            split.update(
                name=payload["name"],
                cycle_length=payload.get("cycle_length"),
                stimulus_duration=payload["stimulus_duration"],
                maintenance_volume=payload["maintenance_volume"],
                dataset=payload["dataset"],
                updated_at=_utc_now_iso(),
            )
            old_ids = {
                session["id"] for session in self.tables["sessions"]
                if session["split_id"] == split["id"]
            }
            self.tables["sessions"] = [
                session for session in self.tables["sessions"]
                if session["id"] not in old_ids
            ]
            self.tables["exercises"] = [
                exercise for exercise in self.tables["exercises"]
                if exercise["session_id"] not in old_ids
            ]
            for session_payload in payload["sessions"]:
                self.execute_rpc(
                    "save_split_session",
                    {
                        "p_split_id": split["id"],
                        "p_session_id": None,
                        "p_name": session_payload["name"],
                        "p_day_number": session_payload["day_number"],
                        "p_exercises": session_payload.get("exercises", []),
                    },
                )
            response = copy.deepcopy(split)
            response["sessions"] = sorted(
                [
                    self._session_payload(session)
                    for session in self.tables["sessions"]
                    if session["split_id"] == split["id"]
                ],
                key=lambda session: session["day_number"],
            )
            return response

        raise FakeRpcError("PGRST202", f"Unknown RPC {function_name}")


@pytest.fixture
def fake_supabase() -> FakeSupabaseClient:
    return FakeSupabaseClient()


@pytest.fixture
def auth_user() -> AuthUser:
    return AuthUser(user_id="user-123", email="tester@example.com", access_token="token-user-123")


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, fake_supabase: FakeSupabaseClient, auth_user: AuthUser):
    monkeypatch.setattr(auth_routes, "get_supabase_client", lambda: fake_supabase)
    monkeypatch.setattr(auth_routes, "get_supabase_client_with_token", lambda _token: fake_supabase)
    monkeypatch.setattr(splits_routes, "get_supabase_client_with_token", lambda _token: fake_supabase)
    monkeypatch.setattr(
        splits_routes,
        "move_match_with_overrides",
        lambda _name, _user_id=None: type("Movement", (), {"name": "mock_pattern"})(),
    )

    app.dependency_overrides[get_current_user] = lambda: auth_user
    rate_limiter.enabled = False

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
