import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

interface ExerciseNavMobileProps {
  currentIndex: number;
  totalExercises: number;
  isSaving?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  onJump: (index: number) => void;
}

export default function ExerciseNavMobile({
  currentIndex,
  totalExercises,
  isSaving,
  onPrev,
  onNext,
  onFinish,
  onJump,
}: ExerciseNavMobileProps) {
  const isSummary = currentIndex === totalExercises;
  const isLastExercise = currentIndex === totalExercises - 1;
  const dotCount = totalExercises + 1;
  // Shrink dots when many exercises to prevent clipping the nav buttons
  const dotSize = dotCount > 10 ? 5 : 7;
  const dotGap = dotCount > 10 ? 3 : 6;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
        onPress={onPrev}
        disabled={currentIndex === 0}
      >
        <Ionicons name="chevron-back" size={18} color={currentIndex === 0 ? colors.textDim : colors.textSecondary} />
        <Text style={[styles.navText, currentIndex === 0 && styles.navTextDisabled]}>Prev</Text>
      </TouchableOpacity>

      <View style={[styles.dots, { gap: dotGap }]}>
        {Array.from({ length: dotCount }).map((_, i) => (
          <TouchableOpacity key={i} onPress={() => onJump(i)} hitSlop={4}>
            <View style={[styles.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2 }, i === currentIndex && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      {isSummary ? (
        <TouchableOpacity
          style={[styles.finishBtn, isSaving && styles.finishBtnSaving]}
          onPress={onFinish}
          disabled={isSaving}
          activeOpacity={0.7}
        >
          {isSaving ? (
            <>
              <ActivityIndicator size="small" color="#111" />
              <Text style={styles.finishText}>Saving...</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color="#111" />
              <Text style={styles.finishText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      ) : isLastExercise ? (
        <TouchableOpacity style={styles.reviewBtn} onPress={onNext}>
          <Text style={styles.reviewText}>Review</Text>
          <Ionicons name="chevron-forward" size={18} color="#111" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.navBtn} onPress={onNext}>
          <Text style={styles.navText}>Next</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 72,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  navTextDisabled: {
    color: colors.textDim,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dotActive: {
    backgroundColor: colors.green,
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.green,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 72,
    justifyContent: 'center',
  },
  finishBtnSaving: {
    opacity: 0.7,
  },
  finishText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '700',
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.green,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 72,
    justifyContent: 'center',
  },
  reviewText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '700',
  },
});
