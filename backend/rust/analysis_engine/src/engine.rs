use crate::types::*;
use indexmap::IndexMap;
use std::collections::{BTreeMap, BTreeSet};
use thiserror::Error;

const SCHOENFELD: [f64; 9] = [1.00, 1.39, 1.61, 1.77, 1.90, 2.00, 2.09, 2.16, 2.23];
const PELLAND: [f64; 9] = [1.00, 1.89, 2.50, 3.07, 3.56, 4.00, 4.40, 4.78, 5.16];
const AVG: [f64; 9] = [
    1.00,
    (1.89 + 1.39) / 2.0,
    (2.50 + 1.61) / 2.0,
    (3.07 + 1.77) / 2.0,
    (3.56 + 1.90) / 2.0,
    (4.00 + 2.00) / 2.0,
    (4.40 + 2.09) / 2.0,
    (4.78 + 2.16) / 2.0,
    (5.16 + 2.23) / 2.0,
];
const DS: [f64; 9] = [1.00, 0.39, 0.22, 0.16, 0.13, 0.10, 0.09, 0.07, 0.07];
const DP: [f64; 9] = [1.00, 0.89, 0.61, 0.57, 0.49, 0.44, 0.40, 0.38, 0.38];
const DA: [f64; 9] = [
    1.00,
    (0.89 + 0.39) / 2.0,
    (0.61 + 0.22) / 2.0,
    (0.57 + 0.16) / 2.0,
    (0.49 + 0.13) / 2.0,
    (0.44 + 0.10) / 2.0,
    (0.40 + 0.09) / 2.0,
    (0.38 + 0.07) / 2.0,
    (0.38 + 0.07) / 2.0,
];

const UNILATERAL_BONUS: f64 = 0.05;
const AXIAL_FATIGUE_CNS_EQUIV_SETS: f64 = 2.5;
const CNS_FLOOR: f64 = 0.85;
const CNS_DECAY_RATE: f64 = 0.06;
const CONSECUTIVE_DAY_BASE_RATE: f64 = 0.08;
const CONSECUTIVE_DAY_BASE_CAP: f64 = 0.40;
const CONSECUTIVE_AXIAL_MULTIPLIER: f64 = 0.12;
const CONSECUTIVE_AXIAL_CAP: f64 = 0.30;
const CONSECUTIVE_BILATERAL_RATE: f64 = 0.005;
const CONSECUTIVE_BILATERAL_CAP: f64 = 0.15;
const CONSECUTIVE_DAY_FLOOR: f64 = 0.25;

#[derive(Debug, Error)]
pub enum AnalysisError {
    #[error("invalid maintenance_volume {0}; expected 1..=9")]
    InvalidMaintenanceVolume(i32),
}

#[derive(Debug, Clone)]
struct BreakdownRecord {
    set_number: i32,
    weight: f64,
    recovery_multiplier: f64,
    bilateral_multiplier: f64,
    local_multiplier: f64,
    global_multiplier: f64,
    consecutive_day_multiplier: f64,
    final_stimulus: f64,
}

#[derive(Debug, Clone)]
struct MuscleRegion {
    region_id: String,
    display_name: String,
    parent_group: String,
    leverage: String,
    damage_tier: String,
    #[allow(dead_code)]
    recovery_modifier: f64,
    #[allow(dead_code)]
    axial_fatigue_contributor: bool,
    residuals: i32,
    sets_this_session: i32,
    primary_sets: i32,
    stimulus: f64,
    atrophy: f64,
    last_trained_time: Option<f64>,
    atrophy_accounted_through: Option<f64>,
    last_stimulus_time: Option<f64>,
    last_session_time: Option<f64>,
    session_times: BTreeSet<i32>,
    weekly_frequency: f64,
    prime_sets: i32,
    secondary_sets: i32,
    tertiary_sets: i32,
    quaternary_sets: i32,
    last_breakdown: Option<BreakdownRecord>,
}

impl From<&RegionInput> for MuscleRegion {
    fn from(value: &RegionInput) -> Self {
        Self {
            region_id: value.region_id.clone(),
            display_name: value.display_name.clone(),
            parent_group: value.parent_group.clone(),
            leverage: value.leverage.clone(),
            damage_tier: value.damage_tier.clone(),
            recovery_modifier: value.recovery_modifier,
            axial_fatigue_contributor: value.axial_fatigue_contributor,
            residuals: 0,
            sets_this_session: 0,
            primary_sets: 0,
            stimulus: 0.0,
            atrophy: 0.0,
            last_trained_time: None,
            atrophy_accounted_through: None,
            last_stimulus_time: None,
            last_session_time: None,
            session_times: BTreeSet::new(),
            weekly_frequency: 0.0,
            prime_sets: 0,
            secondary_sets: 0,
            tertiary_sets: 0,
            quaternary_sets: 0,
            last_breakdown: None,
        }
    }
}

impl MuscleRegion {
    fn reset_session(&mut self) {
        self.residuals = 0;
        self.sets_this_session = 0;
    }

    fn net_weekly_stimulus(&self) -> f64 {
        self.stimulus - self.atrophy
    }

