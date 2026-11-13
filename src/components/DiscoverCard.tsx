import { noticeCardStyles } from './noticeCardStyles';
import { NoticeSourceButton } from './NoticeSourceButton';
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
import { NoticeDetailModal } from './NoticeDetailModal';
import type { Notice } from '../features/demo/campusNotices';
import {
  confirmedCardText,
  noticeCardMetadata,
} from '../features/demo/noticeCardPresentation';

type Action = 'discard' | 'hold' | 'select';

export default function DiscoverCard({
  notice,
  isNew = false,
  remainingCount = 0,
  detailContent,
  eligibilityLabel,
  act,
  onDragging,
}: {
  notice: Notice;
  isNew?: boolean;
  remainingCount?: number;
  detailContent: ReactNode;
  eligibilityLabel: string;
  act: (action: Action) => Promise<boolean>;
  onDragging: (dragging: boolean) => void;
}) {
  const touchLock = useCardTouchLock(onDragging);
  const metadata = noticeCardMetadata(notice, eligibilityLabel);
  const summary = confirmedCardText(notice.summary);
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
    !busy && !expanded,
    touchLock.startDrag,
    (dx, dy) => {
      if (Math.abs(dx) >= 56) perform(dx > 0 ? 'select' : 'discard');
      else if (Math.abs(dy) >= 48) perform('hold', dy > 0 ? 1 : -1);
      else reset();
    },
    reset,
  );
  return (
    <View style={styles.deck}>
      {remainingCount > 0 && (
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
        >
          {remainingCount > 1 && (
            <View style={[styles.stackCard, styles.stackBack]} />
          )}
          <View style={[styles.stackCard, styles.stackFront]} />
        </View>
      )}
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
            <Text numberOfLines={1} style={styles.tags}>
              {notice.tags.join(' · ')}
            </Text>
            {!!metadata && (
              <Text numberOfLines={2} style={styles.muted}>
                {metadata}
              </Text>
            )}
            {!!summary && (
              <Text numberOfLines={2} style={styles.muted}>
                {summary}
              </Text>
            )}
          </View>
          <View style={styles.detailToggle}>
            <Pressable
              style={styles.detailButton}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              aria-expanded={expanded}
              onPress={() => {
                reset();
                setExpanded(true);
              }}
            >
              <Text style={styles.link}>공지 자세히 보기 ↗</Text>
            </Pressable>
            <NoticeSourceButton notice={notice} />
          </View>
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
        </Reanimated.View>
      </GestureDetector>
      {remainingCount > 0 && (
        <Text pointerEvents="none" style={styles.remaining}>
          다음 공지 {remainingCount}개가 기다리고 있어요
        </Text>
      )}
      <NoticeDetailModal
        notice={notice}
        visible={expanded}
        onClose={() => setExpanded(false)}
      >
        {detailContent}
      </NoticeDetailModal>
    </View>
  );
}

const styles = {
  ...noticeCardStyles,
  ...StyleSheet.create({
    deck: { flexShrink: 1, minHeight: 0 },
    stackCard: {
      position: 'absolute',
      top: 24,
      bottom: 38,
      borderWidth: 1,
      borderColor: '#dfe5d9',
      borderRadius: 20,
    },
    stackBack: {
      left: 20,
      right: 20,
      bottom: 28,
      backgroundColor: '#edf1e8',
    },
    stackFront: {
      left: 10,
      right: 10,
      backgroundColor: '#f5f7f1',
    },
    remaining: {
      paddingTop: 28,
      fontSize: 12,
      lineHeight: 20,
      textAlign: 'center',
      color: '#728174',
    },
  }),
};
