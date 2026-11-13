import { useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { useDemoNotice } from '../features/demo/DemoNoticeProvider';
import { ActionButton, styles } from './ui';

export function AnalysisSettings() {
  const { hasAnalysisAccess, saveAnalysisToken, clearAnalysisToken } =
    useDemoNotice();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function update(remove: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (remove) await clearAnalysisToken();
      else await saveAnalysisToken(token);
      setToken('');
      setMessage(
        remove ? 'AI 시연 토큰을 삭제했어요.' : 'AI 시연 토큰을 저장했어요.',
      );
    } catch {
      setMessage('토큰 형식과 기기 저장 상태를 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>AI 분석 설정</Text>
      <Text style={styles.body}>
        {hasAnalysisAccess
          ? '시연 토큰 등록됨'
          : '시연 토큰을 입력하면 실제 공지를 분석할 수 있어요.'}
      </Text>
      <Text style={styles.caption}>
        {Platform.OS === 'web'
          ? '웹에서는 토큰을 저장하지 않으며 새로고침하면 다시 입력해야 해요.'
          : '시연 토큰은 이 기기의 보안 저장소에 보관돼요.'}
      </Text>
      <TextInput
        accessibilityLabel="AI 시연 토큰"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        value={token}
        onChangeText={setToken}
        placeholder="팀에서 받은 시연 토큰"
        editable={!busy}
        style={{
          borderWidth: 1,
          borderColor: '#cbd5cf',
          borderRadius: 8,
          padding: 12,
        }}
      />
      <ActionButton
        label={busy ? '토큰 처리 중…' : 'AI 토큰 저장'}
        onPress={() => void update(false)}
      />
      {hasAnalysisAccess && (
        <ActionButton
          secondary
          label="AI 토큰 삭제"
          onPress={() => void update(true)}
        />
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.caption}>
          {message}
        </Text>
      )}
    </View>
  );
}