    fn residual_local_multiplier(&self, dataset: &str, k: i32, beta: f64) -> f64 {
        let m = marginals(dataset);
        let mk = if k < 9 {
            m[k as usize]
        } else {
            m[8] * 0.97_f64.powi(k - 8)
        };
        1.0 - beta * (1.0 - mk)
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_stimulus(
        &mut self,
        mut stimulus_amount: f64,
        tier: &str,
        is_unilateral: bool,
        is_bilateral: bool,
        hours_since_training: Option<f64>,
        stimulus_duration: i32,
        dataset: &str,
        current_session_time: f64,
        consecutive_day_penalty: f64,
        collect_breakdown: bool,
        precomputed_global_mult: f64,
    ) -> f64 {
        let mut recovery_ratio = 1.0;
        if let Some(hours_since) = hours_since_training {
            if hours_since < stimulus_duration as f64
                && self.last_session_time != Some(current_session_time)
            {
                recovery_ratio = (hours_since / stimulus_duration as f64).clamp(0.0, 1.0);
                stimulus_amount *= recovery_ratio;
            }
        }

        let bilateral_mod = get_bilateral_modifier(is_bilateral, is_unilateral);
        stimulus_amount *= bilateral_mod;

        let beta = tier_beta(tier);
        let local_mult = if tier == "prime" {
            let mult = if self.sets_this_session < 9 {
                marginals(dataset)[self.sets_this_session as usize]
            } else {
                marginals(dataset)[8] * 0.97_f64.powi(self.sets_this_session - 8)
            };
            self.sets_this_session += 1;
            self.prime_sets += 1;
            mult
        } else {
            let mult = self.residual_local_multiplier(dataset, self.residuals, beta);
            self.residuals += 1;
            match tier {
                "secondary" => self.secondary_sets += 1,
                "tertiary" => self.tertiary_sets += 1,
                _ => self.quaternary_sets += 1,
            }
            mult
        };

        let final_stimulus =
            precomputed_global_mult * local_mult * consecutive_day_penalty * stimulus_amount;
        self.stimulus += final_stimulus;
        if final_stimulus > 0.0 {
            self.last_stimulus_time = Some(current_session_time);
        }

        if collect_breakdown {
            self.last_breakdown = Some(BreakdownRecord {
                set_number: 0,
                weight: 0.0,
                recovery_multiplier: recovery_ratio,
                bilateral_multiplier: bilateral_mod,
                local_multiplier: local_mult,
                global_multiplier: precomputed_global_mult,
                consecutive_day_multiplier: consecutive_day_penalty,
                final_stimulus,
            });
        } else {
            self.last_breakdown = None;
        }

        if tier == "prime" {
            self.primary_sets += 1;
        }

        final_stimulus
    }

    fn account_atrophy_through(
        &mut self,
        current_time: f64,
        stimulus_duration: i32,
        maintenance_volume: i32,
        dataset: &str,
    ) -> Result<(), AnalysisError> {
        if !(1..=9).contains(&maintenance_volume) {
            return Err(AnalysisError::InvalidMaintenanceVolume(maintenance_volume));
        }
        if let Some(last) = self.last_trained_time {
            let cursor = self.atrophy_accounted_through.unwrap_or(last);
            let charge_from = cursor.max(last + stimulus_duration as f64);
            if current_time > charge_from {
                let atrophy_period = 168.0 - stimulus_duration as f64;
                let atrophy_rate =
                    cumulative(dataset)[maintenance_volume as usize - 1] / atrophy_period;
                self.atrophy += atrophy_rate * (current_time - charge_from);
            }
            self.atrophy_accounted_through = Some(cursor.max(current_time));
        }
        Ok(())
    }

    fn reset_atrophy_clock(&mut self, current_time: f64) {
        self.last_trained_time = Some(current_time);
        self.atrophy_accounted_through = Some(current_time);
    }
}

#[derive(Default, Debug)]
struct GlobalFatigueState {
    axial_fatigue: f64,
    total_sets: i32,
    bilateral_compounds: i32,
    bilateral_compound_sets: i32,
}

impl GlobalFatigueState {
    fn reset(&mut self) {
        self.axial_fatigue = 0.0;
        self.total_sets = 0;
        self.bilateral_compounds = 0;
        self.bilateral_compound_sets = 0;
    }
}

#[derive(Default, Debug)]
struct ConsecutiveDayTracker {
    consecutive_days: i32,
    cumulative_axial_fatigue: f64,
    cumulative_bilateral_sets: i32,
    last_training_day: Option<i32>,
}

#[derive(Debug, Clone)]
struct Session {
    name: String,
    time: f64,
    exercises: Vec<ResolvedExerciseInput>,
}

#[derive(Debug, Clone)]
struct SessionStats {
    time: f64,
    week: i32,
    total_sets: i32,
    muscles_trained: BTreeSet<String>,
    stimulus_by_muscle: BTreeMap<String, f64>,
    axial_fatigue: f64,
    bilateral_compounds: i32,
    bilateral_compound_sets: i32,
    consecutive_day_penalty: f64,
    final_cns_multiplier: f64,
    consecutive_days: i32,
    exercise_breakdowns: Vec<ExerciseBreakdownOutput>,
}

pub fn analyze(input: AnalysisInput) -> Result<AnalysisOutput, AnalysisError> {
    if input.regions.is_empty() {
        return Ok(empty_output(input));
    }

    let mut split = Split::new(input)?;
    split.simulate_split()?;
    Ok(split.build_response())
}

struct Split {
    name: String,
    stimulus_duration: i32,
    maintenance_volume: i32,
    dataset: String,
    include_breakdowns: bool,
    cycle_length: i32,
    sessions: Vec<Session>,
    muscles: BTreeMap<String, MuscleRegion>,
    // `BTreeMap` gives cheap deterministic lookup in the simulation, but the
    // Python engine preserves the declaration order of the region catalogue
    // when stable-sorting tied results. Keep that order separately so the
    // wire response remains byte-for-byte deterministic across engines.
    region_order: Vec<String>,
    session_stats: Vec<SessionStats>,
    simulation_horizon_hours: f64,
}

impl Split {
    fn new(input: AnalysisInput) -> Result<Self, AnalysisError> {
        let cycle_length = input
            .cycle_length
            .unwrap_or_else(|| input.sessions.iter().map(|s| s.day).max().unwrap_or(7));
        let sessions = input
            .sessions
            .iter()
            .map(|s| Session {
                name: s.name.clone(),
                time: ((s.day - 1) * 24) as f64,
                exercises: s.exercises.clone(),
            })
            .collect::<Vec<_>>();
        let region_order = input
            .regions
            .iter()
            .map(|r| r.region_id.clone())
            .collect::<Vec<_>>();
        let muscles = input
            .regions
            .iter()
            .map(|r| (r.region_id.clone(), MuscleRegion::from(r)))
            .collect::<BTreeMap<_, _>>();

        Ok(Self {
            name: input.name,
            stimulus_duration: input.stimulus_duration,
            maintenance_volume: input.maintenance_volume,
            dataset: input.dataset,
            include_breakdowns: input.include_breakdowns,
            cycle_length,
            sessions,
            muscles,
            region_order,
            session_stats: Vec::new(),
            simulation_horizon_hours: 0.0,
        })
    }

