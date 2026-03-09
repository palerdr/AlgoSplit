import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Path, G, Ellipse, Rect } from 'react-native-svg';
import { colors } from '../../theme';

// Each muscle region maps to a backend region_id
interface MuscleRegionPath {
  id: string;
  displayName: string;
  view: 'front' | 'back' | 'both';
  // SVG path data (d attribute)
  paths: string[];
}

// Colors for stimulus levels 0-7
const STIMULUS_COLORS = colors.stimulus;
const DEFAULT_FILL = '#1E1E1E';
const OUTLINE_COLOR = '#2A2A2A';

interface MuscleMapProps {
  /** Map of region_id → stimulus level (0-7) */
  stimulusLevels?: Record<string, number>;
  width?: number;
  height?: number;
  onRegionPress?: (regionId: string) => void;
}

// ─── SVG BODY PATHS ─────────────────────────────────────────
// ViewBox: 0 0 200 480
// Anatomical body with 29 individually colorable muscle regions

const FRONT_REGIONS: MuscleRegionPath[] = [
  // ── CHEST ──
  {
    id: 'clavicular',
    displayName: 'Upper Chest',
    view: 'front',
    paths: [
      // Left upper chest (clavicular fibers)
      'M72,95 Q75,88 88,85 L100,87 L100,100 Q88,98 78,100 Z',
      // Right upper chest
      'M128,95 Q125,88 112,85 L100,87 L100,100 Q112,98 122,100 Z',
    ],
  },
  {
    id: 'sternocostal',
    displayName: 'Mid-Lower Chest',
    view: 'front',
    paths: [
      // Left mid-lower chest
      'M78,100 Q88,98 100,100 L100,125 Q90,128 80,122 Z',
      // Right mid-lower chest
      'M122,100 Q112,98 100,100 L100,125 Q110,128 120,122 Z',
    ],
  },

  // ── SHOULDERS (front-visible) ──
  {
    id: 'anterior_deltoid',
    displayName: 'Front Delt',
    view: 'front',
    paths: [
      // Left anterior delt
      'M72,82 Q65,78 60,82 Q58,90 60,100 L72,95 Z',
      // Right
      'M128,82 Q135,78 140,82 Q142,90 140,100 L128,95 Z',
    ],
  },
  {
    id: 'lateral_deltoid',
    displayName: 'Side Delt',
    view: 'both',
    paths: [
      // Left lateral delt (front view - outer edge)
      'M60,82 Q54,80 52,86 Q50,95 55,104 L60,100 Q58,90 60,82 Z',
      // Right
      'M140,82 Q146,80 148,86 Q150,95 145,104 L140,100 Q142,90 140,82 Z',
    ],
  },

  // ── BICEPS ──
  {
    id: 'biceps_brachii',
    displayName: 'Biceps',
    view: 'front',
    paths: [
      // Left bicep
      'M55,108 Q50,106 48,114 Q46,130 48,148 Q50,155 55,158 Q60,155 62,148 Q64,130 62,114 Q60,106 55,108 Z',
      // Right bicep
      'M145,108 Q150,106 152,114 Q154,130 152,148 Q150,155 145,158 Q140,155 138,148 Q136,130 138,114 Q140,106 145,108 Z',
    ],
  },
  {
    id: 'brachialis',
    displayName: 'Brachialis',
    view: 'front',
    paths: [
      // Left brachialis (outer/lower bicep)
      'M48,148 Q46,155 46,165 Q48,172 52,172 L55,158 Q50,155 48,148 Z',
      // Right
      'M152,148 Q154,155 154,165 Q152,172 148,172 L145,158 Q150,155 152,148 Z',
    ],
  },

  // ── FOREARMS (front) ──
  {
    id: 'brachioradialis',
    displayName: 'Brachioradialis',
    view: 'front',
    paths: [
      // Left
      'M46,165 Q44,175 42,190 Q40,205 40,215 L45,215 Q46,200 48,185 Q50,175 52,172 Z',
      // Right
      'M154,165 Q156,175 158,190 Q160,205 160,215 L155,215 Q154,200 152,185 Q150,175 148,172 Z',
    ],
  },
  {
    id: 'wrist_flexors',
    displayName: 'Wrist Flexors',
    view: 'front',
    paths: [
      // Left inner forearm
      'M52,172 Q54,180 54,195 Q54,210 52,220 L45,215 Q46,200 46,190 Q46,180 46,165 Z',
      // Right
      'M148,172 Q146,180 146,195 Q146,210 148,220 L155,215 Q154,200 154,190 Q154,180 154,165 Z',
    ],
  },

  // ── ABS ──
  {
    id: 'anterior_core',
    displayName: 'Abs',
    view: 'front',
    paths: [
      // Rectus abdominis - center column
      'M92,128 L108,128 L108,220 Q104,225 100,226 Q96,225 92,220 Z',
    ],
  },
  {
    id: 'lateral_core',
    displayName: 'Obliques',
    view: 'front',
    paths: [
      // Left oblique
      'M80,122 L92,128 L92,220 Q88,222 84,218 Q80,210 78,195 Q76,175 78,155 Q79,140 80,122 Z',
      // Right oblique
      'M120,122 L108,128 L108,220 Q112,222 116,218 Q120,210 122,195 Q124,175 122,155 Q121,140 120,122 Z',
    ],
  },

  // ── QUADS ──
  {
    id: 'rectus_femoris',
    displayName: 'Rectus Femoris',
    view: 'front',
    paths: [
      // Left rectus femoris (center quad)
      'M85,235 Q88,232 92,234 L92,320 Q88,325 85,325 Q82,322 82,315 L85,235 Z',
      // Right
      'M115,235 Q112,232 108,234 L108,320 Q112,325 115,325 Q118,322 118,315 L115,235 Z',
    ],
  },
  {
    id: 'vasti',
    displayName: 'Vasti',
    view: 'front',
    paths: [
      // Left vastus lateralis (outer quad)
      'M78,235 L85,235 L82,315 Q80,322 76,320 Q72,315 72,300 Q72,280 74,260 Q76,245 78,235 Z',
      // Left vastus medialis (inner quad, teardrop)
      'M92,234 L96,234 Q98,240 98,260 Q98,290 96,315 Q94,320 92,320 Z',
      // Right vastus lateralis
      'M122,235 L115,235 L118,315 Q120,322 124,320 Q128,315 128,300 Q128,280 126,260 Q124,245 122,235 Z',
      // Right vastus medialis
      'M108,234 L104,234 Q102,240 102,260 Q102,290 104,315 Q106,320 108,320 Z',
    ],
  },

  // ── ADDUCTORS ──
  {
    id: 'hip_adductors',
    displayName: 'Adductors',
    view: 'front',
    paths: [
      // Left adductor
      'M96,234 Q98,232 100,232 L100,300 Q98,305 96,300 Q94,280 96,234 Z',
      // Right adductor
      'M104,234 Q102,232 100,232 L100,300 Q102,305 104,300 Q106,280 104,234 Z',
    ],
  },

  // ── CALVES (front) ──
  {
    id: 'gastrocnemius',
    displayName: 'Gastrocnemius',
    view: 'both',
    paths: [
      // Left calf front view (tibialis area visible, gastroc mostly back)
      'M78,340 Q80,335 84,335 Q88,338 88,350 Q88,370 86,390 Q84,400 82,400 Q78,398 76,390 Q74,370 76,350 Q77,342 78,340 Z',
      // Right
      'M122,340 Q120,335 116,335 Q112,338 112,350 Q112,370 114,390 Q116,400 118,400 Q122,398 124,390 Q126,370 124,350 Q123,342 122,340 Z',
    ],
  },
  {
    id: 'soleus',
    displayName: 'Soleus',
    view: 'both',
    paths: [
      // Left soleus (lower calf)
      'M82,400 Q84,400 86,398 Q88,405 88,420 Q86,432 82,435 Q78,432 76,420 Q76,408 78,400 Z',
      // Right
      'M118,400 Q116,400 114,398 Q112,405 112,420 Q114,432 118,435 Q122,432 124,420 Q124,408 122,400 Z',
    ],
  },
];

