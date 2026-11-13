import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { PageGestureContext } from './gestureMotion';
import { NoticeSheet } from './NoticeSheet';

export function DiscoverToolbar({
  active,
  count,
  showAll,
  onToggle,
  refreshing,
  onRefresh,
  status,
  children,
}: {
  active: boolean;
  count: number;
  showAll: boolean;
  onToggle: () => void;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  status: string;
  children: ReactNode;
}) {
  const pager = useContext(PageGestureContext);
  const [open, setOpen] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const pullDistance = useSharedValue(0);
  const busy = refreshing || pending;
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: busy ? 36 : Math.min(48, pullDistance.value * 0.5) },
    ],
  }));
  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);
  const refresh = async () => {
    if (refreshing || locked.current) return;
    locked.current = true;
    setPending(true);
    try {
      await onRefresh();
    } finally {
      locked.current = false;
      setPending(false);
    }
  };
  const gesture = Gesture.Pan()
    .enabled(active && !busy)
    .activeOffsetY(12)
    .failOffsetX([-20, 20])
    .onStart(() => {
      runOnJS(setPulling)(true);
    })
    .onUpdate((event) => {
      pullDistance.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY >= 56) runOnJS(refresh)();
    })
    .onFinalize(() => {
      pullDistance.value = 0;
      runOnJS(setPulling)(false);
    });
  if (pager) gesture.blocksExternalGesture(pager);
  return (
    <>
      <GestureDetector gesture={gesture}>
        <View
          testID="discover-refresh-area"
          collapsable={false}
          style={styles.toolbar}
        >
          {(pulling || busy) && (
            <Reanimated.View
              pointerEvents="none"
              testID="discover-refresh-indicator"
              style={[styles.indicator, indicatorStyle]}
            >
              <ActivityIndicator
                accessibilityLabel="공지 새로고침 중"
                size="small"
                color="#28634d"
              />
            </Reanimated.View>
          )}
          <View style={styles.row}>
            <Text accessibilityRole="header" style={styles.title}>
              {showAll ? '전체 공지' : '맞춤 공지'} · {count}개
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onToggle}
              style={styles.control}
            >
              <Text style={styles.text}>
                {showAll ? '맞춤 보기' : '전체 공지 보기'}
              </Text>
            </Pressable>
          </View>
          <View style={[styles.row, { justifyContent: 'flex-end' }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="공지 갱신 상태"
              onPress={() => setOpen(true)}
              style={styles.status}
            >
              <Text numberOfLines={1} style={styles.hint}>
                {status} ›
              </Text>
            </Pressable>
          </View>
        </View>
      </GestureDetector>
      <NoticeSheet
        visible={open}
        title="공지 갱신 상태"
        onClose={() => setOpen(false)}
      >
        {children}
      </NoticeSheet>
    </>
  );
}
const styles = StyleSheet.create({
  toolbar: { flexShrink: 0, zIndex: 10 },
  indicator: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dfe5d9',
    boxShadow: '0px 2px 6px rgba(33, 62, 50, 0.18)',
    zIndex: 20,
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { color: '#213e32', fontWeight: '700', fontSize: 17, flexShrink: 1 },
  control: { paddingVertical: 10 },
  status: { paddingVertical: 10, flexShrink: 1 },
  text: { fontSize: 12, color: '#28634d' },
  hint: { fontSize: 11, color: '#728174' },
});
