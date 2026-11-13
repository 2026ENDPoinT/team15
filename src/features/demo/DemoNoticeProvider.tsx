import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';
import { AppState, Text } from 'react-native';
import { normalNoticeFixture } from '../../../fixtures/synthetic/notices';
import { ActionButton, Screen, styles } from '../../components/ui';
import { createNoticeRepository } from '../../db/noticeRepository';
import { createNoticeActions } from '../../services/noticeActions';
import { createReminderReconciler } from '../../services/reminderReconciler';
import {
  deadlineNotifications,
  requestNotificationPermission,
  scheduleTestNotification,
} from '../../platform/deadlineNotifications';
import { reminderFireAt } from '../../domain/dates';
import { demoNotice } from './demoNotice';
import { notices } from './campusNotices';
import { collectedNoticeSchema } from '../../../shared/contracts';
import { hashNoticeContent } from '../../../shared/canonicalize';
import { toAnalyzeNoticeRequest } from '../../../shared/mappers';
import { analysisAccess } from '../../platform/analysisAccess';
import { createAnalysisClient } from '../../services/analysisClient';
import { createNoticeSync, type SyncStatus } from '../../services/noticeSync';
import { toNoticeCard } from './noticeReadModel';
import type { NotificationSnapshot } from './noticeDetailPresentation';

const dataListeners = new Set<() => Promise<void>>();
let currentKeywords = ['대회', '장학금'];

