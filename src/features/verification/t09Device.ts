import { openDatabaseAsync } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import {
  t09Html,
  shiftT09Dates,
  t09Envelope,
  t09NoticeId,
  type T09Stage,
} from '../../../fixtures/synthetic/t09';
import { sha256 } from '../../platform/sha256';
import {
  deadlineNotifications,
  verificationNotifications,
  requestNotificationPermission,
} from '../../platform/deadlineNotifications';
import { createNoticeRepository } from '../../db/noticeRepository';
import { createNoticeSync } from '../../services/noticeSync';
import { createReminderReconciler } from '../../services/reminderReconciler';
import { AnalysisClientError } from '../../services/analysisClient';

async function openSession() {
  const platform = verificationNotifications;
  if (!platform)
    throw new Error(
      'Android 실기기에서 실행해 주세요. 웹은 OS 예약을 검증하지 않습니다.',
    );
  const db = await openDatabaseAsync('t09-verification.db');
  try {
    await db.execAsync(
      'CREATE TABLE IF NOT EXISTS verification_context (id INTEGER PRIMARY KEY CHECK (id = 1), date_shift INTEGER NOT NULL)',
    );
    const currentShift = () =>
      Math.floor((Date.now() + 9 * 3_600_000) / 86_400_000) -
      Math.floor(Date.parse('2026-11-14T00:00:00Z') / 86_400_000);
    await db.runAsync(
      'INSERT OR IGNORE INTO verification_context (id, date_shift) VALUES (1, ?)',
      currentShift(),
    );
    let shift = (await db.getFirstAsync<{ date_shift: number }>(
      'SELECT date_shift FROM verification_context WHERE id = 1',
    ))!.date_shift;
    const repository = await createNoticeRepository(
      {
        execAsync: (sql) => db.execAsync(sql),
        runAsync: (sql, params) => db.runAsync(sql, params),
        getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, params),
        getAllAsync: (sql, params = []) => db.getAllAsync(sql, params),
        withTransactionAsync: (task) => db.withTransactionAsync(task),
      },
      { randomUUID, sha256 },
    );
    await repository.recoverInterruptedAnalysis();
    const reconcile = createReminderReconciler(repository, platform);
    const records = await repository.listNoticeRecords();
    const fetchedAt = records.find(({ notice }) => notice.id === t09NoticeId)
      ?.notice.fetchedAt;
    let time = new Date(Math.max(Date.now(), Date.parse(fetchedAt ?? '') || 0));
    let stage: T09Stage = 'initial';
    let fail = false;
    const sync = createNoticeSync({
      repository,
      randomUUID,
      now: () => time,
      collector: {
        sha256,
        fetch: async (url) => {
          const response = t09Html(String(url), stage);
          return new Response(shiftT09Dates(await response.text(), shift), {
            headers: { 'Content-Type': 'text/html' },
          });
        },
      },
      analyze: async (request) => {
        if (fail) throw new AnalysisClientError('PROVIDER_UNAVAILABLE');
        return shiftT09Dates(t09Envelope(request, stage), shift);
      },
      keywords: () => ['T09'],
      reconcileReminders: reconcile,
    });
    async function collect(next: T09Stage, failure = false) {
      stage = next;
      fail = failure;
      time = new Date(Math.max(Date.now(), time.getTime() + 31_000));
      await sync.refreshNotices('manual');
    }
    async function inspect() {
      const detail = await repository.getNoticeDetail(t09NoticeId);
      return {
        environment: 'native SQLite + OS notifications; synthetic HTML/AI',
        inspectedAt: new Date().toISOString(),
        allowed: await platform!.isAllowed(),
        analysisFresh: detail?.analysisFresh ?? null,
        analysisStatus: detail?.analysisStatus ?? null,
        deadlineChanged: detail?.deadlineChanged ?? null,
        progress: detail?.progress ?? null,
        checklist: await repository.getChecklist(t09NoticeId),
        reminders: await repository.listReminders(),
        osReservations: await platform!.listScheduled(),
        syncMessage: sync.getStatus().message,
      };
    }
    return {
      close: () => db.closeAsync(),
      inspect,
      async run(
        step:
          | 'initial'
          | 'failure'
          | 'recover'
          | 'uncertain'
          | 'applied'
          | 'cleanup'
          | 'reconcile'
          | 'interrupt',
      ) {
        if (step === 'initial') {
          if (!(await requestNotificationPermission()))
            throw new Error('알림 권한을 허용한 뒤 다시 실행해 주세요.');
          shift = currentShift();
          await db.runAsync(
            'UPDATE verification_context SET date_shift = ? WHERE id = 1',
            shift,
          );
          await collect('initial');
          await repository.saveNotice(t09NoticeId);
          await repository.setProgress(t09NoticeId, 'preparing');
          await repository.acknowledgeDeadlineChange(t09NoticeId);
          const item = (await repository.getChecklist(t09NoticeId)).items[0];
          if (item) await repository.setChecklistCompleted(item.id, true);
        } else if (step === 'interrupt') {
          for (const item of await platform!.listScheduled())
            await platform!.cancel(item.identifier);
          let interrupted = false;
          const interruptedReconcile = createReminderReconciler(
            {
              ...repository,
              async persistReminder(record) {
                if (record.state === 'synced' && record.identifier) {
                  interrupted = true;
                  throw new Error(
                    'T09 injected interruption after OS schedule',
                  );
                }
                await repository.persistReminder(record);
              },
            },
            platform!,
          );
          try {
            await interruptedReconcile();
          } catch (error) {
            if (!interrupted) throw error;
          }
          if (!interrupted)
            throw new Error('먼저 1 또는 3으로 예약 가능한 상태를 만드세요.');
          return { ...(await inspect()), injectedInterruption: true };
        } else if (step === 'failure') await collect('changed', true);
        else if (step === 'recover') await collect('changed');
        else if (step === 'uncertain') await collect('uncertain');
        else if (step === 'applied')
          await repository.setProgress(t09NoticeId, 'applied');
        else if (step === 'cleanup') await repository.unsaveNotice(t09NoticeId);
        await reconcile();
        return inspect();
      },
    };
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

let session: ReturnType<typeof openSession> | undefined;
export async function t09DeviceStep(
  step:
    | Parameters<Awaited<ReturnType<typeof openSession>>['run']>[0]
    | 'reopen'
    | 'inspect'
    | 'live',
) {
  if (step === 'live') {
    if (!deadlineNotifications) throw new Error('실기기에서 조회해 주세요.');
    return {
      kind: 'product OS reservations',
      allowed: await deadlineNotifications.isAllowed(),
      osReservations: await deadlineNotifications.listScheduled(),
    };
  }
  if (step === 'reopen' && session) {
    await (await session).close();
    session = undefined;
  }
  const current = await (session ??= openSession().catch((error) => {
    session = undefined;
    throw error;
  }));
  return step === 'inspect'
    ? current.inspect()
    : current.run(step === 'reopen' ? 'reconcile' : step);
}