    fn simulate_split(&mut self) -> Result<(), AnalysisError> {
        if self.sessions.is_empty() {
            return Ok(());
        }

        let weeks_to_sim = lcm(self.cycle_length, 7) / 7;
        let total_days = weeks_to_sim * 7;
        let num_cycles = total_days / self.cycle_length;
        let mut consecutive_tracker = ConsecutiveDayTracker::default();
        let mut timeline_sessions = Vec::new();
        for cycle in 0..num_cycles {
            let cycle_offset_hours = (cycle * self.cycle_length * 24) as f64;
            for (idx, session) in self.sessions.iter().enumerate() {
                timeline_sessions.push((session.time + cycle_offset_hours, idx));
            }
        }
        timeline_sessions.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        let mut fatigue_state = GlobalFatigueState::default();
        for (absolute_time, session_idx) in timeline_sessions {
            let absolute_day_number = (absolute_time / 24.0) as i32 + 1;

            if let Some(last_day) = consecutive_tracker.last_training_day {
                let days_since_last = absolute_day_number - last_day;
                if days_since_last == 1 {
                    consecutive_tracker.consecutive_days += 1;
                } else if days_since_last > 1 {
                    consecutive_tracker.consecutive_days = 1;
                    consecutive_tracker.cumulative_axial_fatigue = 0.0;
                    consecutive_tracker.cumulative_bilateral_sets = 0;
                }
            } else {
                consecutive_tracker.consecutive_days = 1;
            }

            let consecutive_penalty = calculate_consecutive_day_penalty(
                consecutive_tracker.consecutive_days,
                consecutive_tracker.cumulative_axial_fatigue,
                consecutive_tracker.cumulative_bilateral_sets,
            );

            fatigue_state.reset();
            let mut session = self.sessions[session_idx].clone();
            session.time = absolute_time;
            if let Some(mut stats) = session.execute(
                &mut self.muscles,
                self.stimulus_duration,
                self.maintenance_volume,
                &self.dataset,
                &mut fatigue_state,
                consecutive_penalty,
                self.include_breakdowns,
            ) {
                if self.include_breakdowns {
                    stats.time = absolute_time;
                    stats.week = (absolute_time / 168.0) as i32 + 1;
                    stats.consecutive_days = consecutive_tracker.consecutive_days;
                    self.session_stats.push(stats.clone());
                }
                consecutive_tracker.cumulative_axial_fatigue += stats.axial_fatigue;
                consecutive_tracker.cumulative_bilateral_sets += stats.bilateral_compound_sets;
                consecutive_tracker.last_training_day = Some(absolute_day_number);
            }
        }

        let horizon = (total_days * 24) as f64;
        self.simulation_horizon_hours = horizon;
        for muscle in self.muscles.values_mut() {
            muscle.account_atrophy_through(
                horizon,
                self.stimulus_duration,
                self.maintenance_volume,
                &self.dataset,
            )?;
            let weeks = weeks_to_sim as f64;
            muscle.stimulus /= weeks;
            muscle.atrophy /= weeks;
            muscle.primary_sets = (muscle.primary_sets as f64 / weeks) as i32;
            muscle.prime_sets = (muscle.prime_sets as f64 / weeks) as i32;
            muscle.secondary_sets = (muscle.secondary_sets as f64 / weeks) as i32;
            muscle.tertiary_sets = (muscle.tertiary_sets as f64 / weeks) as i32;
            muscle.quaternary_sets = (muscle.quaternary_sets as f64 / weeks) as i32;
            muscle.weekly_frequency = muscle.session_times.len() as f64 / weeks;
        }

        Ok(())
    }

