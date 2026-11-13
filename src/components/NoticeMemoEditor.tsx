import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { CampusButton } from './CampusButton';
import { campusStyles as s } from './campusStyles';

export function NoticeMemoEditor({
  memo,
  disabled,
  onSave,
}: {
  memo: string;
  disabled: boolean;
  onSave(memo: string, onSaved: () => void): Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? memo;
  const changed = value !== memo;
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.section}>메모</Text>
      <TextInput
        accessibilityLabel="공지 메모"
        placeholder="이 공지에 대한 메모를 남겨 보세요"
        multiline
        value={value}
        onChangeText={setDraft}
        editable={!disabled}
        style={[s.input, { minHeight: 100, textAlignVertical: 'top' }]}
      />
      <View style={s.row}>
        <CampusButton
          label="메모 저장"
          disabled={disabled || !changed}
          onPress={() => void onSave(value, () => setDraft(null))}
        />
        {changed && (
          <Text style={s.muted}>저장하지 않은 변경사항이 있어요.</Text>
        )}
      </View>
    </View>
  );
}