const BACK_REGIONS: MuscleRegionPath[] = [
  // ── UPPER BACK ──
  {
    id: 'trapezius',
    displayName: 'Traps',
    view: 'back',
    paths: [
      // Upper traps - diamond shape from neck to shoulders
      'M100,65 L75,82 Q80,92 85,95 L100,100 L115,95 Q120,92 125,82 Z',
    ],
  },
  {
    id: 'rhomboids',
    displayName: 'Rhomboids',
    view: 'back',
    paths: [
      // Between shoulder blades
      'M85,95 L100,100 L100,125 Q94,122 88,118 Q84,112 85,95 Z',
      'M115,95 L100,100 L100,125 Q106,122 112,118 Q116,112 115,95 Z',
    ],
  },

  // ── SHOULDERS (back) ──
  {
    id: 'posterior_deltoid',
    displayName: 'Rear Delt',
    view: 'back',
    paths: [
      // Left rear delt
      'M75,82 Q68,78 62,82 Q58,88 58,98 L68,102 Q72,95 75,82 Z',
      // Right rear delt
      'M125,82 Q132,78 138,82 Q142,88 142,98 L132,102 Q128,95 125,82 Z',
    ],
  },

  // ── LATS ──
  {
    id: 'thoracic_lats',
    displayName: 'Upper Lats',
    view: 'back',
    paths: [
      // Left upper lat
      'M68,102 L85,95 Q84,112 82,125 L78,130 Q72,125 70,115 Q68,108 68,102 Z',
      // Right
      'M132,102 L115,95 Q116,112 118,125 L122,130 Q128,125 130,115 Q132,108 132,102 Z',
    ],
  },
  {
    id: 'iliac_lats',
    displayName: 'Lower Lats',
    view: 'back',
    paths: [
      // Left lower lat
      'M78,130 L82,125 Q88,128 92,130 L92,165 Q86,168 82,162 Q78,150 78,130 Z',
      // Right
      'M122,130 L118,125 Q112,128 108,130 L108,165 Q114,168 118,162 Q122,150 122,130 Z',
    ],
  },

  // ── LOWER BACK ──
  {
    id: 'spinal_erectors',
    displayName: 'Spinal Erectors',
    view: 'back',
    paths: [
      // Erector spinae - two vertical strips along spine
      'M92,130 L100,125 L108,130 L108,220 Q104,225 100,226 Q96,225 92,220 Z',
    ],
  },

  // ── TRICEPS ──
  {
    id: 'triceps_long_head',
    displayName: 'Triceps Long Head',
    view: 'back',
    paths: [
      // Left long head (inner/back of arm)
      'M58,108 Q55,112 54,125 Q52,140 54,155 Q56,160 58,158 Q60,150 60,135 Q60,120 58,108 Z',
      // Right
      'M142,108 Q145,112 146,125 Q148,140 146,155 Q144,160 142,158 Q140,150 140,135 Q140,120 142,108 Z',
    ],
  },
  {
    id: 'triceps_lateral_medial',
    displayName: 'Triceps Lateral',
    view: 'back',
    paths: [
      // Left lateral/medial heads
      'M58,108 L68,102 Q66,110 64,125 Q62,140 62,155 Q60,160 58,158 Q56,160 54,155 Q52,140 54,125 Q55,112 58,108 Z',
      // Right
      'M142,108 L132,102 Q134,110 136,125 Q138,140 138,155 Q140,160 142,158 Q144,160 146,155 Q148,140 146,125 Q145,112 142,108 Z',
    ],
  },

  // ── FOREARMS (back) ──
  {
    id: 'wrist_extensors',
    displayName: 'Wrist Extensors',
    view: 'back',
    paths: [
      // Left forearm back
      'M54,168 Q52,175 48,190 Q44,210 42,225 L50,225 Q52,210 54,195 Q56,180 58,172 Z',
      // Right
      'M146,168 Q148,175 152,190 Q156,210 158,225 L150,225 Q148,210 146,195 Q144,180 142,172 Z',
    ],
  },

  // ── GLUTES ──
  {
    id: 'glute_max',
    displayName: 'Glute Max',
    view: 'back',
    paths: [
      // Left glute max
      'M84,218 Q92,220 100,222 L100,252 Q92,260 84,255 Q78,248 78,238 Q80,228 84,218 Z',
      // Right
      'M116,218 Q108,220 100,222 L100,252 Q108,260 116,255 Q122,248 122,238 Q120,228 116,218 Z',
    ],
  },
  {
    id: 'glute_med_min',
    displayName: 'Glute Med/Min',
    view: 'back',
    paths: [
      // Left glute med (upper/outer)
      'M82,210 Q80,215 78,225 Q78,238 84,218 Q82,210 82,210 Z',
      // Right
      'M118,210 Q120,215 122,225 Q122,238 116,218 Q118,210 118,210 Z',
    ],
  },

  // ── HAMSTRINGS ──
  {
    id: 'hip_extensors',
    displayName: 'Ham (Hip Ext)',
    view: 'back',
    paths: [
      // Left upper hamstring
      'M82,255 Q88,262 94,258 L94,310 Q88,315 82,310 Q76,300 76,280 Q78,265 82,255 Z',
      // Right
      'M118,255 Q112,262 106,258 L106,310 Q112,315 118,310 Q124,300 124,280 Q122,265 118,255 Z',
    ],
  },
  {
    id: 'knee_flexors',
    displayName: 'Ham (Knee Flex)',
    view: 'back',
    paths: [
      // Left lower hamstring
      'M82,310 Q88,315 94,310 L94,340 Q90,345 86,345 Q82,342 80,335 Q80,320 82,310 Z',
      // Right
      'M118,310 Q112,315 106,310 L106,340 Q110,345 114,345 Q118,342 120,335 Q120,320 118,310 Z',
    ],
  },
];