    fn build_response(&self) -> AnalysisOutput {
        let horizon_hour = self.simulation_horizon_hours;
        let stim_duration = self.stimulus_duration.max(1) as f64;
        let mut muscles_list = self
            .region_order
            .iter()
            .filter_map(|region_id| self.muscles.get(region_id))
            .map(|m| {
                let readiness = m.last_stimulus_time.map(|last| {
                    let hours_since = (horizon_hour - last).max(0.0);
                    (hours_since / stim_duration).clamp(0.0, 1.0)
                });
                MuscleStatsOutput {
                    region_id: m.region_id.clone(),
                    display_name: m.display_name.clone(),
                    parent_group: m.parent_group.clone(),
                    stimulus: m.stimulus,
                    atrophy: m.atrophy,
                    net_stimulus: m.net_weekly_stimulus(),
                    primary_sets: m.primary_sets,
                    prime_sets: m.prime_sets,
                    secondary_sets: m.secondary_sets,
                    tertiary_sets: m.tertiary_sets,
                    frequency: m.weekly_frequency,
                    leverage: m.leverage.clone(),
                    damage_tier: m.damage_tier.clone(),
                    recovery_readiness: readiness,
                }
            })
            .collect::<Vec<_>>();
        muscles_list.sort_by(|a, b| b.net_stimulus.partial_cmp(&a.net_stimulus).unwrap());

        let group_summaries = build_group_summaries(&muscles_list);
        let suggestions = generate_suggestions(&muscles_list, self.maintenance_volume);
        let total_sets = muscles_list.iter().map(|m| m.primary_sets).sum::<i32>();
        let trained_muscles = muscles_list.iter().filter(|m| m.stimulus > 0.0).count() as i32;
        let avg_net = muscles_list
            .iter()
            .filter(|m| m.stimulus > 0.0)
            .map(|m| m.net_stimulus)
            .sum::<f64>()
            / trained_muscles.max(1) as f64;
        let summary = SummaryStatsOutput {
            total_sets,
            muscles_trained: trained_muscles,
            total_muscles: self.muscles.len() as i32,
            avg_net_stimulus: avg_net,
            avg_sets_per_muscle: total_sets as f64 / trained_muscles.max(1) as f64,
            group_summaries: group_summaries.clone(),
        };
        let session_breakdowns = if self.include_breakdowns {
            self.build_session_breakdowns()
        } else {
            Vec::new()
        };

        AnalysisOutput {
            split_name: self.name.clone(),
            cycle_length: self.cycle_length,
            stimulus_duration: self.stimulus_duration,
            maintenance_volume: self.maintenance_volume,
            dataset: self.dataset.clone(),
            muscles: muscles_list,
            group_summaries,
            suggestions,
            summary,
            session_breakdowns,
        }
    }

