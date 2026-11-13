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
  isNew = false,
  detailContent,
  eligibilityLabel,
  act,
  onDragging,
}: {
  notice: Notice;
  isNew?: boolean;
  detailContent: ReactNode;
  eligibilityLabel: string;
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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reset = (animated = true) => {
    motion.reset(animated);
    touchLock.release();
  };
  const perform = (action: Action, verticalDirection = -1) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    touchLock.startDrag();
    const complete = async (finished: boolean) => {
      if (!mounted.current) return;
      let applied = false;
      try {
        if (finished) applied = await actRef.current(action);
      } finally {
        if (mounted.current) {
          busyRef.current = false;
          setBusy(false);
          // A completed swipe must not fly back from outside the screen.
          reset(!applied);
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
    !busy,
    touchLock.startDrag,
    (dx, dy) => {
      if (Math.abs(dx) >= 56) perform(dx > 0 ? 'select' : 'discard');
      else if (Math.abs(dy) >= 48) perform('hold', dy > 0 ? 1 : -1);
      else reset();
    },
    reset,
  );
  return (
    <>
      <GestureDetector gesture={motion.gesture}>
        <Reanimated.View
          testID="discover-card"
          pointerEvents={busy ? 'none' : 'auto'}
          style={[styles.card, motion.style]}
        >
          <View testID="discover-card-body" style={styles.bodyContent}>
            {isNew && <Text style={styles.tags}>새 공지</Text>}
            <Text numberOfLines={1} style={styles.muted}>
              {notice.org}
            </Text>
            <Text
              numberOfLines={3}
              accessibilityRole="header"
              style={styles.title}
            >
              {notice.title}
            </Text>
            <Text numberOfLines={1} style={styles.muted}>
              {notice.synthetic
                ? '가상 예시'
                : '실제 공지 · ' + notice.analysisLabel}
            </Text>
            <Text numberOfLines={1} style={styles.tags}>
              {notice.tags.join(' · ')}
            </Text>
            <Text numberOfLines={2} style={styles.muted}>
              {eligibilityLabel} ·{' '}
              {notice.date
                ? `${notice.date} · ${notice.time ? notice.time + ' KST' : '시각 미확인'} 마감`
                : (notice.scheduleText ?? '정확한 일정은 원문에서 확인')}
            </Text>
            <Text numberOfLines={2} style={styles.muted}>
              {notice.summary}
            </Text>
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
                <Text
                  style={[styles.link, action === 'select' && styles.light]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          {expanded && detailContent}
        </Reanimated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexShrink: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: '#dfe5d9',
    borderRadius: 20,
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  bodyContent: {
    flexShrink: 1,
    minHeight: 0,
    overflow: 'hidden',
    padding: 14,
    gap: 6,
  },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '800', color: '#213e32' },
  muted: { fontSize: 12, lineHeight: 19, color: '#728174' },
  tags: { fontSize: 12, lineHeight: 20, color: '#28634d' },
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
