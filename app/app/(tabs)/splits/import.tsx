import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Spinner } from '../../../src/components/ui';
import { useImportPreview } from '../../../src/hooks/useImports';
import { pickAndParseSpreadsheet } from '../../../src/utils/spreadsheetParser';
import { useSplitCreateStore } from '../../../src/stores/splitCreateStore';
import { getErrorMessage } from '../../../src/api/client';
import { generateExerciseId, generateSessionId } from '../../../src/utils/splitEditHelpers';
import { colors, typography, spacing, borders } from '../../../src/theme';
import type { ImportPreviewResponse, SessionInput } from '../../../src/types/api.types';

export default function ImportSplitScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const previewMutation = useImportPreview();
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const handlePickFile = async () => {
    setParseError(null);
    setPreview(null);
    setParsing(true);
    try {
      const picked = await pickAndParseSpreadsheet();
      if (!picked) return; // user cancelled
      const result = await previewMutation.mutateAsync({
        sheets: picked.sheets,
        split_name_hint: picked.fileName,
      });
      setPreview(result);
    } catch (err) {
      setParseError(getErrorMessage(err));
    } finally {
      setParsing(false);
    }
  };

  const handleReview = () => {
    if (!preview?.split) return;

    // Build builder sessions with client ids, remembering which exercise ids
    // need review so the builder can badge them.
    const flags: Record<string, 'ambiguous' | 'unrecognized'> = {};
    const sessions: SessionInput[] = preview.split.sessions.map((session, si) => ({
      id: generateSessionId(),
      name: session.name,
      day: session.day_number,
      exercises: session.exercises.map((ex, ei) => {
        const id = generateExerciseId();
        const status = preview.exercises.find(
          (s) => s.session_index === si && s.exercise_index === ei,
        )?.status;
        if (status === 'ambiguous' || status === 'unrecognized') {
          flags[id] = status;
        }
        return { id, name: ex.name, sets: ex.sets, unilateral: ex.unilateral || undefined };
      }),
    }));

    // Reset first so dataset/cycle/stimulus values from an abandoned manual
    // draft don't silently apply to the imported split.
    useSplitCreateStore.getState().reset();
    useSplitCreateStore.setState({
      splitName: preview.split.name,
      sessions,
      importFlags: flags,
    });
    router.replace('/(tabs)/splits/create');
  };

  const busy = parsing || previewMutation.isPending;
  const flaggedCount = preview
    ? preview.exercises.filter((e) => e.status !== 'matched').length
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Ionicons
          name="chevron-back"
          size={24}
          color={colors.text}
          onPress={() => router.back()}
        />
        <Text style={styles.title}>Import Split</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Ionicons name="cloud-upload-outline" size={40} color={colors.green} />
          <Text style={styles.cardTitle}>Bring your split from a spreadsheet</Text>
          <Text style={styles.cardBody}>
            Upload a CSV, Excel, or exported Google Sheets file. Exercises organized by
            day — rows, columns, or sections — are detected automatically, and you can
            review everything before saving.
          </Text>
          <Button
            title={busy ? 'Reading file…' : 'Choose File'}
            onPress={handlePickFile}
            loading={busy}
            style={styles.pickBtn}
          />
        </Card>

        {parseError && (
          <Card style={styles.card}>
            <Text style={styles.errorText}>{parseError}</Text>
          </Card>
        )}

        {busy && <Spinner style={{ marginTop: spacing.lg }} />}

        {preview && !busy && (
          <Card style={styles.resultCard}>
            {preview.split ? (
              <>
                <Text style={styles.resultTitle}>{preview.split.name}</Text>
                <View style={styles.statRow}>
                  <Text style={styles.statText}>
                    {preview.split.sessions.length} session
                    {preview.split.sessions.length !== 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.statDot}>&middot;</Text>
                  <Text style={styles.statText}>
                    {preview.exercises.length} exercise{preview.exercises.length !== 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.statDot}>&middot;</Text>
                  <Text style={styles.statText}>
                    {Math.round(preview.confidence * 100)}% recognized
                  </Text>
                </View>

                {preview.split.sessions.map((session) => (
                  <View key={`${session.day_number}-${session.name}`} style={styles.sessionRow}>
                    <Text style={styles.sessionName}>
                      Day {session.day_number} — {session.name}
                    </Text>
                    <Text style={styles.sessionMeta}>
                      {session.exercises.length} exercise{session.exercises.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                ))}

                {flaggedCount > 0 && (
                  <View style={styles.flagNotice}>
                    <Ionicons name="alert-circle-outline" size={15} color={colors.yellow} />
                    <Text style={styles.flagNoticeText}>
                      {flaggedCount} exercise{flaggedCount !== 1 ? 's' : ''} need
                      {flaggedCount === 1 ? 's' : ''} review — they&apos;ll be highlighted in
                      the editor
                    </Text>
                  </View>
                )}

                {preview.warnings.map((warning) => (
                  <Text key={warning} style={styles.warningText}>
                    {warning}
                  </Text>
                ))}

                <Button title="Review & Edit" onPress={handleReview} style={styles.reviewBtn} />
              </>
            ) : (
              <>
                <Text style={styles.resultTitle}>No split found</Text>
                {preview.warnings.map((warning) => (
                  <Text key={warning} style={styles.warningText}>
                    {warning}
                  </Text>
                ))}
              </>
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardBody: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  pickBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: 32,
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    textAlign: 'center',
  },
  resultCard: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  resultTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  statText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  statDot: {
    color: colors.textMuted,
    fontSize: 13,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  sessionName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  sessionMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  flagNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borders.radius.md,
    backgroundColor: colors.yellowMuted,
  },
  flagNoticeText: {
    color: colors.yellow,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  warningText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  reviewBtn: {
    marginTop: spacing.md,
  },
});
