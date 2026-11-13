import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { normalNoticeFixture } from '../../fixtures/synthetic/notices';
import type { ReminderPlatform } from '../services/reminderReconciler';

const channelId = 'application-deadlines';
const notificationKind = 'application-deadline-v1';
const testId = 'deadline-notification-test';
// Expo Go owns its notification channels. Use its default channel there.
const useCustomChannel =
  Platform.OS === 'android' &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
const channel = useCustomChannel ? { channelId } : {};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function prepareChannel() {
  if (useCustomChannel) {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: '신청 마감 알림',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

function createDeadlineNotifications(kind: string): ReminderPlatform {
  return {
    async isAllowed() {
      const permission = await Notifications.getPermissionsAsync();
      return permission.granted;
    },
    async listScheduled() {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      return scheduled.flatMap(({ identifier, content: { data } }) => {
        if (
          data?.kind !== kind ||
          typeof data.key !== 'string' ||
          typeof data.noticeId !== 'string' ||
          typeof data.fireAt !== 'string'
        )
          return [];
        return [
          {
            identifier,
            key: data.key,
            noticeId: data.noticeId,
            fireAt: data.fireAt,
          },
        ];
      });
    },
    cancel: Notifications.cancelScheduledNotificationAsync,
    async schedule({ key, noticeId, fireAt }) {
      const demo =
        noticeId === normalNoticeFixture.notice.id || kind !== notificationKind;
      if (!demo) await prepareChannel();
      return Notifications.scheduleNotificationAsync({
        content: {
          title: demo
            ? '테스트 · 공지 마감 알림'
            : '저장한 공지의 신청 마감이 내일이에요',
          body: demo
            ? '가상 공지의 예약 동작을 확인하는 알림입니다.'
            : '앱에서 마감과 준비물을 확인하세요.',
          data: { kind, key, noticeId, fireAt },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(fireAt),
          ...(demo ? {} : channel),
        },
      });
    },
  };
}

export const deadlineNotifications =
  createDeadlineNotifications(notificationKind);
// Same native adapter, separate tag: product reconciliation cannot cancel verification reservations.
export const verificationNotifications = createDeadlineNotifications(
  't09-verification-v1',
);

export async function scheduleTestNotification(): Promise<boolean> {
  // The delivery test uses the host app's default channel.
  let step = '알림 권한 확인';
  try {
    if (!(await requestNotificationPermission())) return false;

    step = '기존 테스트 예약 확인';
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (scheduled.some(({ identifier }) => identifier === testId)) {
      await Notifications.cancelScheduledNotificationAsync(testId);
    }

    step = '10초 뒤 알림 예약';
    await Notifications.scheduleNotificationAsync({
      identifier: testId,
      content: {
        title: '테스트 알림',
        body: '기기에서 알림을 받을 수 있어요.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10,
      },
    });
    return true;
  } catch (error) {
    throw new Error(
      `${step} 실패 · ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return (
    current.granted ||
    (!current.canAskAgain
      ? false
      : (await Notifications.requestPermissionsAsync()).granted)
  );
}
