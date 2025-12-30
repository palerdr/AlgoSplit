from collections import defaultdict
import bisect


# -----------------------
# Global constants
# -----------------------

# Schoenfeld cumulative curve (total cumulative stimulus per set index).
# We use this to compute incremental stimulus for each set: incremental = cum[n] - cum[n-1]
SCHOENFELD_CUMULATIVE = [1.00, 1.39, 1.61, 1.77, 1.90, 2.00, 2.09, 2.16, 2.23]

# Damage multipliers for resistance profile (used when computing damage/recovery burden)
RES_PROFILE_DAMAGE_MULT = {
    "lengthened": 1.20,
    "mid": 1.00,
    "shortened": 0.80
}

# Rep-range damage multiplier (higher rep ranges tend to cause more metabolic and structural damage)
# defined as ranges (inclusive)
REP_DAMAGE_BUCKETS = {
    (1, 5): 0.8,    # low reps -> lower structural damage
    (6, 8): 1.0,    # moderate
    (9, 15): 1.2,   # high
    (16, 100): 1.5  # very high
}

# Base damage-sensitivity for muscle damage_bucket:
# NOTE: "neutral" is treated as 0 baseline (you requested neutral be "0 value" base),
# which means damage arises from exercise factors primarily.
DAMAGE_BUCKET_BASE = {
    "easily": 1.0,     # muscle accumulates damage easily
    "neutral": 0.0,    # no baseline damage; damage comes from exercise specifics
    "not_easily": -0.3 # protected; may even reduce damage accumulation tendency (clamped later)
}

# Leverage match stimulus multiplier: best leverage -> 1.0, mismatch -> 0.8 (you preferred gentler penalty)
LEVERAGE_MATCH = {
    True: 1.0,
    False: 0.8
}

# Unilateral set modifiers:
UNILATERAL_STIMULUS_BOOST = 1.05   # small boost to stimulus due to motor unit recruitment
UNILATERAL_CNS_EQUIVALENT = 0.5    # each unilateral set contributes 0.5 to session CNS counter
BILATERAL_CNS_EQUIVALENT = 1.0     # bilateral set contributes 1.0

# RIR (proximity to failure) effect constants (subtle)
# - Stimulus proximity factor: reduces stimulus slightly with RIR (but effective reps already captures most)
# - Damage proximity factor: reduces damage more strongly with more RIR
def proximity_factor_stim(rir):
    """Small reduction in per-set stimulus for positive RIR. clamp floor to 0.6"""
    return max(0.6, 1.0 - 0.08 * rir)

def proximity_factor_damage(rir):
    """Larger reduction in damage for higher RIR. clamp floor to 0.4"""
    return max(0.4, 1.0 - 0.15 * rir)


# Atrophy table (from your Schoenfeld-derived values).
# Interpolate between these points to compute an atrophy fraction based on hours since last MYOPS.
# Interpretation: atrophy_fraction(hours) returns proportion [0..1] of accumulated stimulus that is lost
# when computing net weekly stimulus if the muscle hasn't had elevated MPS by that time.
_ATROPHY_POINTS = [(12, 0.25), (24, 0.27), (36, 0.29), (48, 0.32), (60, 0.36), (72, 0.40)]
_ATROPHY_HOURS = [p[0] for p in _ATROPHY_POINTS]
_ATROPHY_VALS  = [p[1] for p in _ATROPHY_POINTS]

def atrophy_fraction(hours_since_last_myops):
    """Linear interpolate the atrophy fraction given the table above.
       If hours < min -> return first val; if > max -> return last val.
       Returns fraction in [0, 1]."""
    if hours_since_last_myops <= _ATROPHY_HOURS[0]:
        return _ATROPHY_VALS[0]
    if hours_since_last_myops >= _ATROPHY_HOURS[-1]:
        return _ATROPHY_VALS[-1]
    # find interval
    i = bisect.bisect_right(_ATROPHY_HOURS, hours_since_last_myops) - 1
    h0, v0 = _ATROPHY_POINTS[i]
    h1, v1 = _ATROPHY_POINTS[i+1]
    # linear interp
    t = (hours_since_last_myops - h0) / (h1 - h0)
    return v0 + t * (v1 - v0)


# -----------------------
# Core model classes
# -----------------------

