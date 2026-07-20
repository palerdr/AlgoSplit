import React from 'react';
import { Voltra } from '@use-voltra/ios';
import {
  isLiveActivityActive,
  startLiveActivity,
  stopLiveActivity,
  updateLiveActivity,
  type LiveActivityVariants,
} from '@use-voltra/ios-client';
import { theme } from '../theme';
import { cancelRestAlarm, scheduleRestAlarm } from './restAlarm';
import { presentRestCompletionAlert } from './restCompletionAlert';

const REST_ACTIVITY_NAME = 'algosplit-rest-timer';

interface RestLiveActivityTiming {
  startedAtMs: number;
  endsAtMs: number;
  nextUp: string | null;
}

// Keep native lifecycle operations ordered. This also prevents a very fast
// hold-to-skip from trying to end the activity before its start has finished.
let lifecycleQueue: Promise<void> = Promise.resolve();
let activeTimerOwner: 'none' | 'alarmKit' | 'voltra' = 'none';

function enqueueLifecycle(operation: () => Promise<void>): Promise<void> {
  lifecycleQueue = lifecycleQueue.then(operation, operation).catch((error) => {
    // Live Activities are optional and can be disabled by the user. They must
    // never interrupt the workout or its in-app timer.
    if (__DEV__) console.warn('[AlgoSplit] Rest Live Activity unavailable.', error);
  });
  return lifecycleQueue;
}

function countdown(startedAtMs: number, endsAtMs: number, fontSize: number) {
  return (
    <Voltra.Timer
      startAtMs={startedAtMs}
      endAtMs={endsAtMs}
      direction="down"
      showHours={false}
      style={{
        color: theme.text,
        fontSize,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
      }}
    />
  );
}

export function createRestLiveActivityVariants({
  startedAtMs,
  endsAtMs,
  nextUp,
}: RestLiveActivityTiming): LiveActivityVariants {
  const nextUpLabel = nextUp?.trim() || 'Continue workout';

  return {
    lockScreen: {
      activityBackgroundTint: theme.bg,
      content: (
        <Voltra.VStack
          alignment="leading"
          spacing={8}
          style={{ paddingHorizontal: 16, paddingVertical: 14 }}
        >
          <Voltra.HStack alignment="center" spacing={10}>
            <Voltra.Symbol
              name="timer"
              size={20}
              weight="semibold"
              tintColor={theme.accent}
            />
            <Voltra.Text style={{ color: theme.textDim, fontSize: 14, fontWeight: '600' }}>
              Rest
            </Voltra.Text>
            <Voltra.Spacer />
            {countdown(startedAtMs, endsAtMs, 30)}
          </Voltra.HStack>
          <Voltra.Text
            numberOfLines={1}
            style={{ color: theme.textDim, fontSize: 13, fontWeight: '500' }}
          >
            {`Next: ${nextUpLabel}`}
          </Voltra.Text>
        </Voltra.VStack>
      ),
    },
    island: {
      keylineTint: theme.accent,
      compact: {
        trailing: countdown(startedAtMs, endsAtMs, 14),
      },
      minimal: countdown(startedAtMs, endsAtMs, 12),
      expanded: {
        center: (
          <Voltra.HStack
            alignment="center"
            spacing={10}
            style={{ paddingHorizontal: 16, paddingVertical: 8 }}
          >
            <Voltra.Symbol
              name="timer"
              size={19}
              weight="semibold"
              tintColor={theme.accent}
            />
            <Voltra.Text style={{ color: theme.textDim, fontSize: 14, fontWeight: '600' }}>
              Rest
            </Voltra.Text>
            <Voltra.Spacer />
            {countdown(startedAtMs, endsAtMs, 24)}
          </Voltra.HStack>
        ),
      },
    },
  };
}

