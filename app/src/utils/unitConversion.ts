import type { WeightUnit } from '../stores/settingsStore';

const KG_PER_LB = 0.453592;
const LB_PER_KG = 2.20462;

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

export function convertLbToDisplay(rawLb: number, unit: WeightUnit): number {
  if (unit === 'kg') {
    return roundToOneDecimal(rawLb * KG_PER_LB);
  }
  return roundToOneDecimal(rawLb);
}

export function displayWeight(rawLb: number, unit: WeightUnit): string {
  const value = convertLbToDisplay(rawLb, unit);
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted} ${unit}`;
}

export function parseWeightInput(input: number, unit: WeightUnit): number {
  if (!Number.isFinite(input)) return 0;
  if (unit === 'kg') {
    return roundToOneDecimal(input * LB_PER_KG);
  }
  return roundToOneDecimal(input);
}
