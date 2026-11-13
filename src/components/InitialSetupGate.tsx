import { useRef, useState, type PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDemoNotice } from '../features/demo/DemoNoticeProvider';
import type { CampusProfile } from '../domain/campusProfile';
import { ProfileFields } from './ProfileFields';
import { CampusButton } from './CampusButton';
import { campusStyles as s } from './campusStyles';

export function InitialSetupGate({ children }: PropsWithChildren) {
  const { hasCompletedSetup } = useDemoNotice();
  return hasCompletedSetup ? children : <InitialSetup />;
}

function InitialSetup() {
  const { profile, saveProfile } = useDemoNotice();
  const [draft, setDraft] = useState<CampusProfile>({
    ...profile,
    department: '',
    grade: 1,
  });
  const [step, setStep] = useState(1);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const keywords = Array.from(
    new Set([
      '대회',
      '장학금',
      '취업',
      '인턴',
      '교육',
      '봉사',
      ...draft.customKeywords,
    ]),
  );
  function changeStep(next: number) {
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function addKeyword() {
    const value = custom.trim();
    if (!value) return;
    setDraft((old) => ({
      ...old,
      keywords: Array.from(new Set([...old.keywords, value])),
      customKeywords: Array.from(new Set([...old.customKeywords, value])),
    }));
    setCustom('');
  }
  async function finish() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(false);
    try {
      const value = custom.trim();
      await saveProfile({
        ...draft,
        department: draft.department.trim(),
        keywords: Array.from(
          new Set([...draft.keywords, ...(value ? [value] : [])]),
        ),
        customKeywords: Array.from(
          new Set([...draft.customKeywords, ...(value ? [value] : [])]),
        ),
      });
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.content}
        >
          <Text style={s.brand}>캠퍼스 공지</Text>
          <Text style={s.muted}>처음 설정 · {step}/2</Text>
          <Text accessibilityRole="header" style={s.title}>
            {step === 1
              ? '나에게 맞는 공지로 시작해요'
              : '어떤 소식에 관심 있나요?'}
          </Text>
          <Text style={s.description}>
            {step === 1
              ? '소속과 학적 정보를 알려 주세요. 나중에 설정에서 언제든 바꿀 수 있어요.'
              : '관심 키워드를 선택하면 관련 공지를 모아 볼 수 있어요. 여러 개를 선택해도 좋아요.'}
          </Text>
          <View pointerEvents={saving ? 'none' : 'auto'}>
            {step === 1 ? (
              <ProfileFields
                {...draft}
                onCollegeChange={(college) =>
                  setDraft((old) => ({ ...old, college }))
                }
                onDepartmentChange={(department) =>
                  setDraft((old) => ({ ...old, department }))
                }
                onGradeChange={(grade) =>
                  setDraft((old) => ({ ...old, grade }))
                }
                onEnrollmentChange={(enrollment) =>
                  setDraft((old) => ({ ...old, enrollment }))
                }
              />
            ) : (
              <View style={s.card}>
                <Text style={s.section}>
                  관심 키워드 · {draft.keywords.length}개 선택
                </Text>
                <View style={s.row}>
                  {keywords.map((keyword) => (
                    <Pressable
                      key={keyword}
                      accessibilityRole="checkbox"
                      accessibilityLabel={keyword}
                      accessibilityState={{
                        checked: draft.keywords.includes(keyword),
                      }}
                      aria-checked={draft.keywords.includes(keyword)}
                      style={[
                        s.button,
                        draft.keywords.includes(keyword) && s.primary,
                      ]}
                      onPress={() =>
                        setDraft((old) => ({
                          ...old,
                          keywords: old.keywords.includes(keyword)
                            ? old.keywords.filter((item) => item !== keyword)
                            : [...old.keywords, keyword],
                        }))
                      }
                    >
                      <Text
                        style={
                          draft.keywords.includes(keyword)
                            ? s.light
                            : s.buttonText
                        }
                      >
                        {keyword}
                        {draft.keywords.includes(keyword) ? ' ✓' : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  accessibilityLabel="관심 키워드 직접 입력"
                  placeholder="관심 키워드 직접 입력"
                  value={custom}
                  onChangeText={setCustom}
                  onSubmitEditing={addKeyword}
                  style={s.input}
                  maxLength={50}
                />
                <CampusButton
                  label="키워드 추가"
                  onPress={addKeyword}
                  disabled={!custom.trim() || saving}
                />
                {draft.keywords.length === 0 && (
                  <Text style={s.muted}>
                    선택한 키워드가 없으면 맞춤 공지가 표시되지 않아요. 나중에
                    설정에서 추가할 수 있어요.
                  </Text>
                )}
              </View>
            )}
          </View>
          {error && (
            <Text accessibilityRole="alert" style={s.deleteHint}>
              설정을 저장하지 못했어요. 다시 시작하기를 눌러 주세요.
            </Text>
          )}
          {step === 1 ? (
            <CampusButton
              label="다음: 관심 키워드"
              primary
              onPress={() => changeStep(2)}
            />
          ) : (
            <>
              <CampusButton
                label={saving ? '저장 중…' : '설정 완료하고 시작하기'}
                primary
                disabled={saving}
                onPress={() => void finish()}
              />
              <CampusButton
                label="이전"
                disabled={saving}
                onPress={() => changeStep(1)}
              />
            </>
          )}
          <Text style={s.muted}>설정은 이 기기에 저장돼요.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
