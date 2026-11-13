import { useRef, useState, type ComponentRef } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  noticeProgressOptions,
  type NoticeProgressSelectProps,
} from './noticeProgressOptions';

export function NoticeProgressSelect({
  value,
  disabled,
  onChange,
}: NoticeProgressSelectProps) {
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const { width, height } = useWindowDimensions();
  const label = noticeProgressOptions.find(
    (option) => option.value === value,
  )!.label;
  return (
    <>
      <View ref={anchor} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`공지 상태: ${label}`}
          accessibilityState={{ expanded: !!position, disabled }}
          disabled={disabled}
          style={styles.select}
          onPress={() =>
            anchor.current?.measureInWindow((x, y, w, h) =>
              setPosition({
                left: Math.max(8, Math.min(x + w - 160, width - 168)),
                top: y + h + 148 < height ? y + h + 4 : Math.max(8, y - 148),
              }),
            )
          }
        >
          <Text style={styles.text}>{label} ▾</Text>
        </Pressable>
      </View>
      <Modal
        transparent
        visible={!!position}
        animationType="none"
        onRequestClose={() => setPosition(null)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="상태 선택 닫기"
          onPress={() => setPosition(null)}
        />
        <View style={[styles.menu, position]}>
          {noticeProgressOptions.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{
                selected: value === option.value,
                disabled,
              }}
              disabled={disabled}
              style={[styles.option, value === option.value && styles.selected]}
              onPress={() => {
                setPosition(null);
                if (option.value !== value) onChange(option.value);
              }}
            >
              <Text style={styles.text}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  select: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dfe5d9',
    borderRadius: 11,
    paddingHorizontal: 12,
    backgroundColor: 'white',
  },
  text: { fontSize: 12, color: '#213e32' },
  menu: {
    position: 'absolute',
    width: 160,
    padding: 4,
    borderWidth: 1,
    borderColor: '#dfe5d9',
    borderRadius: 11,
    backgroundColor: 'white',
    elevation: 8,
  },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 7,
  },
  selected: { backgroundColor: '#edf2e2' },
});