    fn build_session_breakdowns(&self) -> Vec<SessionBreakdownOutput> {
        let cycle_hours = self.cycle_length * 24;
        let mut session_name_by_day: BTreeMap<i32, String> = BTreeMap::new();
        for session in &self.sessions {
            let day_number = ((session.time as i32 / 24) % self.cycle_length) + 1;
            session_name_by_day.insert(day_number, session.name.clone());
        }

        let mut seen: BTreeMap<i32, &SessionStats> = BTreeMap::new();
        for stats in &self.session_stats {
            if stats.exercise_breakdowns.is_empty() {
                continue;
            }
            let key = if cycle_hours > 0 {
                (stats.time as i32) % cycle_hours
            } else {
                stats.time as i32
            };
            seen.insert(key, stats);
        }

        seen.into_values()
            .map(|stats| {
                let day_number = ((stats.time as i32 / 24) % self.cycle_length) + 1;
                let session_name = session_name_by_day
                    .get(&day_number)
                    .cloned()
                    .unwrap_or_else(|| format!("Day {day_number}"));
                SessionBreakdownOutput {
                    session_name,
                    day_number,
                    exercises: stats.exercise_breakdowns.clone(),
                    cumulative_sets: stats.total_sets,
                    cumulative_axial_fatigue: stats.axial_fatigue,
                    final_cns_multiplier: stats.final_cns_multiplier,
                    consecutive_days: stats.consecutive_days,
                    consecutive_day_penalty: stats.consecutive_day_penalty,
                }
            })
            .collect()
    }
}

impl Session {
    #[allow(clippy::too_many_arguments)]
    fn execute(
        &mut self,
        muscles: &mut BTreeMap<String, MuscleRegion>,
        stimulus_duration: i32,
        maintenance_volume: i32,
        dataset: &str,
        fatigue_state: &mut GlobalFatigueState,
        consecutive_day_penalty: f64,
        collect_breakdowns: bool,
    ) -> Option<SessionStats> {
        if self.name == "Rest" || self.exercises.is_empty() {
            return None;
        }

        let mut global_sets = 0;
        for muscle in muscles.values_mut() {
            muscle.reset_session();
        }

        let mut stats = SessionStats {
            time: self.time,
            week: 0,
            total_sets: 0,
            muscles_trained: BTreeSet::new(),
            stimulus_by_muscle: BTreeMap::new(),
            axial_fatigue: 0.0,
            bilateral_compounds: 0,
            bilateral_compound_sets: 0,
            consecutive_day_penalty,
            final_cns_multiplier: 1.0,
            consecutive_days: 1,
            exercise_breakdowns: Vec::new(),
        };

        for exercise in &self.exercises {
            let Some(pattern_name) = exercise.pattern_name.as_ref() else {
                continue;
            };
            let mut tiered_targets = redistribute_leverage_weights(
                &exercise.tiered_targets,
                &exercise.resistance_profile,
                muscles,
            );
            ensure_tiers(&mut tiered_targets);
            let pre_leverage_targets = exercise.tiered_targets.clone();

            if let Some(prime_targets) = tiered_targets.get("prime") {
                for muscle_id in prime_targets.keys() {
                    if let Some(muscle) = muscles.get_mut(muscle_id) {
                        muscle
                            .account_atrophy_through(
                                self.time,
                                stimulus_duration,
                                maintenance_volume,
                                dataset,
                            )
                            .ok()?;
                    }
                }
            }

            if exercise.axial_load > 0.0 {
                fatigue_state.axial_fatigue +=
                    calculate_axial_contribution(pattern_name, exercise.sets);
            }
            if is_bilateral_compound(pattern_name, exercise.is_unilateral) {
                fatigue_state.bilateral_compounds += 1;
                fatigue_state.bilateral_compound_sets += exercise.sets;
            }

            let mut work_items: Vec<(String, f64, String, Option<f64>)> = Vec::new();
            for tier in ["prime", "secondary", "tertiary", "quaternary"] {
                if let Some(targets) = tiered_targets.get(tier) {
                    for (muscle_id, weight) in targets {
                        if let Some(muscle) = muscles.get(muscle_id) {
                            let hours_since = muscle.last_trained_time.map(|last| self.time - last);
                            work_items.push((
                                muscle_id.clone(),
                                *weight,
                                tier.to_string(),
                                hours_since,
                            ));
                        }
                    }
                }
            }

            let mut contribution_map: BTreeMap<String, MuscleContributionOutput> = BTreeMap::new();
            let mut contribution_order = Vec::new();
            if collect_breakdowns {
                for (muscle_id, weight, tier, _) in &work_items {
                    if let Some(muscle) = muscles.get(muscle_id) {
                        let base_weight = pre_leverage_targets
                            .get(tier)
                            .and_then(|targets| targets.get(muscle_id))
                            .copied()
                            .unwrap_or(*weight);
                        if !contribution_map.contains_key(muscle_id) {
                            contribution_order.push(muscle_id.clone());
                            contribution_map.insert(
                                muscle_id.clone(),
                                MuscleContributionOutput {
                                    muscle_id: muscle_id.clone(),
                                    display_name: muscle.display_name.clone(),
                                    tier: tier.clone(),
                                    base_weight,
                                    leverage_weight: *weight,
                                    sets: Vec::new(),
                                    total_stimulus: 0.0,
                                },
                            );
                        }
                    }
                }
            }

            let current_axial = fatigue_state.axial_fatigue;
            let cns_lookup = (0..exercise.sets)
                .map(|s| calculate_cns_fatigue(global_sets + s + 1, current_axial))
                .collect::<Vec<_>>();

            for set_num in 0..exercise.sets {
                global_sets += 1;
                fatigue_state.total_sets += 1;

                for (muscle_id, weight, tier, hours_since) in &work_items {
                    let muscle = muscles.get_mut(muscle_id).unwrap();
                    let stimulus = muscle.apply_stimulus(
                        *weight,
                        tier,
                        exercise.is_unilateral,
                        exercise.is_bilateral,
                        *hours_since,
                        stimulus_duration,
                        dataset,
                        self.time,
                        consecutive_day_penalty,
                        collect_breakdowns,
                        cns_lookup[set_num as usize],
                    );

                    if collect_breakdowns {
                        *stats
                            .stimulus_by_muscle
                            .entry(muscle_id.clone())
                            .or_insert(0.0) += stimulus;
                        stats.muscles_trained.insert(muscle_id.clone());
                        if let Some(mut bd) = muscle.last_breakdown.clone() {
                            bd.set_number = set_num + 1;
                            bd.weight = *weight;
                            if let Some(mc) = contribution_map.get_mut(muscle_id) {
                                mc.total_stimulus += bd.final_stimulus;
                                mc.sets.push(SetBreakdownOutput {
                                    set_number: bd.set_number,
                                    weight: bd.weight,
                                    recovery_multiplier: bd.recovery_multiplier,
                                    bilateral_multiplier: bd.bilateral_multiplier,
                                    local_multiplier: bd.local_multiplier,
                                    global_multiplier: bd.global_multiplier,
                                    consecutive_day_multiplier: bd.consecutive_day_multiplier,
                                    final_stimulus: bd.final_stimulus,
                                });
                            }
                        }
                    }
                }
            }

            if let Some(prime_targets) = tiered_targets.get("prime") {
                for muscle_id in prime_targets.keys() {
                    if let Some(muscle) = muscles.get_mut(muscle_id) {
                        muscle.reset_atrophy_clock(self.time);
                        muscle.last_session_time = Some(self.time);
                        muscle.session_times.insert(self.time as i32);
                    }
                }
            }

            if collect_breakdowns {
                let mut contributions = contribution_order
                    .into_iter()
                    .filter_map(|muscle_id| contribution_map.remove(&muscle_id))
                    .collect::<Vec<_>>();
                contributions.sort_by(|a, b| {
                    tier_order(&a.tier)
                        .cmp(&tier_order(&b.tier))
                        .then_with(|| b.total_stimulus.partial_cmp(&a.total_stimulus).unwrap())
                });
                stats.exercise_breakdowns.push(ExerciseBreakdownOutput {
                    name: exercise.name.clone(),
                    pattern: pattern_name.clone(),
                    sets: exercise.sets,
                    resistance_profile: exercise.resistance_profile.clone(),
                    is_bilateral: exercise.is_bilateral,
                    is_unilateral: exercise.is_unilateral,
                    axial_load: exercise.axial_load,
                    muscle_contributions: contributions,
                });
            }
        }

        stats.axial_fatigue = fatigue_state.axial_fatigue;
        stats.bilateral_compounds = fatigue_state.bilateral_compounds;
        stats.bilateral_compound_sets = fatigue_state.bilateral_compound_sets;
        stats.total_sets = global_sets;
        stats.final_cns_multiplier =
            calculate_cns_fatigue(global_sets, fatigue_state.axial_fatigue);
        Some(stats)
    }
}

fn empty_output(input: AnalysisInput) -> AnalysisOutput {
    AnalysisOutput {
        split_name: input.name,
        cycle_length: input.cycle_length.unwrap_or(7),
        stimulus_duration: input.stimulus_duration,
        maintenance_volume: input.maintenance_volume,
        dataset: input.dataset,
        muscles: Vec::new(),
        group_summaries: Vec::new(),
        suggestions: Vec::new(),
        summary: SummaryStatsOutput {
            total_sets: 0,
            muscles_trained: 0,
            total_muscles: 0,
            avg_net_stimulus: 0.0,
            avg_sets_per_muscle: 0.0,
            group_summaries: Vec::new(),
        },
        session_breakdowns: Vec::new(),
    }
}

fn cumulative(dataset: &str) -> &'static [f64; 9] {
    match dataset {
        "pelland" => &PELLAND,
        "average" => &AVG,
        _ => &SCHOENFELD,
    }
}

