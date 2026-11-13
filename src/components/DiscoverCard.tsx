import { GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, withTiming } from 'react-native-reanimated';
import { useCardMotion } from './gestureMotion';
import { useCardTouchLock } from './useCardTouchLock';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { Notice } from '../features/demo/campusNotices';

type Action = 'discard' | 'hold' | 'select';

export default function DiscoverCard({
  notice,
  detailContent,
  act,
  onDragging,
}: {
  notice: Notice;
  detailContent: ReactNode;
  act: (action: Action) => Promise<boolean>;
  onDragging: (dragging: boolean) => void;
}) {
  const touchLock = useCardTouchLock(onDragging);
  const { width, height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const actRef = useRef(act);
  actRef.current = act;

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const reset = () => {
    motion.reset();
    touchLock.release();
  };
  const perform = (action: Action, verticalDirection = -1) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    touchLock.startDrag();
    const complete = async (finished: boolean) => {
      if (!mounted.current) return;
      try {
        if (finished) await actRef.current(action);
      } finally {
        if (mounted.current) {
          busyRef.current = false;
          setBusy(false);
          reset();
        }
      }
    };
    motion.x.value = withTiming(
      action === 'hold' ? 0 : action === 'select' ? width : -width,
      { duration: 180 },
    );
    motion.y.value = withTiming(
      action === 'hold' ? height * verticalDirection : 0,
      { duration: 180 },
      (finished) => {
        runOnJS(complete)(!!finished);
      },
    );
  };
  const motion = useCardMotion(
    !expanded && !busy,
    touchLock.startDrag,
    (dx, dy) => {
      if (Math.abs(dx) >= 56) perform(dx > 0 ? 'select' : 'discard');
      else if (Math.abs(dy) >= 48) perform('hold', dy > 0 ? 1 : -1);
      else reset();
    },
    reset,
  );
  useEffect(() => {
    mounted.current = true;
    motion.y.value = 60;
    motion.y.value = withTiming(0, { duration: 240 });
  }, []);
  return (
    <GestureDetector gesture={motion.gesture}>
      <Reanimated.View
        testID="discover-card"
        pointerEvents={busy ? 'none' : 'auto'}
        style={[styles.card, motion.style]}
      >
        <View testID="discover-card-body" style={styles.bodyContent}>
          <Text style={styles.muted}>{notice.org}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {notice.title}
          </Text>
          <Text style={styles.tags}>{notice.tags.join(' · ')}</Text>
          <Text style={styles.summary}>{notice.summary}</Text>
          <Text style={styles.muted}>
            {notice.date
              ? `${notice.date} · ${notice.time} KST 마감`
              : '정확한 일정은 원문에서 확인'}
          </Text>
          {expanded && detailContent}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          aria-expanded={expanded}
          onPress={() => {
            setExpanded((old) => !old);
          }}
          style={styles.detailToggle}
        >
          <Text style={styles.link}>
            {expanded ? '접어 두기 ↑' : '공지 자세히 보기 ↗'}
          </Text>
        </Pressable>
        <View style={styles.actions}>
          {(
            [
              ['discard', '← 버리기'],
              ['hold', '↕ 보류'],
              ['select', '선택 →'],
            ] as const
          ).map(([action, label]) => (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={label}
              disabled={busy}
              onPress={() => perform(action)}
              style={[styles.button, action === 'select' && styles.primary]}
            >
              <Text style={[styles.link, action === 'select' && styles.light]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#dfe5d9',
    borderRadius: 20,
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  bodyContent: { padding: 18, gap: 14 },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '800', color: '#213e32' },
  muted: { fontSize: 12, lineHeight: 19, color: '#728174' },
  tags: { fontSize: 12, lineHeight: 20, color: '#28634d' },
  summary: { fontSize: 14, lineHeight: 22, color: '#43584b' },
  detailToggle: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#dfe5d9',
  },
  link: { fontSize: 12, color: '#28634d' },
  actions: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  button: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dfe5d9',
  },
  primary: { backgroundColor: '#28634d', borderColor: '#28634d' },
  light: { color: 'white' },
});