class Muscle:
    def __init__(self, name, best_leverage, damage_bucket, smh_benefit):
        """
        best_leverage: 'lengthened' | 'shortened' | 'neutral'
        damage_bucket: 'easily' | 'neutral' | 'not_easily'
        smh_benefit: bool (True if stretch-mediated hypertrophy applies)
        """
        self.name = name
        self.best_leverage = best_leverage
        self.damage_bucket = damage_bucket
        self.smh_benefit = smh_benefit

        # Training state (week-accumulated)
        self.total_stimulus = 0.0   # accumulated Schoenfeld-scaled stimulus (before atrophy)
        self.total_sets = 0         # number of sets applied (for incremental indexing)
        self.effective_sets = 0.0   # sum(effective_reps / 5)
        self.damage = 0.0           # accumulated damage units (post-session recovery burden)
        self.last_myops_time = -9999.0  # last time (hours) we produced MYOPS (stimulus)
        # some bookkeeping
        self.history = []  # appended tuples for debugging: (time, stimulus, damage_added, effective_reps)

    def apply_set(self, stimulus_added, damage_added, effective_reps, current_time):
        """Apply the set's computed stimulus & damage to the muscle and update last MYOPS time."""
        self.total_stimulus += stimulus_added
        self.total_sets += 1
        self.effective_sets += (effective_reps / 5.0)
        self.damage += damage_added
        # we define "MYOPS elevation" to happen whenever a set produces stimulus > 0
        if stimulus_added > 0:
            self.last_myops_time = current_time
        self.history.append((current_time, stimulus_added, damage_added, effective_reps))

    def recovery_window_hours(self):
        """Estimate a recovery window in hours.
           Base = 48 hours × sensitivity multiplier (from damage_bucket).
           Then scale a little with accumulated damage so extra damage extends recovery."""
        base_mult = {"easily": 1.25, "neutral": 1.0, "not_easily": 0.75}[self.damage_bucket]
        # scale recovery mildly with damage (damage is unitless; 0 => no extra extension)
        # this keeps recovery anchored to 48h as you requested.
        return 48.0 * base_mult * (1.0 + 0.2 * max(0.0, self.damage))

    def net_stimulus_after_atrophy(self, current_time):
        """Return net stimulus after applying atrophy depending on time since last MYOPS.
           We use atrophy_fraction(hours) derived from the table you provided."""
        hours_since = current_time - self.last_myops_time
        frac = atrophy_fraction(max(0.0, hours_since))
        # net = total_stimulus reduced by the fraction
        net = self.total_stimulus * (1.0 - frac)
        return max(0.0, net)

    def reset_week(self):
        """Reset weekly accumulators (but keep persistent properties)."""
        self.total_stimulus = 0.0
        self.total_sets = 0
        self.effective_sets = 0.0
        self.damage = 0.0
        self.last_myops_time = -9999.0
        self.history.clear()


