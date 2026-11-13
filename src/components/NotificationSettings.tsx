import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useDemoNotice } from '../features/demo/DemoNoticeProvider';
import { ActionButton, styles } from './ui';

export function NotificationSettings() {
  const { notificationSnapshot, enableDeadlineNotifications } = useDemoNotice();
  const [message, setMessage] = useState('');
  const { status, allowed } = notificationSnapshot;
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>마감 알림</Text>
      <Text style={styles.body}>
        {status === 'unsupported'
          ? '마감 알림은 모바일 앱에서 사용할 수 있어요.'
          : status === 'error'
            ? '기기의 알림 권한을 확인하지 못했어요. 다시 시도해 주세요.'
            : allowed
              ? '마감 알림이 허용되어 있어요.'
              : '마감 알림을 받으려면 알림 권한을 허용해 주세요.'}
      </Text>
      <Text style={styles.caption}>
        저장한 공지의 확정된 신청 마감 하루 전 오전 9시(KST)에 알려드려요.
        신청을 완료하거나 선택을 취소하면 예약도 취소돼요.
      </Text>
      {enableDeadlineNotifications && (
        <>
          {!allowed && (
            <ActionButton
              label="마감 알림 허용"
              onPress={async () => {
                setMessage('');
                try {
                  const granted = await enableDeadlineNotifications();
                  setMessage(
                    granted
                      ? '알림을 허용했어요. 공지 상세에서 예약 상태를 확인할 수 있어요.'
                      : '알림 권한이 허용되지 않았어요. 기기 알림 설정에서 허용해 주세요.',
                  );
                } catch {
                  setMessage(
                    '알림 설정을 완료하지 못했어요. 다시 시도해 주세요.',
                  );
                }
              }}
            />
          )}
          <ActionButton
            secondary
            label="기기 알림 설정 열기"
            onPress={() => Linking.openSettings()}
          />
        </>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.caption}>
          {message}
        </Text>
      )}
    </View>
  );
}
