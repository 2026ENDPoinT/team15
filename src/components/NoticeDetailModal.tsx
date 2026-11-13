import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Notice } from '../features/demo/campusNotices';
import { noticeCardStyles } from './noticeCardStyles';

export function NoticeDetailModal({
  notice,
  visible,
  onClose,
  children,
}: {
  notice: Notice;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.detailScreen}>
        <View style={styles.detailHeader}>
          <Text style={styles.detailHeading}>공지 상세</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={onClose}
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
          {visible && children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = {
  ...noticeCardStyles,
  ...StyleSheet.create({
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
  }),
};