class ExerciseSet:
    def __init__(self, target_muscles, reps, rir, resistance_profile="mid",
                 leverage_emphasis="mid", unilateral=False, sets=1, smh_override=None):
        """
        target_muscles: list of Muscle objects (one or more)
        reps: performed reps in the set (int)
        rir: reps in reserve at the end of the set (int)
        resistance_profile: 'lengthened' | 'mid' | 'shortened'  (affects damage)
        leverage_emphasis: where the exercise loads the target muscle most:
           'lengthened' | 'mid' | 'shortened'  (used to compare to each muscle.best_leverage)
        unilateral: bool (if True counts as unilateral)
        sets: integer number of set repetitions of this same set profile
        smh_override: None | True | False  (if provided overrides muscle.smh_benefit for this set)
        """
        self.target_muscles = target_muscles if isinstance(target_muscles, (list, tuple)) else [target_muscles]
        self.reps = int(reps)
        self.rir = int(rir)
        self.resistance_profile = resistance_profile
        self.leverage_emphasis = leverage_emphasis
        self.unilateral = unilateral
        self.sets = int(sets)
        self.smh_override = smh_override

    # --- Effective reps logic (only last ~5 reps to failure) ---
    def compute_effective_reps_for_set(self):
        """
        Effective reps formula:
        - true_failure_reps = performed reps + RIR
        - stimulating_zone_start = max(0, true_failure_reps - 5)
        - effective_reps = max(0, performed_reps - stimulating_zone_start)
        Example: 13 reps, 2 RIR -> true_failure=15 -> stimulating_zone_start=10 -> effective=13-10=3
        """
        true_failure_reps = self.reps + self.rir
        stimulating_zone_start = max(0, true_failure_reps - 5)
        effective_reps = max(0, self.reps - stimulating_zone_start)
        return effective_reps

    # --- Helper: rep-range bucket (for damage) ---
    def rep_range_bucket(self):
        r = self.reps
        for (low, high), mult in REP_DAMAGE_BUCKETS.items():
            if low <= r <= high:
                return (low, high, mult)
        return (16, 100, 1.5)  # fallback

    # --- Core: apply this set (or sets) to all target muscles, returns per-muscle summaries ---
    def apply(self, current_time, session):
        """
        Apply self.sets identical sets sequentially.
        session: WorkoutSession instance (used to update CNS fatigue)
        For each muscle, we compute:
          - incremental stimulus (Schoenfeld incremental * effective_sets)
          - apply leverage multiplier (1.0 if match else 0.8)
          - unilateral boost to stimulus
          - proximity factor (RIR) slightly reduces stimulus
          - session CNS reduces effective stimulus further (session-level)
          - damage computed from: muscle damage_bucket base + resistance_profile + rep-range + RIR
        Returns: dict muscle_name -> dict with keys: stimulus_applied, damage_added, effective_reps_total
        """
        out = {}
        eff_reps = self.compute_effective_reps_for_set()
        # treat sets sequentially to properly apply Schoenfeld indexing per muscle
        for s in range(self.sets):
            # increment session CNS using set type
            session.cns_fatigue += (UNILATERAL_CNS_EQUIVALENT if not self.unilateral else UNILATERAL_CNS_EQUIVALENT)
            # Note: we increment by same value for bilateral/unilateral here; we previously set bilateral=1.0, unilateral=0.5
            # To preserve gentle fatigue while having unilateral be less impactful, we'll use:
            # +1.0 for bilateral sets, +0.5 for unilateral sets (update below before computing per-muscle reduction)
            # (we adjust session.cns_fatigue properly below)
            if not self.unilateral:
                session.cns_fatigue -= UNILATERAL_CNS_EQUIVALENT  # undo earlier placeholder
                session.cns_fatigue += BILATERAL_CNS_EQUIVALENT
            else:
                session.cns_fatigue -= UNILATERAL_CNS_EQUIVALENT  # undo earlier placeholder
                session.cns_fatigue += UNILATERAL_CNS_EQUIVALENT

            for m in self.target_muscles:
                # ----- incremental stimulus from Schoenfeld (diminishing marginal returns) -----
                set_index = m.total_sets  # zero-based index for existing sets already applied to this muscle
                if set_index >= len(SCHOENFELD_CUMULATIVE):
                    incremental = 0.01  # minimal beyond known curve
                else:
                    prev_cum = SCHOENFELD_CUMULATIVE[set_index - 1] if set_index > 0 else 0.0
                    incremental = SCHOENFELD_CUMULATIVE[set_index] - prev_cum
                    # incremental is the marginal value for this new set (if taken to full effective set)

                # Effective sets fraction from effective_reps (1 effective set = 5 reps)
                effective_sets_fraction = (eff_reps / 5.0)

                # Base stimulus for this set (before session/CNS reduction, but after Schoenfeld)
                stim_from_schoenfeld = incremental * effective_sets_fraction
                # Leverage match multiplier
                leverage_ok = (m.best_leverage == self.leverage_emphasis)
                stim = stim_from_schoenfeld * LEVERAGE_MATCH[leverage_ok]

                # SMH small bonus if muscle benefits and this set challenges it in lengthened position
                smh_active = m.smh_benefit if self.smh_override is None else self.smh_override
                if smh_active and self.leverage_emphasis == "lengthened":
                    stim *= 1.08  # small +8%

                # Unilateral tiny boost (motor unit recruitment)
                if self.unilateral:
                    stim *= UNILATERAL_STIMULUS_BOOST

                # RIR proximity factor reduces stimulus modestly
                stim *= proximity_factor_stim(self.rir)

                # Session-level CNS fatigue reduction (gentle linear)
                # Using 1% reduction per CNS unit (gentle); clamp floor at 0.6
                session_reduction = max(0.6, 1.0 - 0.01 * session.cns_fatigue)
                effective_stimulus = stim * session_reduction

                # ----- Damage calculation (post-session recovery burden) -----
                # Start with muscle's base damage bucket
                base = DAMAGE_BUCKET_BASE.get(m.damage_bucket, 0.0)

                # Add resistance profile damage contribution (lengthened highest)
                res_mult = RES_PROFILE_DAMAGE_MULT.get(self.resistance_profile, 1.0)
                # Add rep-range multiplier (we use the multiplier from REP_DAMAGE_BUCKETS)
                _, _, rep_mult = self.rep_range_bucket()

                # Combine factors: (base + res_offset) * rep_mult * proximity_factor_damage * effective_sets_fraction
                # We'll convert RES_PROFILE_DAMAGE_MULT -> offset by subtracting 1.0 so that 'mid' adds 0.0,
                # 'lengthened' adds +0.2, 'shortened' adds -0.2 relative to mid baseline.
                res_offset = (res_mult - 1.0)  # e.g., 1.2 -> +0.2
                raw_damage = (base + res_offset) * rep_mult

                # RIR reduces damage strongly
                raw_damage *= proximity_factor_damage(self.rir)

                # Scale damage with effective_sets_fraction (more effective reps => more structural damage)
                damage_added = max(0.0, raw_damage * effective_sets_fraction)

                # Save & apply to muscle
                m.apply_set(effective_stimulus, damage_added, eff_reps, current_time)

                # Bookkeeping for output
                out.setdefault(m.name, {"stimulus": 0.0, "damage": 0.0, "effective_reps": 0})
                out[m.name]["stimulus"] += effective_stimulus
                out[m.name]["damage"] += damage_added
                out[m.name]["effective_reps"] += eff_reps

        return out