async function openDemoRepository() {
  const db = await openDatabaseAsync('campus-notices.db');
  try {
    const repository = await createNoticeRepository(
      {
        execAsync: (sql) => db.execAsync(sql),
        runAsync: (sql, params) => db.runAsync(sql, params),
        getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, params),
        getAllAsync: (sql, params = []) => db.getAllAsync(sql, params),
        withTransactionAsync: (task) => db.withTransactionAsync(task),
      },
      {
        randomUUID,
        sha256: (text) => digestStringAsync(CryptoDigestAlgorithm.SHA256, text),
      },
    );
    const { notice, analysis } = normalNoticeFixture;
    if (!(await repository.getNoticeDetail(notice.id))) {
      await repository.upsertRawNotice(notice);
      await repository.applyAnalysis(analysis);
      await repository.saveNotice(notice.id);
    }
    for (const sample of notices) {
      if (await repository.getNoticeDetail(sample.id)) continue;
      const raw = collectedNoticeSchema.parse({
        ...notice,
        id: sample.id,
        postId: sample.id.split(':')[2],
        title: sample.title,
        bodyText: sample.summary,
        sourceUrl: `https://example.invalid/synthetic/notices/${sample.id}`,
        extractedLinks: [],
      });
      const contentHash = await hashNoticeContent(
        toAnalyzeNoticeRequest(raw),
        (text) => digestStringAsync(CryptoDigestAlgorithm.SHA256, text),
      );
      await repository.upsertRawNotice({ ...raw, contentHash });
      if (sample.org === '국제교류처')
        await repository.dismissNotice(sample.id);
    }
    const platform = deadlineNotifications;
    let demoFireAt: string | null = null;
    const reconcile = platform
      ? createReminderReconciler(
          repository,
          platform,
          undefined,
          (id) =>
            id === notice.id || !notices.some((sample) => sample.id === id),
          (saved, now) =>
            saved.id === notice.id
              ? demoFireAt && Date.parse(demoFireAt) > now.getTime()
                ? demoFireAt
                : null
              : reminderFireAt(saved.events, now),
        )
      : undefined;
    const reservationStatus =
      platform && reconcile
        ? async (enable: boolean) => {
            if (enable && !(await requestNotificationPermission())) {
              throw new Error('기기 설정에서 알림을 허용해 주세요.');
            }
            if (enable) {
              if (!demoFireAt || Date.parse(demoFireAt) <= Date.now()) {
                demoFireAt = new Date(Date.now() + 5 * 60_000).toISOString();
              }
            }
            await reconcile();
            const records = await repository.listReminders();
            const record = records.find((item) => item.noticeId === notice.id);
            if (record?.state === 'error') {
              throw new Error(record.error ?? '마감 알림 동기화에 실패했어요.');
            }
            const scheduled = await platform.listScheduled();
            return scheduled.filter((item) => item.noticeId === notice.id)
              .length;
          }
        : null;
    await repository.recoverInterruptedAnalysis();
    const sync = createNoticeSync({
      repository,
      collector: {
        sha256: (text) => digestStringAsync(CryptoDigestAlgorithm.SHA256, text),
      },
      analyze: createAnalysisClient({ getToken: analysisAccess.getToken }),
      randomUUID,
      keywords: () => currentKeywords,
      onDataChange: async () => {
        await Promise.all([...dataListeners].map((listener) => listener()));
      },
      reconcileReminders: reconcile ?? (async () => {}),
    });
    return {
      repository,
      sync,
      actions: createNoticeActions(repository, reconcile),
      reservationStatus,
    };
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

type DemoServices = Awaited<ReturnType<typeof openDemoRepository>>;
type Repository = DemoServices['repository'];
let opening: Promise<DemoServices> | undefined;
function getRepository() {
  return (opening ??= openDemoRepository().catch((error) => {
    opening = undefined;
    throw error;
  }));
}

async function readState(repository: Repository) {
  let notificationSnapshot: NotificationSnapshot = {
    status: 'unsupported',
    allowed: false,
    scheduled: [],
  };
  if (deadlineNotifications) {
    try {
      const [allowed, scheduled] = await Promise.all([
        deadlineNotifications.isAllowed(),
        deadlineNotifications.listScheduled(),
      ]);
      notificationSnapshot = { status: 'available', allowed, scheduled };
    } catch {
      notificationSnapshot = { status: 'error', allowed: false, scheduled: [] };
    }
  }
  const reminders = await repository.listReminders();
  const home = await repository.getHomeModel();
  const checklist = await repository.getChecklist(demoNotice.id);
  const records = await repository.listNoticeRecords();
  const entries = await Promise.all(
    records.map(async (record) => ({
      id: record.notice.id,
      record,
      detail: await repository.getNoticeDetail(record.notice.id),
      checklist: await repository.getChecklist(record.notice.id),
    })),
  );
  return {
    home,
    reminders,
    notificationSnapshot,
    notices: entries
      .flatMap(({ record, detail }) =>
        detail ? [toNoticeCard(record, detail)] : [],
      )
      .sort(
        (a, b) =>
          Number(!!a.synthetic) - Number(!!b.synthetic) ||
          (a.synthetic
            ? notices.findIndex(({ id }) => id === a.id) -
              notices.findIndex(({ id }) => id === b.id)
            : 0),
      ),
    syncState: await repository.getSyncState(),
    checklist,
    saved: home.notices.some(({ id }) => id === demoNotice.id),
    buckets: Object.fromEntries(
      entries.map(({ id, detail }) => [id, detail?.disposition ?? 'unseen']),
    ),
    details: Object.fromEntries(entries.map(({ id, detail }) => [id, detail])),
    checklists: Object.fromEntries(
      entries.map(({ id, checklist }) => [id, checklist]),
    ),
  };
}

type DemoNoticeState = Awaited<ReturnType<typeof readState>> & {
  syncStatus: SyncStatus;
  hasAnalysisAccess: boolean;
  saveAnalysisToken(token: string): Promise<void>;
  clearAnalysisToken(): Promise<void>;
  refreshNotices(): Promise<void>;
  analyzeNotice(id: string): Promise<void>;
  setKeywords(keywords: string[]): void;
  refreshReminders(): Promise<void>;
  notice: typeof demoNotice;
  testNotification: (() => Promise<boolean>) | null;
  reservationStatus: ((enable: boolean) => Promise<number>) | null;
  actions: Pick<
    ReturnType<typeof createNoticeActions>,
    | 'saveNotice'
    | 'unsaveNotice'
    | 'dismissNotice'
    | 'setProgress'
    | 'setChecklistCompleted'
  > & { restoreNotice(id: string): Promise<void> };
};

const DemoNoticeContext = createContext<DemoNoticeState | null>(null);

export function DemoNoticeProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<Awaited<ReturnType<typeof readState>>>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [hasAnalysisAccess, setHasAnalysisAccess] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    phase: 'idle',
    message: null,
    analysisRetryAt: null,
  });
  const loadVersion = useRef(0);
  async function reloadState(repository: Repository) {
    const version = ++loadVersion.current;
    const result = await readState(repository);
    if (version === loadVersion.current) setState(result);
  }
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function reload() {
      const { repository } = await getRepository();
      if (active) await reloadState(repository);
    }
    dataListeners.add(reload);
    function reconcile() {
      void getRepository()
        .then(async ({ actions }) => {
          await actions.reconcileReminders();
          await reload();
        })
        .catch(() => undefined);
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reconcile();
        void getRepository()
          .then(({ sync }) => sync.refreshNotices('foreground'))
          .catch(() => undefined);
      }
    });
    void getRepository()
      .then(async ({ repository, sync }) => {
        if (active) {
          unsubscribe = sync.subscribe(() => {
            if (active) setSyncStatus(sync.getStatus());
          });
        }
        try {
          if (active) setHasAnalysisAccess(!!(await analysisAccess.getToken()));
        } catch {
          /* Settings can retry secure access. */
        }
        return readState(repository);
      })
      .then(
        (result) => {
          if (active) {
            setState(result);
            reconcile();
            void getRepository().then(({ sync }) =>
              sync.refreshNotices('launch'),
            );
          }
        },
        () => {
          if (active) setFailed(true);
        },
      );
    return () => {
      active = false;
      loadVersion.current++;
      dataListeners.delete(reload);
      unsubscribe?.();
      subscription.remove();
    };
  }, [attempt]);

  if (!state) {
    return (
      <Screen>
        <Text style={styles.body}>
          {failed
            ? '저장한 공지를 불러오지 못했어요.'
            : '저장한 공지를 불러오는 중이에요.'}
        </Text>
        {failed && (
          <ActionButton
            label="다시 시도"
            onPress={() => {
              setFailed(false);
              setAttempt(attempt + 1);
            }}
          />
        )}
      </Screen>
    );
  }

  async function update(
    write: (
      actions: ReturnType<typeof createNoticeActions>,
      repository: Repository,
    ) => Promise<void>,
  ) {
    const { repository, actions } = await getRepository();
    await write(actions, repository);
    await reloadState(repository);
  }

  const actions: DemoNoticeState['actions'] = {
    saveNotice: async (id) => {
      await update((actions) => actions.saveNotice(id));
      void getRepository()
        .then(({ sync }) => sync.analyzeNotice(id))
        .catch(() => undefined);
    },
    unsaveNotice: (id) => update((actions) => actions.unsaveNotice(id)),
    dismissNotice: (id) => update((actions) => actions.dismissNotice(id)),
    restoreNotice: (id) =>
      update((_, repository) => repository.restoreNotice(id)),
    setProgress: (id, progress) =>
      update((actions) => actions.setProgress(id, progress)),
    setChecklistCompleted: (id, completed) =>
      update((actions) => actions.setChecklistCompleted(id, completed)),
  };
  return (
    <DemoNoticeContext.Provider
      value={{
        notice: demoNotice,
        ...state,
        syncStatus,
        hasAnalysisAccess,
        saveAnalysisToken: async (token) => {
          await analysisAccess.setToken(token);
          (await getRepository()).sync.resetAccess();
          setHasAnalysisAccess(true);
        },
        clearAnalysisToken: async () => {
          await analysisAccess.clearToken();
          (await getRepository()).sync.resetAccess();
          setHasAnalysisAccess(false);
        },
        refreshNotices: async () => {
          await (await getRepository()).sync.refreshNotices('manual');
        },
        analyzeNotice: async (id) => {
          await (await getRepository()).sync.analyzeNotice(id);
        },
        setKeywords: (keywords) => {
          currentKeywords = keywords;
        },
        actions,
        refreshReminders: async () => {
          const { repository, actions } = await getRepository();
          try {
            await actions.reconcileReminders();
          } finally {
            await reloadState(repository);
          }
        },
        reservationStatus: deadlineNotifications
          ? async (enable) => {
              const { repository, reservationStatus } = await getRepository();
              try {
                return (await reservationStatus?.(enable)) ?? 0;
              } finally {
                await reloadState(repository);
              }
            }
          : null,
        testNotification: deadlineNotifications
          ? async () => {
              const scheduled = await scheduleTestNotification();
              void getRepository()
                .then(({ actions }) => actions.reconcileReminders())
                .catch(() => undefined);
              return scheduled;
            }
          : null,
      }}
    >
      {children}
    </DemoNoticeContext.Provider>
  );
}

export function useDemoNotice() {
  const value = useContext(DemoNoticeContext);
  if (!value) throw new Error('DemoNoticeProvider is required');
  return value;
}
