import { GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, withTiming } from 'react-native-reanimated';
import { useCardMotion } from './gestureMotion';
import { useCardTouchLock } from './useCardTouchLock';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            aria-expanded={expanded}
            onPress={() => {
              reset();
              setExpanded(true);
            }}
            style={styles.detailToggle}
          >
            <Text style={styles.link}>공지 자세히 보기 ↗</Text>
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
        </Reanimated.View>
      </GestureDetector>
      {remainingCount > 0 && (
        <Text pointerEvents="none" style={styles.remaining}>
          다음 공지 {remainingCount}개가 기다리고 있어요
        </Text>
      )}
      <Modal
        visible={expanded}
        animationType="slide"
        onRequestClose={() => setExpanded(false)}
      >
        <SafeAreaView style={styles.detailScreen}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailHeading}>공지 상세</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              onPress={() => setExpanded(false)}
              style={styles.closeButton}
            >
              <Text style={styles.link}>닫기</Text>
            </Pressable>
          </View>
          <ScrollView
            testID="notice-sheet-content"
            style={styles.detailScroll}
            contentContainerStyle={styles.detailContent}
          >
            <Text style={styles.muted}>{notice.org}</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {notice.title}
            </Text>
            {expanded && detailContent}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  detailScreen: { flex: 1, backgroundColor: '#f7f8f3' },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#dfe5d9',
  },
  detailHeading: { fontSize: 18, fontWeight: '700', color: '#213e32' },
  closeButton: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailScroll: { flex: 1 },
  detailContent: { padding: 18, gap: 12, paddingBottom: 32 },
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
