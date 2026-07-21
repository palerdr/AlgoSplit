"""Distributed, correctness-first cache for workout-history analysis."""

from __future__ import annotations

import hashlib
import json
import logging
import os
from threading import Lock
from typing import Any, Optional

try:
    import redis
except ImportError:  # pragma: no cover
    redis = None

logger = logging.getLogger(__name__)
_client = None
_client_lock = Lock()
_TTL_SECONDS = int(os.getenv("ANALYSIS_CACHE_TTL_SECONDS", "600"))


def _redis_client():
    global _client
    redis_url = os.getenv("REDIS_URL")
    if not redis_url or redis is None:
        return None
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = redis.Redis.from_url(
                    redis_url, decode_responses=True,
                    socket_connect_timeout=1.0, socket_timeout=1.0,
                )
    return _client


def _generation_key(user_id: str) -> str:
    return f"algosplit:analysis:generation:{user_id}"


def _result_key(user_id: str, parameters: dict[str, Any], generation: str) -> str:
    canonical = json.dumps(parameters, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"algosplit:analysis:result:{user_id}:{generation}:{digest}"


def get_cached_analysis(user_id: str, parameters: dict[str, Any]) -> Optional[str]:
    client = _redis_client()
    if client is None:
        return None
    try:
        generation = client.get(_generation_key(user_id)) or "0"
        return client.get(_result_key(user_id, parameters, generation))
    except Exception:
        logger.warning("analysis_cache_read_failed", exc_info=True)
        return None


def set_cached_analysis(user_id: str, parameters: dict[str, Any], payload: str) -> None:
    client = _redis_client()
    if client is None:
        return
    try:
        generation = client.get(_generation_key(user_id)) or "0"
        client.setex(_result_key(user_id, parameters, generation), _TTL_SECONDS, payload)
    except Exception:
        logger.warning("analysis_cache_write_failed", exc_info=True)


def invalidate_analysis_cache(user_id: str) -> None:
    client = _redis_client()
    if client is None:
        return
    try:
        client.incr(_generation_key(user_id))
    except Exception:
        logger.warning("analysis_cache_invalidation_failed", exc_info=True)
