import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { CampusButton } from './CampusButton';
import { campusStyles as s } from './campusStyles';

type Item = { id: string; text: string; completed: boolean };

export function ChecklistEditor({
  items,
  disabled,
  onToggle,
  onDelete,
  onAdd,
}: {
  items: Item[];
  disabled: boolean;
  onToggle(item: Item): Promise<void>;
  onDelete(id: string): Promise<void>;
  onAdd(text: string, onSaved: () => void): Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (disabled || !draft.trim()) return;
    void onAdd(draft.trim(), () => setDraft(''));
  };
  return (
    <View style={{ gap: 8 }}>
      {items.length ? (
        items.map((item) => (
          <View key={item.id} style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={item.text}
              accessibilityState={{ checked: item.completed, disabled }}
              disabled={disabled}
              aria-checked={item.completed}
              style={[s.button, { flex: 1 }, item.completed && s.checkedItem]}
              onPress={() => void onToggle(item)}
            >
              <Text style={s.buttonText}>
                {`${item.completed ? '☑' : '☐'} ${item.text}`}
              </Text>
            </Pressable>
            <CampusButton
              label="삭제"
              accessibilityLabel={`${item.text} 삭제`}
              disabled={disabled}
              onPress={() => void onDelete(item.id)}
            />
          </View>
        ))
      ) : (
        <Text style={s.muted}>신청·제출 항목을 추가해 보세요.</Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          accessibilityLabel="새 체크리스트 항목"
          placeholder="추가할 항목을 입력하세요"
          value={draft}
          onChangeText={setDraft}
          editable={!disabled}
          returnKeyType="done"
          onSubmitEditing={add}
          style={[s.input, { flex: 1, minWidth: 0 }]}
        />
        <CampusButton
          label="추가"
          accessibilityLabel="체크리스트 항목 추가"
          disabled={disabled || !draft.trim()}
          onPress={add}
        />
      </View>
    </View>
  );
}
