import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSplitsListWithOptions, useDeleteSplit, useDuplicateSplit } from '../../../src/hooks/useSplits';
import { Spinner, Card, Button, InfoButton } from '../../../src/components/ui';
import { HELP_CONTENT } from '../../../src/data/helpContent';
import { getErrorMessage } from '../../../src/api/client';
import { colors, typography, spacing, borders } from '../../../src/theme';
import type { SplitResponse } from '../../../src/types/api.types';

export default function SplitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, error } = useSplitsListWithOptions({ includeExercises: false });
  const deleteMutation = useDeleteSplit();
  const duplicateMutation = useDuplicateSplit();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const splits = data?.splits ?? [];

  const handleDuplicate = async (split: SplitResponse) => {
    try {
      const newSplit = await duplicateMutation.mutateAsync(split.id);
      router.push(`/(tabs)/splits/${newSplit.id}`);
    } catch (err) {
      Alert.alert('Duplicate failed', getErrorMessage(err));
    }
  };

  const handleDelete = (split: SplitResponse) => {
    setPendingDeleteId(split.id);
  };

  const confirmDelete = async (split: SplitResponse) => {
    try {
      await deleteMutation.mutateAsync(split.id);
      setPendingDeleteId(null);
    } catch (err) {
      Alert.alert('Delete failed', getErrorMessage(err));
    }
  };

  const renderSplit = ({ item }: { item: SplitResponse }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push(`/(tabs)/splits/${item.id}`)}
    >
      <Card style={styles.splitCard}>
        <View style={styles.splitCardHeader}>
          <Text style={styles.splitName}>{item.name}</Text>
          <View style={styles.cardActions}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/(tabs)/splits/${item.id}`);
              }}
              hitSlop={10}
            >
              <Ionicons name="pencil-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleDuplicate(item);
              }}
              hitSlop={10}
            >
              <Ionicons name="copy-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleDelete(item);
              }}
              hitSlop={10}
            >
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.splitMeta}>
          <Text style={styles.metaText}>
            {item.sessions.length} session{item.sessions.length !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.metaDot}>&middot;</Text>
          <Text style={styles.metaText}>{item.dataset}</Text>
          <Text style={styles.metaDot}>&middot;</Text>
          <Text style={styles.metaText}>
            {new Date(item.updated_at).toLocaleDateString()}
          </Text>
        </View>
        {pendingDeleteId === item.id && (
          <View style={styles.inlineConfirm}>
            <Text style={styles.inlineConfirmText}>Delete this split?</Text>
            <View style={styles.inlineConfirmActions}>
              <TouchableOpacity
                style={styles.inlineCancelBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  setPendingDeleteId(null);
                }}
                disabled={deleteMutation.isPending}
              >
                <Text style={styles.inlineCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inlineDeleteBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  confirmDelete(item);
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Spinner />
                ) : (
                  <Text style={styles.inlineDeleteText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Splits</Text>
          <InfoButton title={HELP_CONTENT['splits.overview'].title} body={HELP_CONTENT['splits.overview'].body} />
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.compareBtn}
            onPress={() => router.push('/(tabs)/more/exercises')}
          >
            <Ionicons name="create-outline" size={16} color={colors.text} />
            <Text style={styles.compareBtnText}>Exercises</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.compareBtn}
            onPress={() => router.push('/(tabs)/splits/compare')}
          >
            <Ionicons name="git-compare-outline" size={16} color={colors.text} />
            <Text style={styles.compareBtnText}>Compare</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/(tabs)/splits/create')}
          >
            <Ionicons name="add" size={22} color={colors.bg} />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <Spinner style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load splits</Text>
        </View>
      ) : splits.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="barbell-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Splits Yet</Text>
          <Text style={styles.emptySubtitle}>Create your first training split to get started</Text>
          <Button
            title="Create Split"
            onPress={() => router.push('/(tabs)/splits/create')}
            style={styles.createBtn}
          />
        </View>
      ) : (
        <FlatList
          data={splits}
          keyExtractor={(item) => item.id}
          renderItem={renderSplit}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  compareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
  },
  compareBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  splitCard: {
    marginBottom: 12,
  },
  splitCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  splitName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  splitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: 13,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  createBtn: {
    paddingHorizontal: 32,
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
  },
  inlineConfirm: {
    marginTop: 10,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    borderRadius: borders.radius.lg,
    backgroundColor: colors.surfaceElevated,
    padding: 10,
    gap: 8,
  },
  inlineConfirmText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  inlineConfirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  inlineCancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borders.radius.md,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
  },
  inlineCancelText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineDeleteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borders.radius.md,
    backgroundColor: colors.red,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineDeleteText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
});
