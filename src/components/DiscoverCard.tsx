import { useCardTouchLock } from './useCardTouchLock';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
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
  const position = useRef(new Animated.ValueXY({ x: 0, y: 60 })).current;
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const axis = useRef<'x' | 'y' | null>(null);
  const actRef = useRef(act);
  actRef.current = act;

  useEffect(() => {
    mounted.current = true;
    Animated.timing(position, {
      toValue: { x: 0, y: 0 },
      duration: 240,
      useNativeDriver: true,
    }).start();
    return () => {
      mounted.current = false;
      position.stopAnimation();
      touchLock.release();
    };
  }, [position, onDragging]);

  const reset = () => {
    axis.current = null;
    touchLock.release();
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 8,
    }).start();
  };
  const perform = (action: Action, verticalDirection = -1) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    touchLock.startDrag();
    Animated.timing(position, {
      toValue: {
        x: action === 'hold' ? 0 : action === 'select' ? width : -width,
        y: action === 'hold' ? height * verticalDirection : 0,
      },
      duration: 180,
      useNativeDriver: true,
    }).start(async ({ finished }) => {
      if (!mounted.current) return;
      if (!finished) {
        busyRef.current = false;
        setBusy(false);
        reset();
        return;
      }
      // The repository determines whether to advance. Failed writes keep this card.
      try {
        await actRef.current(action);
      } finally {
        if (mounted.current) {
          busyRef.current = false;
          setBusy(false);
          reset();
        }
      }
    });
  };
  const performRef = useRef(perform);
  performRef.current = perform;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          touchLock.locked.current &&
          !expanded &&
          !busyRef.current &&
          (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
        onMoveShouldSetPanResponder: (_, g) =>
          touchLock.locked.current &&
          !expanded &&
          !busyRef.current &&
          (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
        onPanResponderGrant: () => {
          position.stopAnimation();
          axis.current = null;
          touchLock.startDrag();
        },
        onPanResponderMove: (_, g) => {
          if (!axis.current && Math.max(Math.abs(g.dx), Math.abs(g.dy)) >= 16) {
            axis.current = Math.abs(g.dx) > Math.abs(g.dy) * 1.5 ? 'x' : 'y';
          }
          position.setValue({
            x: axis.current === 'x' ? g.dx : 0,
            y: axis.current === 'y' ? g.dy : 0,
          });
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: reset,
        onPanResponderRelease: (_, g) => {
          if (axis.current === 'x' && Math.abs(g.dx) >= 56) {
            performRef.current(g.dx > 0 ? 'select' : 'discard');
          } else if (axis.current === 'y' && Math.abs(g.dy) >= 48) {
            performRef.current('hold', g.dy > 0 ? 1 : -1);
          } else reset();
        },
      }),
    [expanded, position, onDragging],
  );

  return (
    <Animated.View
      testID="discover-card"
      pointerEvents={busy ? 'none' : 'auto'}
      style={[styles.card, { transform: position.getTranslateTransform() }]}
      {...responder.panHandlers}
      onStartShouldSetResponderCapture={() => {
        if (!expanded && !busyRef.current) touchLock.acquire();
        return false;
      }}
      onTouchEnd={touchLock.endTouch}
      onTouchCancel={() => {
        if (!busyRef.current) reset();
      }}
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
    </Animated.View>
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
