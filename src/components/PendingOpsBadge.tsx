// Phase 198 — pending offline-ops badge.
//
// Shows "N pending sync" while the op-queue holds undelivered
// mutations; renders nothing when the queue is empty. Polls the
// count on a short interval while mounted (tiny SQL; no event bus
// exists — noted as acceptable MVP plumbing in the plan docs).

import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';

import {getDb} from '../db/database';
import {OpQueueStore} from '../services/opQueue';
import {createThemedStyles} from '../theme/createThemedStyles';

export const PENDING_POLL_MS = 3000;

/** Poll the pending-op count while mounted. Exported for reuse when
 *  a later phase wants the number elsewhere (e.g. a Sessions header). */
export function usePendingOps(pollMs: number = PENDING_POLL_MS): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const queue = new OpQueueStore(await getDb());
        const n = await queue.countPending();
        if (alive) setCount(n);
      } catch {
        // Db unavailable — keep last-known count.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), pollMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pollMs]);

  return count;
}

export function PendingOpsBadge() {
  const styles = useStyles();
  const count = usePendingOps();
  if (count === 0) return null;
  return (
    <View style={styles.badge} testID="pending-ops-badge">
      <Text style={styles.text}>
        {count} pending sync{count === 1 ? '' : 's'} — will send when online
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  badge: {
    backgroundColor: t.severity.high.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  text: {fontSize: 12, color: t.warning, fontWeight: '600'},
}));