// Deep core is not visualizable - it's the transverse abdominis
const DEEP_CORE: MuscleRegionPath = {
  id: 'deep_core',
  displayName: 'Deep Core',
  view: 'front',
  paths: [], // Not visible, but we track it
};

function getRegionColor(regionId: string, stimulusLevels?: Record<string, number>): string {
  if (!stimulusLevels || !(regionId in stimulusLevels)) return DEFAULT_FILL;
  const level = Math.min(7, Math.max(0, stimulusLevels[regionId]));
  return STIMULUS_COLORS[level];
}

export default function MuscleMap({
  stimulusLevels,
  width = 160,
  height = 400,
  onRegionPress,
}: MuscleMapProps) {
  const [view, setView] = useState<'front' | 'back'>('front');

  const regions = view === 'front' ? FRONT_REGIONS : BACK_REGIONS;

  return (
    <View style={[styles.container, { width }]}>
      <Svg
        width={width}
        height={height}
        viewBox="0 0 200 480"
        style={styles.svg}
      >
        {/* Body outline / skin */}
        <G opacity={0.15}>
          {/* Head */}
          <Ellipse cx={100} cy={35} rx={18} ry={22} fill="#666" />
          {/* Neck */}
          <Rect x={90} y={55} width={20} height={12} rx={4} fill="#666" />
        </G>

        {/* Muscle regions */}
        {regions.map((region) => {
          const fill = getRegionColor(region.id, stimulusLevels);
          return (
            <G
              key={region.id}
              onPress={() => onRegionPress?.(region.id)}
            >
              {region.paths.map((d, i) => (
                <Path
                  key={`${region.id}-${i}`}
                  d={d}
                  fill={fill}
                  stroke={OUTLINE_COLOR}
                  strokeWidth={0.5}
                />
              ))}
            </G>
          );
        })}
      </Svg>

      {/* Front/Back toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, view === 'front' && styles.toggleActive]}
          onPress={() => setView('front')}
        >
          <Text style={[styles.toggleText, view === 'front' && styles.toggleTextActive]}>
            Front
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, view === 'back' && styles.toggleActive]}
          onPress={() => setView('back')}
        >
          <Text style={[styles.toggleText, view === 'back' && styles.toggleTextActive]}>
            Back
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Export region IDs for reference
export const ALL_FRONT_REGION_IDS = FRONT_REGIONS.map(r => r.id);
export const ALL_BACK_REGION_IDS = BACK_REGIONS.map(r => r.id);
export const ALL_REGION_IDS = [
  ...new Set([...FRONT_REGIONS, ...BACK_REGIONS, DEEP_CORE].map(r => r.id)),
];

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  svg: {
    backgroundColor: 'transparent',
  },
  toggleRow: {
    flexDirection: 'row',
    marginTop: 8,
    backgroundColor: '#141414',
    borderRadius: 10,
    padding: 2,
    borderWidth: 0.5,
    borderColor: '#1E1E1E',
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toggleActive: {
    backgroundColor: '#2A2A2A',
  },
  toggleText: {
    color: '#555',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  toggleTextActive: {
    color: '#E8E8E8',
  },
});
