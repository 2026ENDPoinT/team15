import { Pressable, Text } from 'react-native';
import { campusStyles as s } from './campusStyles';
import { noticeCardStyles as cardStyles } from './noticeCardStyles';

export function CampusButton({
  label,
  accessibilityLabel = label,
  onPress,
  primary = false,
  disabled = false,
  cardAction = false,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  cardAction?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, cardAction && cardStyles.button, primary && s.primary]}
    >
      <Text style={[s.buttonText, primary && s.light]}>{label}</Text>
    </Pressable>
  );
}
