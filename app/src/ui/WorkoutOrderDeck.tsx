import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { theme } from '../theme';
import Glass from './Glass';

export type WorkoutOrderDeckVariant = 'preflight' | 'live';

/** UI-only snapshot shared by preflight and the live workout order editor. */
export interface WorkoutOrderDeckItem {
  /** Stable identity for this occurrence, even when an exercise is repeated. */
  key: string;
  name: string;
  targetSets: number;
  completedSets: number;
  warmupEnabled: boolean;
  warmupLocked: boolean;
  current: boolean;
  draggable: boolean;
}

export interface WorkoutOrderDeckProps {
  variant: WorkoutOrderDeckVariant;
  items: readonly WorkoutOrderDeckItem[];
  /** Receives the complete next order after a touch or accessibility move. */
  onReorder: (
    items: WorkoutOrderDeckItem[],
    movement: { from: number; to: number }
  ) => void;
  onWarmupChange?: (key: string, enabled: boolean) => void;
  /** Preflight-only: atomically enable or disable every warm-up. */
  onAllWarmupsChange?: (enabled: boolean) => void;
  onDragStateChange?: (dragging: boolean) => void;
  /** Live-only: jump directly to the selected exercise. */
  onJumpTo?: (key: string, index: number) => void;
  onAddExercise?: () => void;
  onCancel?: () => void;
  onPrimaryAction: () => void;
  title?: string;
  subtitle?: string;
  primaryLabel?: string;
  disabled?: boolean;
  primaryDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const tick = () => Haptics.selectionAsync().catch(() => {});

function normalizedCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function moveItem(
  items: readonly WorkoutOrderDeckItem[],
  from: number,
  to: number
): WorkoutOrderDeckItem[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function WorkoutOrderDeck({
  variant,
  items,
  onReorder,
  onWarmupChange,
  onAllWarmupsChange,
  onDragStateChange,
  onJumpTo,
  onAddExercise,
  onCancel,
  onPrimaryAction,
  title = variant === 'preflight' ? 'Review Workout' : 'Workout order',
  subtitle,
  primaryLabel = variant === 'preflight' ? 'Start' : 'Done',
  disabled = false,
  primaryDisabled = false,
  style,
}: WorkoutOrderDeckProps) {
  const { height } = useWindowDimensions();
  const compact = height < 740;
  const [dragging, setDragging] = useState(false);
  const onDragStateChangeRef = useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;
  const data = useMemo(() => [...items], [items]);
  const actionsDisabled = disabled || dragging;
  const primaryActionDisabled = actionsDisabled || primaryDisabled;
  const warmupCount = items.reduce(
    (count, item) => count + (item.warmupEnabled ? 1 : 0),
    0
  );
  const allWarmupsEnabled = items.length > 0 && warmupCount === items.length;
  const someWarmupsEnabled = warmupCount > 0 && !allWarmupsEnabled;
  const allWarmupsDisabled = actionsDisabled || items.length === 0;

  useEffect(() => () => onDragStateChangeRef.current?.(false), []);

  const applyMove = (from: number, requestedTo: number, announce = false) => {
    const item = items[from];
    if (!item?.draggable || disabled) return;
    // Locked rows cannot be picked up, but they remain passable so the visible
    // order after a drop is exactly the order committed to the session.
    const to = Math.max(0, Math.min(items.length - 1, requestedTo));
    if (to === from) return;
    tick();
    onReorder(moveItem(items, from, to), { from, to });
    if (announce) {
      AccessibilityInfo.announceForAccessibility(
        `${item.name}, position ${to + 1} of ${items.length}`
      );
    }
  };

  const renderItem = ({
    item,
    getIndex,
    drag,
    isActive,
  }: RenderItemParams<WorkoutOrderDeckItem>) => {
    const index = getIndex();
    if (index === undefined) return null;
    const targetSets = normalizedCount(item.targetSets);
    const completedSets = Math.min(targetSets, normalizedCount(item.completedSets));
    const complete = targetSets > 0 && completedSets >= targetSets;
    const canMoveEarlier = item.draggable && index > 0 && !disabled;
    const canMoveLater = item.draggable && index < items.length - 1 && !disabled;
    const dragEnabled = canMoveEarlier || canMoveLater;
    const warmupDisabled = disabled || item.warmupLocked || !onWarmupChange;
    const canSelect = variant === 'live' && Boolean(onJumpTo) && !actionsDisabled;
    const setCopy =
      variant === 'preflight'
        ? `${targetSets}×`
        : `${completedSets}/${targetSets}`;

    return (
      <ScaleDecorator activeScale={1.015}>
        <View
          style={[
            styles.row,
            variant === 'preflight' && styles.preflightRow,
            item.current && styles.rowCurrent,
            complete && styles.rowComplete,
            isActive && styles.rowDragging,
            variant === 'preflight' && isActive && styles.preflightRowDragging,
          ]}
        >
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel={`Reorder ${item.name}`}
            accessibilityHint="Drag the handle, or use Move earlier and Move later actions"
            accessibilityValue={{ text: `Position ${index + 1} of ${items.length}` }}
            accessibilityState={{ disabled: !dragEnabled }}
            accessibilityActions={[
              ...(canMoveEarlier
                ? [{ name: 'decrement' as const, label: 'Move earlier' }]
                : []),
              ...(canMoveLater
                ? [{ name: 'increment' as const, label: 'Move later' }]
                : []),
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'decrement') {
                applyMove(index, index - 1, true);
              } else if (event.nativeEvent.actionName === 'increment') {
                applyMove(index, index + 1, true);
              }
            }}
            disabled={!dragEnabled}
            onPressIn={dragEnabled ? drag : undefined}
            hitSlop={6}
            style={({ pressed }) => [
              styles.dragHandle,
              !dragEnabled && styles.controlDisabled,
              pressed && dragEnabled && styles.dragHandlePressed,
            ]}
          >
            <Text style={[styles.dragGlyph, isActive && styles.dragGlyphActive]}>≡</Text>
          </Pressable>

          {variant === 'live' && onJumpTo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                item.current
                  ? `Keep ${item.name} as the current exercise`
                  : `Set ${item.name} as the current exercise`
              }
              accessibilityHint={complete ? 'Opens the completed exercise for editing' : undefined}
              accessibilityState={{ selected: item.current, disabled: !canSelect }}
              disabled={!canSelect}
              onPress={() => onJumpTo(item.key, index)}
              style={({ pressed }) => [
                styles.rowSelectArea,
                pressed && canSelect && styles.rowSelectAreaPressed,
              ]}
            >
              <View style={styles.nameField} pointerEvents="none">
                <Text
                  numberOfLines={1}
                  style={[styles.exerciseName, complete && styles.completeCopy]}
                >
                  {item.name}
                </Text>
                {item.current && <Text style={styles.currentCopy}>Current</Text>}
              </View>
              <Text style={[styles.setCopy, complete && styles.completeCopy]}>
                {setCopy}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.rowSelectArea}>
              <View
                style={[
                  styles.nameField,
                  variant === 'preflight' && styles.preflightNameField,
                ]}
              >
                <Text numberOfLines={1} style={styles.exerciseName}>
                  {item.name}
                </Text>
              </View>
              <Text style={styles.setCopy}>{setCopy}</Text>
            </View>
          )}

          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={`Warm-up set for ${item.name}`}
            accessibilityHint={
              item.warmupLocked ? 'Warm-up choice is locked after work has begun' : undefined
            }
            accessibilityState={{ checked: item.warmupEnabled, disabled: warmupDisabled }}
            disabled={warmupDisabled || dragging}
            onPress={() => {
              tick();
              onWarmupChange?.(item.key, !item.warmupEnabled);
            }}
            hitSlop={6}
            style={({ pressed }) => [
              styles.warmupControl,
              warmupDisabled && styles.controlDisabled,
              pressed && !warmupDisabled && styles.warmupPressed,
            ]}
          >
            <View style={[styles.warmupBox, item.warmupEnabled && styles.warmupBoxChecked]}>
              {item.warmupEnabled && <Text style={styles.warmupCheck}>✓</Text>}
            </View>
            <Text style={styles.warmupLabel}>Warm-up</Text>
          </Pressable>
        </View>
      </ScaleDecorator>
    );
  };

  const list = (
    <DraggableFlatList
      data={data}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      activationDistance={8}
      dragItemOverflow={false}
      showsVerticalScrollIndicator={false}
      containerStyle={variant === 'preflight' ? styles.preflightList : styles.liveList}
      contentContainerStyle={[
        styles.listContent,
        variant === 'live' && styles.liveListContent,
      ]}
      onDragBegin={() => {
        setDragging(true);
        onDragStateChange?.(true);
        tick();
      }}
      onDragEnd={({ from, to }) => {
        setDragging(false);
        onDragStateChange?.(false);
        applyMove(from, to);
      }}
      ListEmptyComponent={<View style={styles.emptySpace} />}
      ListFooterComponent={
        onAddExercise ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add exercise"
            disabled={actionsDisabled}
            onPress={() => {
              tick();
              onAddExercise();
            }}
            style={({ pressed }) => [
              styles.addRow,
              variant === 'preflight' && styles.preflightAddRow,
              actionsDisabled && styles.actionDisabled,
              pressed && styles.actionPressed,
            ]}
          >
            <Text style={styles.addText}>+ Add exercise</Text>
          </Pressable>
        ) : null
      }
    />
  );

  const primaryAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPrimaryAction();
  };

  if (variant === 'preflight') {
    return (
      <View style={[styles.preflightDeck, compact && styles.preflightDeckCompact, style]}>
        <View style={styles.editorHeaderRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel workout"
            disabled={actionsDisabled}
            hitSlop={12}
            onPress={onCancel}
          >
            <Text style={[styles.cancelText, actionsDisabled && styles.actionDisabled]}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${primaryLabel}, start workout`}
            accessibilityState={{ disabled: primaryActionDisabled }}
            disabled={primaryActionDisabled}
            onPress={primaryAction}
          >
            <Glass
              style={[styles.startButton, styles.preflightStartButton]}
              tintColor="rgba(18,19,19,0.76)"
              interactive={!primaryActionDisabled}
            >
              <Text
                style={[
                  styles.startText,
                  primaryActionDisabled && styles.primaryTextDisabled,
                ]}
              >
                {primaryLabel}
              </Text>
            </Glass>
          </Pressable>
        </View>
        <View style={styles.preflightMetaRow}>
          <Text numberOfLines={1} style={styles.preflightMeta}>
            {subtitle ? `${title} — ${subtitle}` : title}
          </Text>
          {onAllWarmupsChange ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="Warm-up all exercises"
              accessibilityState={{
                checked: someWarmupsEnabled ? 'mixed' : allWarmupsEnabled,
                disabled: allWarmupsDisabled,
              }}
              disabled={allWarmupsDisabled}
              onPress={() => {
                tick();
                onAllWarmupsChange(!allWarmupsEnabled);
              }}
              hitSlop={8}
              style={({ pressed }) => [
                styles.warmupAllControl,
                allWarmupsDisabled && styles.controlDisabled,
                pressed && !allWarmupsDisabled && styles.warmupPressed,
              ]}
            >
              <View
                style={[
                  styles.warmupBox,
                  (allWarmupsEnabled || someWarmupsEnabled) && styles.warmupBoxChecked,
                ]}
              >
                {(allWarmupsEnabled || someWarmupsEnabled) && (
                  <Text style={styles.warmupCheck}>{someWarmupsEnabled ? '–' : '✓'}</Text>
                )}
              </View>
              <Text style={styles.warmupAllLabel}>Warm-up all</Text>
            </Pressable>
          ) : null}
        </View>
        {list}
      </View>
    );
  }

  return (
    <Glass
      style={[
        styles.liveDeck,
        compact && styles.liveDeckCompact,
        { maxHeight: Math.max(390, height - (compact ? 34 : 76)) },
        style,
      ]}
      tintColor="rgba(12,12,12,0.82)"
    >
      {list}
      <View style={[styles.liveFooter, compact && styles.liveFooterCompact]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          accessibilityState={{ disabled: primaryActionDisabled }}
          disabled={primaryActionDisabled}
          onPress={primaryAction}
          style={({ pressed }) => [
            styles.doneButton,
            primaryActionDisabled && styles.actionDisabled,
            pressed && !primaryActionDisabled && styles.actionPressed,
          ]}
        >
          <Text style={styles.doneText}>{primaryLabel}</Text>
        </Pressable>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  preflightDeck: {
    flex: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  preflightDeckCompact: {},
  editorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  cancelText: {
    color: theme.textDim,
    fontSize: 14,
  },
  startButton: {
    borderRadius: 17,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  preflightStartButton: {
    backgroundColor: 'rgba(18,19,19,0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  startText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryTextDisabled: {
    opacity: 0.35,
  },
  preflightMetaRow: {
    minHeight: 30,
    marginBottom: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  preflightMeta: {
    flex: 1,
    minWidth: 0,
    color: theme.textDim,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
  },
  warmupAllControl: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warmupAllLabel: {
    color: theme.text,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
  },
  preflightList: {
    flex: 1,
  },
  liveDeck: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,12,12,0.46)',
  },
  liveDeckCompact: {
    borderRadius: 22,
  },
  liveList: {
    flexGrow: 0,
    maxHeight: 470,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  liveListContent: {
    paddingTop: 12,
  },
  row: {
    minHeight: 56,
    borderRadius: 14,
    paddingHorizontal: 11,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 9,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  preflightRow: {
    backgroundColor: 'rgba(15,16,16,0.76)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  rowCurrent: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  rowComplete: {
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  rowDragging: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  preflightRowDragging: {
    backgroundColor: 'rgba(28,29,29,0.9)',
    borderColor: 'rgba(255,255,255,0.24)',
  },
  dragHandle: {
    paddingHorizontal: 2,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  dragHandlePressed: {
    opacity: 0.65,
  },
  dragGlyph: {
    color: theme.textDim,
    fontSize: 22,
    lineHeight: 17,
    fontWeight: '700',
  },
  dragGlyphActive: {
    color: theme.text,
  },
  nameField: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  preflightNameField: {
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  rowSelectArea: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 10,
  },
  rowSelectAreaPressed: {
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  exerciseName: {
    flex: 1,
    minWidth: 0,
    color: theme.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  currentCopy: {
    color: theme.textDim,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    marginLeft: 7,
  },
  setCopy: {
    minWidth: 30,
    color: theme.text,
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  completeCopy: {
    color: 'rgba(241,236,228,0.38)',
  },
  warmupControl: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 2,
  },
  warmupPressed: {
    opacity: 0.65,
  },
  warmupBox: {
    width: 18,
    height: 18,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(241,236,228,0.42)',
  },
  warmupBoxChecked: {
    borderColor: theme.accent,
  },
  warmupCheck: {
    color: theme.accent,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '800',
  },
  warmupLabel: {
    color: theme.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
  },
  controlDisabled: {
    opacity: 0.28,
  },
  emptySpace: {
    minHeight: 12,
  },
  addRow: {
    minHeight: 46,
    borderRadius: 14,
    marginTop: 1,
    marginBottom: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  preflightAddRow: {
    backgroundColor: 'rgba(15,16,16,0.68)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  addText: {
    color: theme.accent,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
  liveFooter: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12,
  },
  liveFooterCompact: {
    paddingTop: 3,
    paddingBottom: 10,
  },
  doneButton: {
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  doneText: {
    color: theme.accent,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.35,
  },
  actionPressed: {
    opacity: 0.7,
  },
});