fn marginals(dataset: &str) -> &'static [f64; 9] {
    match dataset {
        "pelland" => &DP,
        "average" => &DA,
        _ => &DS,
    }
}

fn tier_beta(tier: &str) -> f64 {
    match tier {
        "prime" => 1.0,
        "secondary" => 0.55,
        "tertiary" => 0.35,
        "quaternary" => 0.15,
        _ => 0.5,
    }
}

fn tier_order(tier: &str) -> i32 {
    match tier {
        "prime" => 0,
        "secondary" => 1,
        "tertiary" => 2,
        "quaternary" => 3,
        _ => 99,
    }
}

fn get_bilateral_modifier(_is_bilateral: bool, is_unilateral: bool) -> f64 {
    if is_unilateral {
        1.0 + UNILATERAL_BONUS
    } else {
        1.0
    }
}

fn calculate_cns_fatigue(global_set_number: i32, axial_fatigue: f64) -> f64 {
    let effective_sets = global_set_number as f64 + (axial_fatigue * AXIAL_FATIGUE_CNS_EQUIV_SETS);
    CNS_FLOOR + (1.0 - CNS_FLOOR) * (-CNS_DECAY_RATE * effective_sets).exp()
}

fn calculate_axial_contribution(pattern_name: &str, num_sets: i32) -> f64 {
    let load = get_axial_load(pattern_name);
    load * num_sets as f64 * 0.15
}

fn get_axial_load(pattern_name: &str) -> f64 {
    let normalized = pattern_name.to_lowercase().replace(['-', ' '], "_");
    let values = [
        ("hinge", 1.0),
        ("hinge_compound", 1.0),
        ("conventional_deadlift", 1.0),
        ("squat", 0.8),
        ("squat_compound", 0.8),
        ("front_squat", 0.7),
        ("good_morning", 0.9),
        ("transverse_row", 0.4),
        ("scapular_retraction_compound", 0.4),
        ("spinal_extension", 0.5),
        ("vertical_press", 0.3),
        ("vertical_press_compound", 0.3),
        ("lunge", 0.3),
        ("lunge_compound", 0.3),
        ("sagittal_adduction_compound", 0.2),
        ("hip_extension", 0.2),
        ("hip_extension_isolation", 0.1),
        ("horizontal_press", 0.1),
        ("humeral_adduction_compound", 0.1),
    ];
    for (pattern, load) in values {
        if normalized == pattern {
            return load;
        }
    }
    for (pattern, load) in values {
        if normalized.contains(pattern) || pattern.contains(&normalized) {
            return load;
        }
    }
    0.0
}

fn is_bilateral_compound(pattern_name: &str, is_unilateral: bool) -> bool {
    if is_unilateral {
        return false;
    }
    let normalized = pattern_name.to_lowercase();
    [
        "squat",
        "squat_compound",
        "hinge",
        "hinge_compound",
        "deadlift",
        "press",
        "vertical_press_compound",
        "humeral_adduction_compound",
        "row",
        "scapular_retraction_compound",
        "pull",
        "sagittal_adduction_compound",
        "lunge",
        "lunge_compound",
        "good_morning",
        "front_squat",
    ]
    .iter()
    .any(|p| normalized.contains(p))
}