class WorkoutSession:
    def __init__(self, session_time_hours):
        """
        session_time_hours: hour index for timestamping (e.g., 0 = week start; 24 = next day)
        """
        self.time = float(session_time_hours)
        self.sets = []  # list of ExerciseSet
        self.cns_fatigue = 0.0  # session-level CNS counter (gentle linear accumulation)

    def add_set(self, exercise_set: ExerciseSet):
        self.sets.append(exercise_set)

    def run(self):
        """
        Run all sets in order. Returns per-muscle aggregated dict for this session.
        """
        session_summary = {}
        for ex in self.sets:
            out = ex.apply(self.time, self)
            # merge out into session_summary
            for mn, v in out.items():
                if mn not in session_summary:
                    session_summary[mn] = {"stimulus": 0.0, "damage": 0.0, "effective_reps": 0}
                session_summary[mn]["stimulus"] += v["stimulus"]
                session_summary[mn]["damage"] += v["damage"]
                session_summary[mn]["effective_reps"] += v["effective_reps"]
        return session_summary


class WeeklyAggregator:
    def __init__(self, muscles_dict):
        """
        muscles_dict: mapping name -> Muscle (pre-created)
        """
        self.muscles = muscles_dict
        self.sessions = []

    def add_session(self, session: WorkoutSession):
        self.sessions.append(session)

    def run_week(self, current_time_hours):
        """
        Runs all sessions (they should have already been run and applied to muscles),
        then compute net weekly stimulus per muscle after atrophy.
        Returns dict muscle_name -> {total_stimulus, damage, net_after_atrophy}
        """
        # run sessions if not already applied (they call apply which updates muscles)
        for ses in self.sessions:
            ses.run()

        results = {}
        for name, m in self.muscles.items():
            total = m.total_stimulus
            damage = m.damage
            net = m.net_stimulus_after_atrophy(current_time_hours)
            results[name] = {"total_stimulus": total, "damage": damage, "net_after_atrophy": net}
        return results

    def reset_week(self):
        for m in self.muscles.values():
            m.reset_week()
        self.sessions = []


# -----------------------
# Preload your muscle chart (from your list)
# -----------------------
muscles = {
    "pecs":                Muscle("pecs", "neutral",    "easily",     True),
    "front_delt":          Muscle("front_delt",       "lengthened", "neutral",    False),
    "middle_delt":         Muscle("middle_delt",      "neutral",    "neutral",     False),
    "rear_delt":           Muscle("rear_delt",        "lengthened", "neutral",    True),
    "upper_back":          Muscle("upper_back",       "lengthened", "neutral",    True),
    "lats":                Muscle("lats",             "shortened",  "neutral",    False),
    "quads":               Muscle("quads",            "lengthened", "not_easily", True),
    "hamstrings":          Muscle("hamstrings",       "lengthened", "easily",     True),
    "calves":              Muscle("calves",           "lengthened", "not_easily", True),
    "abs":                 Muscle("abs",              "lengthened", "not_easily", False),
    "glutes":              Muscle("glutes",           "shortened",  "neutral",    True),
    "erectors":            Muscle("erectors",         "shortened",  "not_easily", False),
    "forearms":            Muscle("forearms",         "lengthened", "not_easily", False),
    "biceps":              Muscle("biceps",           "lengthened", "easily",     False),
    "triceps":             Muscle("triceps",          "shortened",  "easily",     False),
}



