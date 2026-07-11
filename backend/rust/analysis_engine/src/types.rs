use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

// Python dictionaries preserve declaration order. The response exposes
// ordered breakdown lists, so retain that order across the JSON boundary.
pub type TieredTargets = IndexMap<String, IndexMap<String, f64>>;

#[derive(Debug, Deserialize)]
pub struct AnalysisInput {
    pub name: String,
    pub cycle_length: Option<i32>,
    pub stimulus_duration: i32,
    pub maintenance_volume: i32,
    pub dataset: String,
    pub include_breakdowns: bool,
    pub regions: Vec<RegionInput>,
    pub sessions: Vec<ResolvedSessionInput>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RegionInput {
    pub region_id: String,
    pub display_name: String,
    pub parent_group: String,
    pub leverage: String,
    pub damage_tier: String,
    pub recovery_modifier: f64,
    pub axial_fatigue_contributor: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ResolvedSessionInput {
    pub name: String,
    pub day: i32,
    pub exercises: Vec<ResolvedExerciseInput>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ResolvedExerciseInput {
    pub name: String,
    pub sets: i32,
    pub pattern_name: Option<String>,
    pub tiered_targets: TieredTargets,
    pub is_bilateral: bool,
    pub is_unilateral: bool,
    pub axial_load: f64,
    pub resistance_profile: String,
}

#[derive(Debug, Serialize)]
pub struct AnalysisOutput {
    pub split_name: String,
    pub cycle_length: i32,
    pub stimulus_duration: i32,
    pub maintenance_volume: i32,
    pub dataset: String,
    pub muscles: Vec<MuscleStatsOutput>,
    pub group_summaries: Vec<MuscleGroupSummaryOutput>,
    pub suggestions: Vec<OptimizationSuggestionOutput>,
    pub summary: SummaryStatsOutput,
    pub session_breakdowns: Vec<SessionBreakdownOutput>,
}

#[derive(Debug, Serialize, Clone)]
pub struct MuscleStatsOutput {
    pub region_id: String,
    pub display_name: String,
    pub parent_group: String,
    pub stimulus: f64,
    pub atrophy: f64,
    pub net_stimulus: f64,
    pub primary_sets: i32,
    pub prime_sets: i32,
    pub secondary_sets: i32,
    pub tertiary_sets: i32,
    pub frequency: f64,
    pub leverage: String,
    pub damage_tier: String,
    pub recovery_readiness: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct MuscleGroupSummaryOutput {
    pub group: String,
    pub total_net_stimulus: f64,
    pub total_sets: i32,
    pub regions: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct OptimizationSuggestionOutput {
    pub priority: String,
    pub muscle: String,
    pub issue: String,
    pub suggestion: String,
}

#[derive(Debug, Serialize)]
pub struct SummaryStatsOutput {
    pub total_sets: i32,
    pub muscles_trained: i32,
    pub total_muscles: i32,
    pub avg_net_stimulus: f64,
    pub avg_sets_per_muscle: f64,
    pub group_summaries: Vec<MuscleGroupSummaryOutput>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SetBreakdownOutput {
    pub set_number: i32,
    pub weight: f64,
    pub recovery_multiplier: f64,
    pub bilateral_multiplier: f64,
    pub local_multiplier: f64,
    pub global_multiplier: f64,
    pub consecutive_day_multiplier: f64,
    pub final_stimulus: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct MuscleContributionOutput {
    pub muscle_id: String,
    pub display_name: String,
    pub tier: String,
    pub base_weight: f64,
    pub leverage_weight: f64,
    pub sets: Vec<SetBreakdownOutput>,
    pub total_stimulus: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ExerciseBreakdownOutput {
    pub name: String,
    pub pattern: String,
    pub sets: i32,
    pub resistance_profile: String,
    pub is_bilateral: bool,
    pub is_unilateral: bool,
    pub axial_load: f64,
    pub muscle_contributions: Vec<MuscleContributionOutput>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SessionBreakdownOutput {
    pub session_name: String,
    pub day_number: i32,
    pub exercises: Vec<ExerciseBreakdownOutput>,
    pub cumulative_sets: i32,
    pub cumulative_axial_fatigue: f64,
    pub final_cns_multiplier: f64,
    pub consecutive_days: i32,
    pub consecutive_day_penalty: f64,
}