fn calculate_consecutive_day_penalty(
    consecutive_days: i32,
    cumulative_axial_fatigue: f64,
    cumulative_bilateral_sets: i32,
) -> f64 {
    if consecutive_days <= 1 {
        return 1.0;
    }
    let days_factor = (consecutive_days - 1) as f64;
    let base_penalty = (CONSECUTIVE_DAY_BASE_RATE * days_factor * (1.0 - 0.06 * days_factor))
        .min(CONSECUTIVE_DAY_BASE_CAP);
    let axial_penalty =
        (cumulative_axial_fatigue * CONSECUTIVE_AXIAL_MULTIPLIER).min(CONSECUTIVE_AXIAL_CAP);
    let bilateral_penalty = (cumulative_bilateral_sets as f64 * CONSECUTIVE_BILATERAL_RATE)
        .min(CONSECUTIVE_BILATERAL_CAP);
    CONSECUTIVE_DAY_FLOOR.max(1.0 - (base_penalty + axial_penalty + bilateral_penalty))
}

fn get_leverage_multiplier(muscle_leverage: &str, resistance_profile: &str) -> f64 {
    match (muscle_leverage, resistance_profile) {
        ("S", "ascending") => 1.0,
        ("S", "mid") => 0.85,
        ("S", "descending") => 0.70,
        ("M", "ascending") => 0.85,
        ("M", "mid") => 1.0,
        ("M", "descending") => 0.85,
        ("L", "ascending") => 0.70,
        ("L", "mid") => 0.85,
        ("L", "descending") => 1.0,
        _ => 0.85,
    }
}

fn redistribute_leverage_weights(
    tiered_targets: &TieredTargets,
    resistance_profile: &str,
    muscles: &BTreeMap<String, MuscleRegion>,
) -> TieredTargets {
    let mut all_muscles: IndexMap<String, (String, f64)> = IndexMap::new();
    for (tier, targets) in tiered_targets {
        for (muscle_id, weight) in targets {
            all_muscles.insert(muscle_id.clone(), (tier.clone(), *weight));
        }
    }
    if all_muscles.is_empty() {
        let mut empty = TieredTargets::new();
        ensure_tiers(&mut empty);
        return empty;
    }

    let total_original = all_muscles.values().map(|(_, w)| *w).sum::<f64>();
    if total_original == 0.0 {
        return tiered_targets.clone();
    }

    let weighted = all_muscles
        .iter()
        .map(|(muscle_id, (_, weight))| {
            let mult = muscles
                .get(muscle_id)
                .map(|m| get_leverage_multiplier(&m.leverage, resistance_profile))
                .unwrap_or(0.85);
            (muscle_id.clone(), weight * mult)
        })
        .collect::<IndexMap<_, _>>();
    let total_weighted = weighted.values().sum::<f64>();
    if total_weighted == 0.0 {
        return tiered_targets.clone();
    }

    let scale = total_original / total_weighted;
    let mut adjusted = TieredTargets::new();
    ensure_tiers(&mut adjusted);
    for (muscle_id, (tier, _)) in all_muscles {
        adjusted
            .entry(tier)
            .or_default()
            .insert(muscle_id.clone(), weighted[&muscle_id] * scale);
    }
    adjusted
}

fn ensure_tiers(targets: &mut TieredTargets) {
    for tier in ["prime", "secondary", "tertiary", "quaternary"] {
        targets.entry(tier.to_string()).or_default();
    }
}

fn build_group_summaries(muscles: &[MuscleStatsOutput]) -> Vec<MuscleGroupSummaryOutput> {
    let mut by_group: BTreeMap<String, Vec<&MuscleStatsOutput>> = BTreeMap::new();
    for muscle in muscles {
        by_group
            .entry(muscle.parent_group.clone())
            .or_default()
            .push(muscle);
    }
    by_group
        .into_iter()
        .map(|(group, items)| MuscleGroupSummaryOutput {
            group,
            total_net_stimulus: items.iter().map(|m| m.net_stimulus).sum(),
            total_sets: items.iter().map(|m| m.primary_sets).sum(),
            regions: items.iter().map(|m| m.region_id.clone()).collect(),
        })
        .collect()
}

fn generate_suggestions(
    muscles: &[MuscleStatsOutput],
    maintenance_volume: i32,
) -> Vec<OptimizationSuggestionOutput> {
    let mut suggestions = Vec::new();
    for data in muscles {
        let name = &data.display_name;
        let net = data.net_stimulus;
        let sets = data.primary_sets;
        let freq = data.frequency;
        let atrophy = data.atrophy;
        let stimulus = data.stimulus;

        if net < 1.0 && stimulus > 0.0 {
            suggestions.push(OptimizationSuggestionOutput {
                priority: "HIGH".to_string(),
                muscle: name.clone(),
                issue: "Under-stimulated".to_string(),
                suggestion: format!(
                    "Net stimulus is only {:.2}. Consider adding 2-4 more sets or increasing frequency.",
                    net
                ),
            });
        } else if net < 2.0 && stimulus > 0.0 {
            suggestions.push(OptimizationSuggestionOutput {
                priority: "MEDIUM".to_string(),
                muscle: name.clone(),
                issue: "Low stimulus".to_string(),
                suggestion: format!(
                    "Net stimulus is {:.2}. Could benefit from 1-2 additional sets.",
                    net
                ),
            });
        }

        if sets == 0 && stimulus == 0.0 {
            suggestions.push(OptimizationSuggestionOutput {
                priority: "HIGH".to_string(),
                muscle: name.clone(),
                issue: "Not trained".to_string(),
                suggestion: format!(
                    "No direct training. Add at least {maintenance_volume} sets per week."
                ),
            });
        }

        if sets > 12 {
            suggestions.push(OptimizationSuggestionOutput {
                priority: "MEDIUM".to_string(),
                muscle: name.clone(),
                issue: "Excessive volume".to_string(),
                suggestion: format!(
                    "Weekly volume is {sets} sets. Consider reducing to 8-12 sets."
                ),
            });
        }

        if stimulus > 0.0 && atrophy > 0.0 {
            let atrophy_ratio = atrophy / stimulus;
            if atrophy_ratio > 0.4 && freq <= 1.0 {
                suggestions.push(OptimizationSuggestionOutput {
                    priority: "HIGH".to_string(),
                    muscle: name.clone(),
                    issue: "High atrophy".to_string(),
                    suggestion: format!(
                        "Atrophy is {:.1}% of stimulus. Increase frequency to 2x per week.",
                        atrophy_ratio * 100.0
                    ),
                });
            }
        }
    }
    suggestions
}

