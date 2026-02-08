import { useState } from 'react';
import { Calculator, Scale, Timer, Percent, Dumbbell } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';

// 1RM Calculator using multiple formulas
function calculate1RMFormulas(weight: number, reps: number) {
  if (reps === 1) return { epley: weight, brzycki: weight, lander: weight, average: weight };

  const epley = weight * (1 + reps / 30);
  const brzycki = weight * (36 / (37 - reps));
  const lander = (100 * weight) / (101.3 - 2.67123 * reps);
  const average = (epley + brzycki + lander) / 3;

  return {
    epley: Math.round(epley),
    brzycki: Math.round(brzycki),
    lander: Math.round(lander),
    average: Math.round(average),
  };
}

// Calculate weight for target reps from 1RM
function calculatePercentages(oneRM: number) {
  return [
    { reps: 1, percent: 100, weight: oneRM },
    { reps: 2, percent: 97, weight: Math.round(oneRM * 0.97) },
    { reps: 3, percent: 94, weight: Math.round(oneRM * 0.94) },
    { reps: 4, percent: 91, weight: Math.round(oneRM * 0.91) },
    { reps: 5, percent: 87, weight: Math.round(oneRM * 0.87) },
    { reps: 6, percent: 84, weight: Math.round(oneRM * 0.84) },
    { reps: 8, percent: 78, weight: Math.round(oneRM * 0.78) },
    { reps: 10, percent: 73, weight: Math.round(oneRM * 0.73) },
    { reps: 12, percent: 68, weight: Math.round(oneRM * 0.68) },
    { reps: 15, percent: 62, weight: Math.round(oneRM * 0.62) },
  ];
}

// Convert weight between units
function convertWeight(value: number, from: 'lb' | 'kg', to: 'lb' | 'kg'): number {
  if (from === to) return value;
  if (from === 'lb' && to === 'kg') return Math.round(value * 0.453592 * 10) / 10;
  return Math.round(value / 0.453592 * 10) / 10;
}

// Calculate plate configuration
function calculatePlates(targetWeight: number, barWeight: number, unit: 'lb' | 'kg'): string[] {
  const availablePlates = unit === 'lb'
    ? [45, 35, 25, 10, 5, 2.5]
    : [25, 20, 15, 10, 5, 2.5, 1.25];

  let remaining = (targetWeight - barWeight) / 2; // per side
  if (remaining <= 0) return [];

  const plates: string[] = [];

  for (const plate of availablePlates) {
    while (remaining >= plate) {
      plates.push(`${plate}${unit}`);
      remaining -= plate;
    }
  }

  return plates;
}

// TDEE Calculator
function calculateTDEE(weight: number, heightCm: number, age: number, gender: 'male' | 'female', activity: number): number {
  // Mifflin-St Jeor equation
  let bmr: number;
  if (gender === 'male') {
    bmr = 10 * weight + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * heightCm - 5 * age - 161;
  }
  return Math.round(bmr * activity);
}

export function ToolsPage() {
  const { units } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'1rm' | 'convert' | 'plates' | 'tdee' | 'wilks'>('1rm');

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Tools</h1>
          <p className="text-secondary mt-1">Calculators and utilities for your training</p>
        </div>

        {/* Tab selector */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <TabButton
            icon={<Calculator className="w-4 h-4" />}
            label="1RM Calculator"
            active={activeTab === '1rm'}
            onClick={() => setActiveTab('1rm')}
          />
          <TabButton
            icon={<Scale className="w-4 h-4" />}
            label="Unit Converter"
            active={activeTab === 'convert'}
            onClick={() => setActiveTab('convert')}
          />
          <TabButton
            icon={<Dumbbell className="w-4 h-4" />}
            label="Plate Calculator"
            active={activeTab === 'plates'}
            onClick={() => setActiveTab('plates')}
          />
          <TabButton
            icon={<Percent className="w-4 h-4" />}
            label="TDEE Calculator"
            active={activeTab === 'tdee'}
            onClick={() => setActiveTab('tdee')}
          />
          <TabButton
            icon={<Timer className="w-4 h-4" />}
            label="Wilks Score"
            active={activeTab === 'wilks'}
            onClick={() => setActiveTab('wilks')}
          />
        </div>

        {/* Calculator content */}
        {activeTab === '1rm' && <OneRMCalculator defaultUnit={units} />}
        {activeTab === 'convert' && <UnitConverter />}
        {activeTab === 'plates' && <PlateCalculator defaultUnit={units} />}
        {activeTab === 'tdee' && <TDEECalculator defaultUnit={units} />}
        {activeTab === 'wilks' && <WilksCalculator defaultUnit={units} />}
      </div>
    </div>
  );
}

