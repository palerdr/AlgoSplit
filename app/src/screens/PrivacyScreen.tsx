import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import FadeIn from '../ui/FadeIn';
import Glass from '../ui/Glass';

export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ??
  'https://algo-split.vercel.app/privacy.html';

interface PrivacyScreenProps {
  onBack: () => void;
}

const sections = [
  {
    title: 'Information you provide',
    body: 'AlgoSplit stores your email and account identifier, saved splits, workout history, sets, reps, weight, reps in reserve, bodyweight entries, and notes you choose to enter.',
  },
  {
    title: 'How it is used',
    body: 'This information is used only to authenticate your account, synchronize your training data, analyze workout stimulus, and display your history and progress.',
  },
  {
    title: 'Storage and service providers',
    body: 'Account and training data are processed by the infrastructure providers used to operate AlgoSplit, including authentication, database, API hosting, and web hosting services. AlgoSplit does not sell personal information or use it for cross-app tracking.',
  },
  {
    title: 'Retention and deletion',
    body: 'Account data is retained while your account is active. You can permanently delete your account and associated training data from the Account screen. Limited security logs or backups may remain temporarily where required for service integrity or legal compliance.',
  },
  {
    title: 'Security and your choices',
    body: 'Data is encrypted in transit and access is restricted by account authorization controls. You may sign out, request a password reset, or delete your account at any time. Additional privacy contact information is available through the AlgoSplit App Store support listing.',
  },
];

export default function PrivacyScreen({ onBack }: PrivacyScreenProps) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backWrap}>
        <Glass style={styles.backChip} interactive>
          <Text style={styles.backText}>‹ Back</Text>
        </Glass>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Text style={styles.eyebrow}>ALGOSPLIT</Text>
          <Text style={styles.title}>Privacy Policy</Text>
          <Text style={styles.updated}>Effective July 15, 2026</Text>
        </FadeIn>
        {sections.map((section, index) => (
          <FadeIn key={section.title} delay={40 + index * 35}>
            <Glass style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </Glass>
          </FadeIn>
        ))}
        <Pressable
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
          accessibilityRole="link"
        >
          <Text style={styles.webLink}>Open the public web policy</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  backWrap: { position: 'absolute', top: 58, left: 20, zIndex: 4 },
  backChip: { borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16 },
  backText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 24, paddingTop: 124, paddingBottom: 56 },
  eyebrow: { color: theme.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },
  title: { color: theme.text, fontSize: 34, fontWeight: '700' },
  updated: { color: theme.textDim, fontSize: 12, marginTop: 7, marginBottom: 24 },
  section: { borderRadius: 22, padding: 19, marginBottom: 12 },
  sectionTitle: { color: theme.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  body: { color: theme.textDim, fontSize: 13, lineHeight: 20 },
  webLink: { color: theme.accent, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 12 },
});
