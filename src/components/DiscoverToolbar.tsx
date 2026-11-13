import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
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
    .activeOffsetY(12)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      runOnJS(setPulling)(event.translationY >= 56);
    })
    .onEnd((event) => {
      if (event.translationY >= 56) runOnJS(refresh)();
    })
    .onFinalize(() => {
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
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="공지 새로고침"
              disabled={refreshing || pending}
              onPress={() => void refresh()}
              style={styles.control}
            >
              {refreshing || pending ? (
                <ActivityIndicator size="small" color="#28634d" />
              ) : (
                <Text style={styles.hint}>
                  {pulling ? '놓으면 새로고침' : '↓ 여기서 당겨 새로고침'}
                </Text>
              )}
            </Pressable>
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
  toolbar: { flexShrink: 0 },
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