export function createRestCompletionLiveActivityVariants(): LiveActivityVariants {
  return {
    lockScreen: {
      activityBackgroundTint: theme.bg,
      content: (
        <Voltra.Link destination="algosplit://">
          <Voltra.HStack
            alignment="center"
            spacing={10}
            style={{ paddingHorizontal: 16, paddingVertical: 14 }}
          >
            <Voltra.Symbol
              name="checkmark.circle.fill"
              size={22}
              weight="semibold"
              tintColor={theme.accent}
            />
            <Voltra.VStack alignment="leading" spacing={2}>
              <Voltra.Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>
                Rest complete
              </Voltra.Text>
              <Voltra.Text style={{ color: theme.textDim, fontSize: 13, fontWeight: '500' }}>
                Back to workout
              </Voltra.Text>
            </Voltra.VStack>
            <Voltra.Spacer />
            <Voltra.Symbol
              name="chevron.right"
              size={14}
              weight="semibold"
              tintColor={theme.textDim}
            />
          </Voltra.HStack>
        </Voltra.Link>
      ),
    },
    island: {
      keylineTint: theme.accent,
      compact: {
        trailing: (
          <Voltra.Symbol
            name="checkmark"
            size={14}
            weight="bold"
            tintColor={theme.accent}
          />
        ),
      },
      minimal: (
        <Voltra.Symbol
          name="checkmark"
          size={13}
          weight="bold"
          tintColor={theme.accent}
        />
      ),
      expanded: {
        center: (
          <Voltra.HStack
            alignment="center"
            spacing={9}
            style={{ paddingHorizontal: 16, paddingVertical: 6 }}
          >
            <Voltra.Symbol
              name="checkmark.circle.fill"
              size={22}
              weight="semibold"
              tintColor={theme.accent}
            />
            <Voltra.Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
              Rest complete
            </Voltra.Text>
          </Voltra.HStack>
        ),
        bottom: (
          <Voltra.Link destination="algosplit://">
            <Voltra.HStack
              alignment="center"
              spacing={7}
              style={{ paddingHorizontal: 16, paddingVertical: 8 }}
            >
              <Voltra.Text style={{ color: theme.accent, fontSize: 15, fontWeight: '700' }}>
                Back to workout
              </Voltra.Text>
              <Voltra.Symbol
                name="arrow.right"
                size={13}
                weight="semibold"
                tintColor={theme.accent}
              />
            </Voltra.HStack>
          </Voltra.Link>
        ),
      },
    },
  };
}

export function startRestLiveActivity({
  startedAtMs,
  endsAtMs,
  nextUp,
}: RestLiveActivityTiming): Promise<void> {
  return enqueueLifecycle(async () => {
    activeTimerOwner = 'none';

    const isSystemAlarmScheduled = await scheduleRestAlarm({
      endsAtMs,
      nextWorkout: nextUp,
    });

    if (isSystemAlarmScheduled) {
      activeTimerOwner = 'alarmKit';

      // A system alarm and a Voltra activity must never represent the same
      // timer. Remove any legacy activity left behind by an earlier run.
      if (isLiveActivityActive(REST_ACTIVITY_NAME)) {
        await stopLiveActivity(REST_ACTIVITY_NAME, { dismissalPolicy: 'immediate' });
      }
      return;
    }

    await startLiveActivity(
      createRestLiveActivityVariants({ startedAtMs, endsAtMs, nextUp }),
      {
        activityName: REST_ACTIVITY_NAME,
        deepLinkUrl: 'algosplit://',
        staleDate: endsAtMs,
        relevanceScore: 1,
      }
    );
    activeTimerOwner = 'voltra';
  });
}

export function completeRestLiveActivity(): Promise<void> {
  return enqueueLifecycle(async () => {
    // AlarmKit owns both the deadline alert and its completion UI. Leaving it
    // scheduled here is what lets the alert fire while the app is suspended.
    if (activeTimerOwner === 'alarmKit') return;
    if (!isLiveActivityActive(REST_ACTIVITY_NAME)) return;
    await updateLiveActivity(
      REST_ACTIVITY_NAME,
      createRestCompletionLiveActivityVariants(),
      { relevanceScore: 1 }
    );
    await presentRestCompletionAlert();
  });
}

export function endRestLiveActivity(): Promise<void> {
  return enqueueLifecycle(async () => {
    await cancelRestAlarm();
    activeTimerOwner = 'none';
    if (!isLiveActivityActive(REST_ACTIVITY_NAME)) return;
    await stopLiveActivity(REST_ACTIVITY_NAME, { dismissalPolicy: 'immediate' });
  });
}
