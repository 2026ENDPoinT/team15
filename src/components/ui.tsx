import { useState, type PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  background: '#F6F8F7',
  white: '#FFFFFF',
  ink: '#172C27',
  muted: '#60716B',
  teal: '#086B56',
  mint: '#E6F2EC',
  line: '#DCE5E0',
  amber: '#855216',
  amberLight: '#FFF1D8',
};

export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function DemoBanner() {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerTitle}>가상 공지로 체험 중</Text>
      <Text style={styles.caption}>
        실제 모집 정보가 아니며, 저장과 체크 상태는 이 기기에 보관됩니다.
      </Text>
    </View>
  );
}

export function SectionTitle({
  title,
  aside,
}: {
  title: string;
  aside?: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {aside ? <Text style={styles.caption}>{aside}</Text> : null}
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  secondary = false,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  secondary?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setError(false);
          try {
            await onPress();
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
        style={({ pressed }) => [
          styles.button,
          secondary && styles.secondaryButton,
          (pressed || busy) && { opacity: 0.65 },
        ]}
      >
        <Text style={[styles.buttonText, secondary && { color: colors.teal }]}>
          {busy ? '처리 중…' : label}
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.caption}>
          처리하지 못했어요. 다시 시도해 주세요.
        </Text>
      ) : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: 24, paddingBottom: 40 },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 24 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.teal,
  },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink, lineHeight: 40 },
  subtitle: { fontSize: 15, lineHeight: 24, color: colors.muted },
  caption: { fontSize: 12, lineHeight: 19, color: colors.muted },
  body: { fontSize: 15, lineHeight: 25, color: colors.ink },
  banner: {
    backgroundColor: colors.mint,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  bannerTitle: { color: colors.teal, fontSize: 13, fontWeight: '700' },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: colors.ink },
  group: { gap: 14 },
  panel: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    padding: 20,
    borderRadius: 20,
    gap: 16,
  },
  button: {
    backgroundColor: colors.teal,
    minHeight: 48,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  secondaryButton: { backgroundColor: colors.mint },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: colors.background,
    color: colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 12,
  },
});
