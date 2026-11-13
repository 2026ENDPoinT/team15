import type { NoticeRepository, ReminderRecord } from '../db/noticeRepository';
import { reminderFireAt } from '../domain/dates';

interface ReminderRequest {
  key: string;
  noticeId: string;
  fireAt: string;
}

interface ScheduledReminder extends ReminderRequest {
  identifier: string;
}

// The adapter lists only this app's tagged application deadline notifications.
export interface ReminderPlatform {
  isAllowed(): Promise<boolean>;
  listScheduled(): Promise<ScheduledReminder[]>;
  cancel(identifier: string): Promise<void>;
  schedule(request: ReminderRequest): Promise<string>;
}

export function createReminderReconciler(
  repository: Pick<
    NoticeRepository,
    'getHomeModel' | 'listReminders' | 'persistReminder'
  >,
  platform: ReminderPlatform,
  clock = () => new Date(),
) {
  let pending = Promise.resolve();

  async function reconcile() {
    const now = clock();
    const { notices } = await repository.getHomeModel(now);
    const allowed = await platform.isAllowed();
    const desired = new Map<string, ReminderRequest>();
    for (const notice of notices) {
      if (!allowed || notice.progress === 'applied') continue;
      const fireAt = reminderFireAt(notice.events, now);
      const key = `${notice.id}:application_close:v1`;
      if (fireAt) desired.set(key, { key, noticeId: notice.id, fireAt });
    }

    const stored = await repository.listReminders();
    const scheduled = await platform.listScheduled();
    const noticeIds = new Map([
      ...stored.map(({ key, noticeId }) => [key, noticeId] as const),
      ...scheduled.map(({ key, noticeId }) => [key, noticeId] as const),
      ...[...desired.values()].map(
        ({ key, noticeId }) => [key, noticeId] as const,
      ),
    ]);

    for (const [key, noticeId] of noticeIds) {
      const target = desired.get(key);
      const existing = scheduled.filter((item) => item.key === key);
      const exact = existing.find((item) => item.fireAt === target?.fireAt);
      const prior = exact ?? existing[0];
      const record: ReminderRecord = {
        key,
        noticeId,
        desiredFireAt: target?.fireAt ?? null,
        appliedFireAt: prior?.fireAt ?? null,
        identifier: prior?.identifier ?? null,
        state: 'needs_sync',
        error: null,
      };
      await repository.persistReminder(record);

      let remaining = prior;
      try {
        for (const item of existing) {
          if (item === exact) continue;
          remaining = item;
          await platform.cancel(item.identifier);
          remaining = exact;
        }
        if (!exact && target && Date.parse(target.fireAt) > clock().getTime()) {
          remaining = {
            ...target,
            identifier: await platform.schedule(target),
          };
        }
      } catch (error) {
        record.state = 'error';
        record.error = error instanceof Error ? error.message : String(error);
      }

      await repository.persistReminder({
        ...record,
        state: record.state === 'error' ? 'error' : 'synced',
        appliedFireAt: remaining?.fireAt ?? null,
        identifier: remaining?.identifier ?? null,
      });
    }
  }

  return function reconcileReminders(): Promise<void> {
    const result = pending.then(reconcile);
    pending = result.catch(() => undefined);
    return result;
  };
}
