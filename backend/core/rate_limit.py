"""
Rate limiting backends and request evaluator.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import logging
from threading import Lock
from time import time
from typing import Dict, List, Optional

from fastapi import Request

logger = logging.getLogger("splitai.rate_limit")

try:
    import redis.asyncio as redis
except Exception:  # pragma: no cover
    redis = None


@dataclass(frozen=True)
class RateLimitRule:
    prefixes: List[str]
    limit: int
    window: int
    scope: str = "ip"


@dataclass
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int


class InMemoryRateLimitBackend:
    def __init__(self, max_buckets: int = 50_000, cleanup_interval: int = 300):
        self._buckets: Dict[str, List[float]] = {}
        self._lock = Lock()
        self._last_cleanup = time()
        self._cleanup_interval = cleanup_interval
        self._max_buckets = max_buckets

    def _cleanup(self, now: float, max_window: int) -> None:
        stale_keys = [
            key for key, values in self._buckets.items()
            if not values or (now - values[-1]) > max_window
        ]
        for key in stale_keys:
            del self._buckets[key]
        self._last_cleanup = now

    async def hit(self, key: str, limit: int, window: int, max_window: int) -> RateLimitResult:
        now = time()
        with self._lock:
            if now - self._last_cleanup > self._cleanup_interval or len(self._buckets) > self._max_buckets:
                self._cleanup(now, max_window)

            bucket = self._buckets.get(key)
            if bucket is None and len(self._buckets) >= self._max_buckets:
                return RateLimitResult(
                    allowed=False,
                    limit=limit,
                    remaining=0,
                    retry_after=max(window, 1),
                )

            bucket = [ts for ts in (bucket or []) if now - ts < window]
            if len(bucket) >= limit:
                retry_after = max(1, int(window - (now - bucket[0])))
                self._buckets[key] = bucket
                return RateLimitResult(
                    allowed=False,
                    limit=limit,
                    remaining=0,
                    retry_after=retry_after,
                )

            bucket.append(now)
            self._buckets[key] = bucket
            return RateLimitResult(
                allowed=True,
                limit=limit,
                remaining=max(0, limit - len(bucket)),
                retry_after=0,
            )


class RedisRateLimitBackend:
    def __init__(self, redis_url: str, key_prefix: str = "splitai:ratelimit"):
        if redis is None:
            raise RuntimeError("redis package is not installed")
        self._redis = redis.from_url(redis_url, decode_responses=True)
        self._key_prefix = key_prefix

    async def hit(self, key: str, limit: int, window: int, _: int) -> RateLimitResult:
        redis_key = f"{self._key_prefix}:{key}"
        count = await self._redis.incr(redis_key)
        if count == 1:
            await self._redis.expire(redis_key, window)
        ttl = await self._redis.ttl(redis_key)
        retry_after = max(1, ttl if ttl and ttl > 0 else window)
        allowed = count <= limit
        remaining = max(0, limit - count)
        return RateLimitResult(
            allowed=allowed,
            limit=limit,
            remaining=remaining,
            retry_after=0 if allowed else retry_after,
        )

    async def close(self) -> None:
        aclose = getattr(self._redis, "aclose", None)
        if aclose:
            await aclose()
            return
        await self._redis.close()


class RateLimiter:
    def __init__(
        self,
        rules: List[RateLimitRule],
        *,
        enabled: bool,
        trust_proxy: bool,
        token_cookie_name: str,
        redis_url: Optional[str],
        max_buckets: int = 50_000,
        cleanup_interval: int = 300,
    ):
        self._rules = rules
        self._enabled = enabled
        self._trust_proxy = trust_proxy
        self._token_cookie_name = token_cookie_name
        self._max_window = max((rule.window for rule in rules), default=60)

        self._in_memory_backend = InMemoryRateLimitBackend(
            max_buckets=max_buckets,
            cleanup_interval=cleanup_interval,
        )
        self._backend = self._in_memory_backend

        if redis_url:
            try:
                self._backend = RedisRateLimitBackend(redis_url)
                logger.info("Using Redis-backed rate limiting")
            except Exception as exc:
                logger.warning("Redis rate limiter unavailable, falling back to in-memory: %s", exc)

    def _get_client_ip(self, request: Request) -> str:
        if self._trust_proxy:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _resolve_subject_token(self, request: Request) -> Optional[str]:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            return auth.split(" ", 1)[1].strip()
        return request.cookies.get(self._token_cookie_name)

    def _bucket_key(self, request: Request, scope: str, rule_id: int) -> str:
        if scope == "user_or_ip":
            token = self._resolve_subject_token(request)
            if token:
                token_hash = sha256(token.encode("utf-8")).hexdigest()[:16]
                return f"user:{token_hash}:{rule_id}"
            return f"ip:{self._get_client_ip(request)}:{rule_id}"
        if scope == "ip":
            return f"ip:{self._get_client_ip(request)}:{rule_id}"
        return f"global:{rule_id}"

    async def check(self, request: Request) -> Optional[RateLimitResult]:
        if not self._enabled:
            return None

        path = request.url.path
        for idx, rule in enumerate(self._rules):
            if any(path.startswith(prefix) for prefix in rule.prefixes):
                key = self._bucket_key(request, rule.scope, idx)
                return await self._backend.hit(key, rule.limit, rule.window, self._max_window)
        return None

    async def close(self) -> None:
        close = getattr(self._backend, "close", None)
        if close:
            await close()
