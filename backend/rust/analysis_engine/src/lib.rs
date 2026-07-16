#![allow(clippy::useless_conversion)] // Raised inside PyO3's generated wrapper.

mod engine;
mod types;

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

#[pyfunction]
fn analyze_split_json(input_json: &str) -> PyResult<String> {
    let input: types::AnalysisInput = serde_json::from_str(input_json)
        .map_err(|err| PyValueError::new_err(format!("invalid analysis input: {err}")))?;
    let output = engine::analyze(input)
        .map_err(|err| PyValueError::new_err(format!("analysis failed: {err}")))?;
    serde_json::to_string(&output)
        .map_err(|err| PyValueError::new_err(format!("failed to serialize analysis output: {err}")))
}

#[pymodule]
fn analysis_engine_rs(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(analyze_split_json, m)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_payload_returns_zero_summary() {
        let input = r#"{
            "name":"Empty",
            "cycle_length":7,
            "stimulus_duration":48,
            "maintenance_volume":3,
            "dataset":"average",
            "include_breakdowns":false,
            "regions":[],
            "sessions":[]
        }"#;
        let output = analyze_split_json(input).expect("analysis should succeed");
        assert!(output.contains("\"total_sets\":0"));
    }
}
