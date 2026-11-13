import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { ActionButton, Screen, styles } from '../../src/components/ui';
import { t09DeviceStep } from '../../src/features/verification/t09Device';

export default function T09VerificationScreen() {
  const running = useRef(false);
  const [result, setResult] = useState('아직 실행하지 않았습니다.');
  const steps = [
    ['initial', '1. 가상 공지 저장·예약'],
    ['failure', '2. 본문 변경·AI 실패'],
    ['recover', '3. 분석 복구·새 마감 예약'],
    ['reopen', '4. DB 재개방·예약 재사용'],
    ['uncertain', '5. 미확정 마감·예약 취소'],
    ['applied', '6. 신청 완료·예약 취소'],
    ['interrupt', '7. OS 예약 직후 DB 기록 중단'],
    ['inspect', '현재 DB·OS 상태 조회'],
    ['live', '제품 공지 OS 예약 조회'],
    ['reconcile', '권한 변경 후 재조정'],
    ['cleanup', '검증 알림 정리'],
  ] as const;
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        T09 기기 검증
      </Text>
      <Text style={styles.body}>
        가상 HTML·AI로 변경과 실패를 재현합니다. 실제 SQLite·OS 알림을 사용하며
        전용 검증 DB와 알림 태그로 구분합니다. 가상 날짜만 실행일 기준 미래로
        옮깁니다. 실제 게시판·AI 서버는 호출하지 않습니다.
      </Text>
      <Text style={styles.caption}>
        1 → 2 → 3 → 4 → 5 순서로 실행하세요. 3 실행 후 앱 완전 종료·재실행하고
        이 화면의 상태 조회로 예약 ID·체크 UUID 보존도 확인하세요. 신청 완료는
        3을 다시 실행한 뒤 6으로 확인합니다. 검증 후 알림 정리를 누르세요.
      </Text>
      {steps.map(([step, label]) => (
        <ActionButton
          key={step}
          label={label}
          onPress={async () => {
            if (running.current) return;
            running.current = true;
            setResult('확인 중…');
            try {
              setResult(JSON.stringify(await t09DeviceStep(step), null, 2));
            } catch (error) {
              setResult(error instanceof Error ? error.message : '검증 실패');
            } finally {
              running.current = false;
            }
          }}
        />
      ))}
      <Text selectable accessibilityLiveRegion="polite" style={styles.caption}>
        {result}
      </Text>
      <ActionButton
        secondary
        label="메인으로 돌아가기"
        onPress={() => {
          if (!running.current) router.replace('/');
        }}
      />
    </Screen>
  );
}
