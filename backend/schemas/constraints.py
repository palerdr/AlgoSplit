"""Shared public constraints for split persistence and analysis."""

MIN_CYCLE_DAYS = 1
MAX_CYCLE_DAYS = 14
MIN_STIMULUS_DURATION = 24
MAX_STIMULUS_DURATION = 96
MIN_MAINTENANCE_VOLUME = 1
MAX_MAINTENANCE_VOLUME = 9


def validate_session_days(sessions, cycle_length: int | None, day_attribute: str) -> None:
    if cycle_length is None:
        return
    invalid = [getattr(session, day_attribute) for session in sessions if getattr(session, day_attribute) > cycle_length]
    if invalid:
        raise ValueError(
            f"Session day {min(invalid)} exceeds explicit cycle_length {cycle_length}"
        )
