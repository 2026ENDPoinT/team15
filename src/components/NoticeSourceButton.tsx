import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Notice } from '../features/demo/campusNotices';

export function NoticeSourceButton({ notice }: { notice: Notice }) {
  const [failed, setFailed] = useState(false);
  if (notice.synthetic || !notice.sourceUrl) return null;
  const url = notice.sourceUrl;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="공지 원문 열기"
        style={styles.button}
        onPress={() => {
          setFailed(false);
          void Linking.openURL(url).catch(() => setFailed(true));
        }}
      >
        <Text style={styles.label}>공지 원문 열기 ↗</Text>
      </Pressable>
      {failed && (
        <Text accessibilityRole="alert" style={styles.error}>
          원문을 열지 못했어요. 다시 시도해 주세요.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
  label: { fontSize: 12, color: '#28634d' },
  error: { fontSize: 12, lineHeight: 19, color: '#b52e2e' },
});
