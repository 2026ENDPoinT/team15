import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { ActionButton, Screen, styles } from '../../src/components/ui';
import { useDemoNotice } from '../../src/features/demo/DemoNoticeProvider';

export default function DeveloperToolsScreen() {
  const { testNotification, reservationStatus, refreshDemoNotice, demoStatus } =
    useDemoNotice();
  const running = useRef(false);
  const [message, setMessage] = useState('');
  async function run(action: () => Promise<string>) {
    if (running.current) return;
    running.current = true;
    setMessage('확인 중…');
    try {
      setMessage(await action());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '검증에 실패했어요.');
    } finally {
      running.current = false;
    }
  }
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        개발자 도구
      </Text>
      <Text style={styles.caption}>
        수집·변경·알림 동작을 다시 확인할 때 사용하는 검증 도구입니다.
      </Text>
      <ActionButton
        label="T02 수집 검증 열기"
        onPress={() => router.push('/dev/collection')}
      />
      <ActionButton
        label="T09 변경·알림 검증 열기"
        onPress={() => router.push('/dev/t09')}
      />
      {refreshDemoNotice && (
        <View style={styles.panel}>
          <ActionButton
            label="시연 공지 새로고침"
            onPress={() =>
              run(async () => {
                await refreshDemoNotice();
                return '';
              })
            }
          />
          {!!demoStatus && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              {demoStatus}
            </Text>
          )}
        </View>
      )}
      {testNotification && (
        <ActionButton
          label="10초 뒤 테스트 알림"
          onPress={() =>
            run(async () =>
              (await testNotification())
                ? '테스트 알림을 예약했어요.'
                : '기기 설정에서 알림을 허용해 주세요.',
            )
          }
        />
      )}
      {reservationStatus ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>가상 공지 마감 알림 검증</Text>
          <Text style={styles.caption}>
            메인에서 가상 해커톤 공지를 선택하고 신청 상태를 준비 중으로 바꾼 뒤
            예약하세요. 테스트 알림은 5분 뒤에 예정돼요. 확인 후 신청 완료 또는
            휴지통으로 이동해 예약을 정리하세요.
          </Text>
          {([true, false] as const).map((enable) => (
            <ActionButton
              key={String(enable)}
              label={enable ? '가상 마감 알림 예약' : '가상 마감 예약 수 확인'}
              onPress={() =>
                run(
                  async () =>
                    `기기에 남은 가상 마감 예약 · ${await reservationStatus(enable)}건`,
                )
              }
            />
          ))}
        </View>
      ) : (
        <Text style={styles.caption}>
          알림 예약 검증은 Android 실기기에서 실행하세요.
        </Text>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {message}
        </Text>
      )}
      <ActionButton
        secondary
        label="메인으로 돌아가기"
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}