fn gcd(mut a: i32, mut b: i32) -> i32 {
    while b != 0 {
        let r = a % b;
        a = b;
        b = r;
    }
    a.abs()
}

fn lcm(a: i32, b: i32) -> i32 {
    (a / gcd(a, b)) * b
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_region(region_id: &str, leverage: &str) -> RegionInput {
        RegionInput {
            region_id: region_id.to_string(),
            display_name: region_id.to_uppercase(),
            parent_group: "test".to_string(),
            leverage: leverage.to_string(),
            damage_tier: "0".to_string(),
            recovery_modifier: 1.0,
            axial_fatigue_contributor: false,
        }
    }

    #[test]
    fn cns_formula_matches_expected_shape() {
        let fresh = calculate_cns_fatigue(1, 0.0);
        let fatigued = calculate_cns_fatigue(30, 1.0);
        assert!(fresh > fatigued);
        assert!(fatigued > 0.84);
    }

    #[test]
    fn leverage_redistribution_preserves_total() {
        let mut targets = TieredTargets::new();
        targets.insert(
            "prime".to_string(),
            IndexMap::from([("a".to_string(), 0.5), ("b".to_string(), 0.5)]),
        );
        ensure_tiers(&mut targets);
        let region_a = test_region("a", "S");
        let region_b = test_region("b", "L");
        let muscles = BTreeMap::from([
            ("a".to_string(), MuscleRegion::from(&region_a)),
            ("b".to_string(), MuscleRegion::from(&region_b)),
        ]);
        let descending = redistribute_leverage_weights(&targets, "descending", &muscles);
        let ascending = redistribute_leverage_weights(&targets, "ascending", &muscles);
        let descending_total: f64 = descending.values().flat_map(|tier| tier.values()).sum();
        let ascending_total: f64 = ascending.values().flat_map(|tier| tier.values()).sum();

        assert!((descending_total - 1.0).abs() < 1e-9);
        assert!((ascending_total - 1.0).abs() < 1e-9);
        assert!(descending["prime"]["b"] > descending["prime"]["a"]);
        assert!(ascending["prime"]["a"] > ascending["prime"]["b"]);
    }

    #[test]
    fn prime_marginal_tail_matches_python_after_nine_sets() {
        let region = test_region("a", "M");
        let mut muscle = MuscleRegion::from(&region);
        let mut applied = Vec::new();

        for _ in 0..10 {
            applied.push(muscle.apply_stimulus(
                1.0, "prime", false, false, None, 48, "average", 0.0, 1.0, false, 1.0,
            ));
        }

        assert!((applied[8] - DA[8]).abs() < 1e-12);
        assert!((applied[9] - DA[8] * 0.97).abs() < 1e-12);
        assert_eq!(muscle.primary_sets, 10);
        assert_eq!(muscle.prime_sets, 10);
    }

    #[test]
    fn partial_recovery_and_atrophy_match_python_contract() {
        let region = test_region("a", "M");
        let mut muscle = MuscleRegion::from(&region);
        muscle.last_session_time = Some(0.0);
        muscle.reset_atrophy_clock(0.0);

        let recovered_stimulus = muscle.apply_stimulus(
            1.0,
            "prime",
            false,
            false,
            Some(24.0),
            48,
            "schoenfeld",
            24.0,
            1.0,
            true,
            1.0,
        );
        muscle
            .account_atrophy_through(60.0, 48, 3, "schoenfeld")
            .expect("valid maintenance volume");

        assert!((recovered_stimulus - 0.5).abs() < 1e-12);
        assert_eq!(muscle.last_breakdown.unwrap().recovery_multiplier, 0.5);
        assert!((muscle.atrophy - 0.161).abs() < 1e-12);
    }

    #[test]
    fn consecutive_day_penalty_matches_components_and_floor() {
        let penalty = calculate_consecutive_day_penalty(3, 2.0, 10);

        assert!((penalty - 0.5692).abs() < 1e-12);
        assert_eq!(calculate_consecutive_day_penalty(1, 100.0, 100), 1.0);
        assert_eq!(calculate_consecutive_day_penalty(8, 100.0, 100), 0.25);
    }

    #[test]
    fn unilateral_bonus_is_applied_without_bilateral_penalty() {
        assert_eq!(get_bilateral_modifier(true, false), 1.0);
        assert_eq!(get_bilateral_modifier(false, true), 1.05);
        assert_eq!(get_bilateral_modifier(true, true), 1.05);
    }
}
