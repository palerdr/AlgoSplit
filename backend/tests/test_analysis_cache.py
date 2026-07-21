import core.analysis_cache as analysis_cache


class FakeRedis:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def setex(self, key, _ttl, value):
        self.values[key] = value

    def incr(self, key):
        self.values[key] = str(int(self.values.get(key, "0")) + 1)


def test_distributed_generation_invalidates_prior_result(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(analysis_cache, "_redis_client", lambda: fake)
    params = {"days": 7, "dataset": "average"}

    analysis_cache.set_cached_analysis("user-1", params, '{"result":1}')
    assert analysis_cache.get_cached_analysis("user-1", params) == '{"result":1}'

    analysis_cache.invalidate_analysis_cache("user-1")

    assert analysis_cache.get_cached_analysis("user-1", params) is None


def test_missing_redis_computes_fresh(monkeypatch):
    monkeypatch.setattr(analysis_cache, "_redis_client", lambda: None)
    assert analysis_cache.get_cached_analysis("user-1", {}) is None
    analysis_cache.set_cached_analysis("user-1", {}, "payload")
    analysis_cache.invalidate_analysis_cache("user-1")
