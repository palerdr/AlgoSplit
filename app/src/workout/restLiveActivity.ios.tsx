import React from 'react';
import { Voltra } from '@use-voltra/ios';
import {
  isLiveActivityActive,
  startLiveActivity,
  stopLiveActivity,
  type LiveActivityVariants,
} from '@use-voltra/ios-client';
import { theme } from '../theme';

const REST_ACTIVITY_NAME = 'algosplit-rest-timer';

interface RestLiveActivityTiming {
  startedAtMs: number;
  endsAtMs: number;
}

// Keep native lifecycle operations ordered. This also prevents a very fast
// hold-to-skip from trying to end the activity before its start has finished.
let lifecycleQueue: Promise<void> = Promise.resolve();

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
}: RestLiveActivityTiming): LiveActivityVariants {
  return {
    lockScreen: {
      activityBackgroundTint: theme.bg,
      content: (
        <Voltra.HStack
          alignment="center"
          spacing={10}
          style={{ paddingHorizontal: 16, paddingVertical: 14 }}
        >
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
      ),
    },
    island: {
      keylineTint: theme.accent,
      compact: {
        leading: (
          <Voltra.Symbol
            name="timer"
            size={13}
            weight="semibold"
            tintColor={theme.accent}
          />
        ),
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

export function startRestLiveActivity({
  startedAtMs,
  endsAtMs,
}: RestLiveActivityTiming): Promise<void> {
  return enqueueLifecycle(async () => {
    await startLiveActivity(
      createRestLiveActivityVariants({ startedAtMs, endsAtMs }),
      {
        activityName: REST_ACTIVITY_NAME,
        deepLinkUrl: 'algosplit://',
        staleDate: endsAtMs,
        relevanceScore: 1,
      }
    );
  });
}

export function endRestLiveActivity(): Promise<void> {
  return enqueueLifecycle(async () => {
    if (!isLiveActivityActive(REST_ACTIVITY_NAME)) return;
    await stopLiveActivity(REST_ACTIVITY_NAME, { dismissalPolicy: 'immediate' });
  });
}
