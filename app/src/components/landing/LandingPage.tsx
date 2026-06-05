import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

const ACCENT = '#4ADE80';
const ACCENT_DARK = '#22C55E';
const IRON = '#0a0a0b';
const CHARCOAL = '#121214';
const STEEL = '#1a1a1e';
const FOREGROUND = '#fafafa';
const SECONDARY = '#a1a1a6';
const MUTED = '#636366';
const FAINT = '#3a3a3d';

// Stimulus heatmap colors for the mockup chart — use the canonical 0–7 ramp
// so the landing mockup matches what the product actually renders.
const STIMULUS_COLORS = colors.stimulus;

// ─── Feature Card ────────────────────────────────────────────────

function FeatureCard({ icon, title, description }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIconWrap}>
        <Ionicons name={icon} size={20} color={ACCENT} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDesc}>{description}</Text>
    </View>
  );
}

// ─── Stimulus Mockup Chart ───────────────────────────────────────

const MOCKUP_DATA = [
  { name: 'Quads', level: 7 },
  { name: 'Chest', level: 6 },
  { name: 'Back', level: 6 },
  { name: 'Shoulders', level: 5 },
  { name: 'Hamstrings', level: 4 },
  { name: 'Biceps', level: 3 },
  { name: 'Triceps', level: 3 },
  { name: 'Calves', level: 1 },
];

function StimulusMockup() {
  return (
    <View style={styles.mockupContainer}>
      <Text style={styles.mockupTitle}>Weekly Stimulus</Text>
      {MOCKUP_DATA.map((item) => (
        <View key={item.name} style={styles.mockupRow}>
          <Text style={styles.mockupLabel}>{item.name}</Text>
          <View style={styles.mockupTrack}>
            <View
              style={[
                styles.mockupBar,
                {
                  width: `${(item.level / 7) * 100}%`,
                  backgroundColor: STIMULUS_COLORS[item.level],
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Main Landing Page ───────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      {/* ── Nav ── */}
      <View style={styles.nav}>
        <View style={styles.navInner}>
          <View style={styles.navLeft}>
            <View style={styles.logoBox}>
              <Ionicons name="pulse" size={16} color="#111" />
            </View>
            <Text style={styles.logoText}>AlgoSplit</Text>
          </View>
          <View style={styles.navRight}>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.navLink}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navCta}
              onPress={() => router.push('/(auth)/signup')}
            >
              <Text style={styles.navCtaText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Hero ── */}
      <View style={[styles.heroSection, isWide && styles.heroSectionWide]}>
        <View style={[styles.heroLeft, isWide && styles.heroLeftWide]}>
          <Text style={styles.heroHeadline}>
            Stop guessing,{'\n'}
            <Text style={styles.heroAccent}>start training</Text>
          </Text>
          <Text style={styles.heroSub}>
            The research-backed maximalist tracking app that models stimulus, fatigue, and recovery across muscle-fiber specific regions to optimize your training.
          </Text>
          <View style={styles.heroCtas}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push('/(auth)/signup')}
            >
              <Text style={styles.primaryBtnText}>Start Analyzing Free</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={styles.secondaryBtnText}>Log In</Text>
            </TouchableOpacity>
          </View>
        </View>
        {isWide && (
          <View style={styles.heroRight}>
            <StimulusMockup />
          </View>
        )}
      </View>

      {/* ── Features ── */}
      <View style={[styles.featuresSection, isWide && styles.featuresSectionWide]}>
        <FeatureCard
          icon="body-outline"
          title="29-Region Muscle Model"
          description="Granular anatomical mapping from your clavicular chest to the gastroc. Every set is tracked at the sub-muscle level."
        />
        <FeatureCard
          icon="bar-chart-outline"
          title="Stimulus & Fatigue Modeling"
          description="Calculates net weekly stimulus accounting for diminishing returns, CNS fatigue, axial load, and recovery windows."
        />
        <FeatureCard
          icon="flash-outline"
          title="Split Optimization"
          description="Compare splits side-by-side and get actionable suggestions to balance volume, frequency, and recovery."
        />
      </View>

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <Text style={styles.footerBrand}>AlgoSplit</Text>
        <Text style={styles.footerTag}>Research-backed training optimization</Text>
      </View>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: IRON,
  },
  pageContent: {
    minHeight: '100%',
  },

  // Nav
  nav: {
    backgroundColor: 'rgba(10, 10, 11, 0.85)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  navInner: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: FOREGROUND,
    fontSize: 18,
    fontWeight: '700',
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  navLink: {
    color: SECONDARY,
    fontSize: 14,
    fontWeight: '500',
  },
  navCta: {
    backgroundColor: ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  navCtaText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '600',
  },

  // Hero
  heroSection: {
    paddingTop: 60,
    paddingBottom: 48,
    paddingHorizontal: 24,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  heroSectionWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 48,
  },
  heroLeft: {
    flex: 1,
  },
  heroLeftWide: {
    flex: 1,
  },
  heroRight: {
    flex: 1,
    alignItems: 'center',
  },
  heroHeadline: {
    color: FOREGROUND,
    fontSize: 42,
    fontWeight: '800',
    lineHeight: 50,
    letterSpacing: -0.5,
  },
  heroAccent: {
    color: ACCENT,
  },
  heroSub: {
    color: SECONDARY,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
    maxWidth: 480,
  },
  heroCtas: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
  },
  primaryBtn: {
    backgroundColor: ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 6,
  },
  primaryBtnText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: STEEL,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  secondaryBtnText: {
    color: FOREGROUND,
    fontSize: 15,
    fontWeight: '600',
  },

  // Mockup
  mockupContainer: {
    backgroundColor: CHARCOAL,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  mockupTitle: {
    color: FOREGROUND,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 14,
  },
  mockupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  mockupLabel: {
    color: SECONDARY,
    fontSize: 12,
    width: 80,
    fontWeight: '500',
  },
  mockupTrack: {
    flex: 1,
    height: 16,
    backgroundColor: STEEL,
    borderRadius: 3,
    overflow: 'hidden',
  },
  mockupBar: {
    height: '100%',
    borderRadius: 3,
  },

  // Features
  featuresSection: {
    paddingBottom: 48,
    paddingHorizontal: 24,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  featuresSectionWide: {
    flexDirection: 'row',
  },
  featureCard: {
    flex: 1,
    backgroundColor: CHARCOAL,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    color: FOREGROUND,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  featureDesc: {
    color: SECONDARY,
    fontSize: 13,
    lineHeight: 19,
  },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  footerBrand: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '500',
  },
  footerTag: {
    color: MUTED,
    fontSize: 11,
  },
});
