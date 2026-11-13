import type { ReminderPlatform } from '../services/reminderReconciler';

export const deadlineNotifications: ReminderPlatform | null = null;

export async function scheduleTestNotification(): Promise<boolean> {
  return false;
}

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}