function TabButton({ icon, label, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors',
        active
          ? 'bg-crimson text-white'
          : 'bg-steel text-secondary hover:text-foreground hover:bg-charcoal'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function OneRMCalculator({ defaultUnit }: { defaultUnit: 'imperial' | 'metric' }) {
  const [weight, setWeight] = useState<string>('');
  const [reps, setReps] = useState<string>('');
  const [unit, setUnit] = useState<'lb' | 'kg'>(defaultUnit === 'imperial' ? 'lb' : 'kg');

  const weightNum = parseFloat(weight) || 0;
  const repsNum = parseInt(reps) || 0;

  const results = weightNum > 0 && repsNum > 0 && repsNum <= 30
    ? calculate1RMFormulas(weightNum, repsNum)
    : null;

  const percentages = results ? calculatePercentages(results.average) : [];

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-foreground mb-4">Calculate Your 1 Rep Max</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-muted mb-1">Weight Lifted</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="135"
                className="flex-1 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'lb' | 'kg')}
                className="bg-charcoal border border-white/10 rounded-md px-2 py-2 text-foreground focus:outline-none focus:border-crimson/50"
              >
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Reps Completed</label>
            <input
              type="number"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="5"
              min={1}
              max={30}
              className="w-full bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Estimated 1RM</label>
            <div className="h-[42px] flex items-center px-3 bg-steel rounded-md text-xl font-bold text-crimson">
              {results ? `${results.average} ${unit}` : '—'}
            </div>
          </div>
        </div>

        {results && (
          <div className="mt-6 pt-4 border-t border-white/5">
            <p className="text-xs text-muted mb-3">Formula Results</p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted">Epley:</span>
                <span className="ml-2 text-foreground">{results.epley} {unit}</span>
              </div>
              <div>
                <span className="text-muted">Brzycki:</span>
                <span className="ml-2 text-foreground">{results.brzycki} {unit}</span>
              </div>
              <div>
                <span className="text-muted">Lander:</span>
                <span className="ml-2 text-foreground">{results.lander} {unit}</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {percentages.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold text-foreground mb-4">Rep-Percentage Table</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted border-b border-white/5">
                  <th className="text-left py-2">Reps</th>
                  <th className="text-left py-2">% of 1RM</th>
                  <th className="text-left py-2">Weight</th>
                </tr>
              </thead>
              <tbody>
                {percentages.map((row) => (
                  <tr key={row.reps} className="border-b border-white/5">
                    <td className="py-2 text-foreground">{row.reps}</td>
                    <td className="py-2 text-secondary">{row.percent}%</td>
                    <td className="py-2 text-foreground font-medium">{row.weight} {unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function UnitConverter() {
  const [value, setValue] = useState<string>('');
  const [fromUnit, setFromUnit] = useState<'lb' | 'kg'>('lb');

  const converted = value ? convertWeight(parseFloat(value) || 0, fromUnit, fromUnit === 'lb' ? 'kg' : 'lb') : 0;
  const toUnit = fromUnit === 'lb' ? 'kg' : 'lb';

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4">Weight Unit Converter</h2>
      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm text-muted mb-1">From</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter weight"
              className="flex-1 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
            />
            <select
              value={fromUnit}
              onChange={(e) => setFromUnit(e.target.value as 'lb' | 'kg')}
              className="bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
            >
              <option value="lb">Pounds (lb)</option>
              <option value="kg">Kilograms (kg)</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm text-muted mb-1">To</label>
          <div className="h-[42px] flex items-center justify-between px-4 bg-steel rounded-md">
            <span className="text-xl font-bold text-crimson">
              {value ? converted : '—'}
            </span>
            <span className="text-secondary">{toUnit}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-white/5">
        <p className="text-sm text-muted mb-3">Quick Reference</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[45, 135, 225, 315, 405].map((lb) => (
            <div key={lb} className="bg-steel rounded px-3 py-2">
              <span className="text-foreground">{lb} lb</span>
              <span className="text-muted mx-2">=</span>
              <span className="text-secondary">{convertWeight(lb, 'lb', 'kg')} kg</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function PlateCalculator({ defaultUnit }: { defaultUnit: 'imperial' | 'metric' }) {
  const [targetWeight, setTargetWeight] = useState<string>('');
  const [unit, setUnit] = useState<'lb' | 'kg'>(defaultUnit === 'imperial' ? 'lb' : 'kg');
  const [barWeight, setBarWeight] = useState<number>(unit === 'lb' ? 45 : 20);

  const weightNum = parseFloat(targetWeight) || 0;
  const plates = weightNum > barWeight ? calculatePlates(weightNum, barWeight, unit) : [];
  const perSideWeight = weightNum > barWeight ? (weightNum - barWeight) / 2 : 0;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4">Plate Calculator</h2>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm text-muted mb-1">Target Weight</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              placeholder="225"
              className="flex-1 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
            />
            <select
              value={unit}
              onChange={(e) => {
                const newUnit = e.target.value as 'lb' | 'kg';
                setUnit(newUnit);
                setBarWeight(newUnit === 'lb' ? 45 : 20);
              }}
              className="bg-charcoal border border-white/10 rounded-md px-2 py-2 text-foreground focus:outline-none focus:border-crimson/50"
            >
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm text-muted mb-1">Bar Weight</label>
          <select
            value={barWeight}
            onChange={(e) => setBarWeight(parseFloat(e.target.value))}
            className="w-full bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
          >
            {unit === 'lb' ? (
              <>
                <option value={45}>45 lb (Olympic)</option>
                <option value={35}>35 lb (Women's)</option>
                <option value={15}>15 lb (Technique)</option>
              </>
            ) : (
              <>
                <option value={20}>20 kg (Olympic)</option>
                <option value={15}>15 kg (Women's)</option>
                <option value={10}>10 kg (Technique)</option>
              </>
            )}
          </select>
        </div>
        <div>
          <label className="block text-sm text-muted mb-1">Per Side</label>
          <div className="h-[42px] flex items-center px-3 bg-steel rounded-md text-lg font-bold text-crimson">
            {perSideWeight > 0 ? `${perSideWeight} ${unit}` : '—'}
          </div>
        </div>
      </div>

      {plates.length > 0 && (
        <div className="pt-4 border-t border-white/5">
          <p className="text-sm text-muted mb-3">Plates per side:</p>
          <div className="flex flex-wrap gap-2">
            {plates.map((plate, i) => (
              <div
                key={i}
                className="bg-crimson/20 text-crimson border border-crimson/30 rounded-full px-4 py-2 font-medium"
              >
                {plate}
              </div>
            ))}
          </div>
        </div>
      )}

      {weightNum > 0 && weightNum <= barWeight && (
        <p className="text-sm text-yellow-500 mt-4">
          Target weight must be greater than bar weight.
        </p>
      )}
    </Card>
  );
}

function TDEECalculator({ defaultUnit }: { defaultUnit: 'imperial' | 'metric' }) {
  const [weight, setWeight] = useState<string>('');
  const [heightFeet, setHeightFeet] = useState<string>('');
  const [heightInches, setHeightInches] = useState<string>('');
  const [heightCm, setHeightCm] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [activity, setActivity] = useState<number>(1.55);
  const [useMetric, setUseMetric] = useState(defaultUnit === 'metric');

  // Calculate height in cm
  const getHeightCm = () => {
    if (useMetric) {
      return parseFloat(heightCm) || 0;
    }
    const feet = parseFloat(heightFeet) || 0;
    const inches = parseFloat(heightInches) || 0;
    return (feet * 12 + inches) * 2.54;
  };

  // Get weight in kg
  const getWeightKg = () => {
    const w = parseFloat(weight) || 0;
    return useMetric ? w : w * 0.453592;
  };

  const ageNum = parseInt(age) || 0;
  const weightKg = getWeightKg();
  const heightCmVal = getHeightCm();

  const tdee = weightKg > 0 && heightCmVal > 0 && ageNum > 0
    ? calculateTDEE(weightKg, heightCmVal, ageNum, gender, activity)
    : null;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4">TDEE Calculator</h2>
      <p className="text-sm text-muted mb-4">
        Calculate your Total Daily Energy Expenditure using the Mifflin-St Jeor equation.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-muted mb-1">Weight</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={useMetric ? "70" : "155"}
              className="flex-1 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUseMetric(!useMetric)}
              className="w-16"
            >
              {useMetric ? 'kg' : 'lb'}
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Height</label>
          {useMetric ? (
            <div className="flex gap-2">
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="175"
                className="flex-1 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
              />
              <span className="flex items-center text-muted px-2">cm</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="number"
                value={heightFeet}
                onChange={(e) => setHeightFeet(e.target.value)}
                placeholder="5"
                className="w-20 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
              />
              <span className="flex items-center text-muted">ft</span>
              <input
                type="number"
                value={heightInches}
                onChange={(e) => setHeightInches(e.target.value)}
                placeholder="10"
                className="w-20 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
              />
              <span className="flex items-center text-muted">in</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Age</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="25"
            className="w-full bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as 'male' | 'female')}
            className="w-full bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm text-muted mb-1">Activity Level</label>
        <select
          value={activity}
          onChange={(e) => setActivity(parseFloat(e.target.value))}
          className="w-full bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
        >
          <option value={1.2}>Sedentary (little or no exercise)</option>
          <option value={1.375}>Light (1-3 days/week)</option>
          <option value={1.55}>Moderate (3-5 days/week)</option>
          <option value={1.725}>Very Active (6-7 days/week)</option>
          <option value={1.9}>Extra Active (very hard daily exercise)</option>
        </select>
      </div>

      {tdee && (
        <div className="pt-4 border-t border-white/5">
          <div className="text-center mb-4">
            <p className="text-sm text-muted mb-1">Your TDEE</p>
            <p className="text-4xl font-bold text-crimson">{tdee}</p>
            <p className="text-secondary">calories/day</p>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-steel rounded-lg p-3">
              <p className="text-sm text-muted mb-1">Cut</p>
              <p className="text-lg font-semibold text-foreground">{tdee - 500}</p>
              <p className="text-xs text-muted">-500 cal</p>
            </div>
            <div className="bg-steel rounded-lg p-3">
              <p className="text-sm text-muted mb-1">Maintain</p>
              <p className="text-lg font-semibold text-crimson">{tdee}</p>
              <p className="text-xs text-muted">0 cal</p>
            </div>
            <div className="bg-steel rounded-lg p-3">
              <p className="text-sm text-muted mb-1">Bulk</p>
              <p className="text-lg font-semibold text-foreground">{tdee + 300}</p>
              <p className="text-xs text-muted">+300 cal</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function WilksCalculator({ defaultUnit }: { defaultUnit: 'imperial' | 'metric' }) {
  const [bodyweight, setBodyweight] = useState<string>('');
  const [total, setTotal] = useState<string>('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [useMetric, setUseMetric] = useState(defaultUnit === 'metric');

  // Wilks coefficients
  const maleCoefficients = [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8];
  const femaleCoefficients = [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8];

  const calculateWilks = (bw: number, liftedTotal: number, isMale: boolean): number => {
    const coeffs = isMale ? maleCoefficients : femaleCoefficients;
    let denominator = coeffs[0];
    for (let i = 1; i < coeffs.length; i++) {
      denominator += coeffs[i] * Math.pow(bw, i);
    }
    return (liftedTotal * 500) / denominator;
  };

  const bwKg = useMetric
    ? parseFloat(bodyweight) || 0
    : (parseFloat(bodyweight) || 0) * 0.453592;
  const totalKg = useMetric
    ? parseFloat(total) || 0
    : (parseFloat(total) || 0) * 0.453592;

  const wilks = bwKg > 0 && totalKg > 0
    ? calculateWilks(bwKg, totalKg, gender === 'male')
    : null;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4">Wilks Score Calculator</h2>
      <p className="text-sm text-muted mb-4">
        Calculate your Wilks coefficient for powerlifting comparisons across weight classes.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm text-muted mb-1">Bodyweight</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={bodyweight}
              onChange={(e) => setBodyweight(e.target.value)}
              placeholder={useMetric ? "80" : "175"}
              className="flex-1 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUseMetric(!useMetric)}
              className="w-16"
            >
              {useMetric ? 'kg' : 'lb'}
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Total (SBD)</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder={useMetric ? "500" : "1100"}
              className="flex-1 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
            />
            <span className="flex items-center text-muted px-2">{useMetric ? 'kg' : 'lb'}</span>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm text-muted mb-1">Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as 'male' | 'female')}
            className="w-full bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      {wilks && (
        <div className="pt-4 border-t border-white/5 text-center">
          <p className="text-sm text-muted mb-1">Wilks Score</p>
          <p className="text-4xl font-bold text-crimson">{wilks.toFixed(2)}</p>
          <p className="text-sm text-muted mt-2">
            {wilks < 300 ? 'Beginner' :
             wilks < 400 ? 'Intermediate' :
             wilks < 450 ? 'Advanced' :
             wilks < 500 ? 'Elite' : 'World Class'}
          </p>
        </div>
      )}
    </Card>
  );
}
