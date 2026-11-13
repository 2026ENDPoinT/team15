import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';
import { Text } from 'react-native';
import { normalNoticeFixture } from '../../../fixtures/synthetic/notices';
import { ActionButton, Screen, styles } from '../../components/ui';
import { createNoticeRepository } from '../../db/noticeRepository';
import { createNoticeActions } from '../../services/noticeActions';
import { demoNotice } from './demoNotice';
import { notices } from './campusNotices';
import { collectedNoticeSchema } from '../../../shared/contracts';
import { hashNoticeContent } from '../../../shared/canonicalize';
import { toAnalyzeNoticeRequest } from '../../../shared/mappers';

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
    return repository;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

type Repository = Awaited<ReturnType<typeof openDemoRepository>>;
let opening: Promise<Repository> | undefined;
function getRepository() {
  return (opening ??= openDemoRepository().catch((error) => {
    opening = undefined;
    throw error;
  }));
}

async function readState(repository: Repository) {
  const home = await repository.getHomeModel();
  const checklist = await repository.getChecklist(demoNotice.id);
  const entries = await Promise.all(
    notices.map(async ({ id }) => ({
      id,
      detail: await repository.getNoticeDetail(id),
      checklist: await repository.getChecklist(id),
    })),
  );
  return {
    home,
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
  notice: typeof demoNotice;
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
  useEffect(() => {
    let active = true;
    void getRepository()
      .then(readState)
      .then(
        (result) => {
          if (active) setState(result);
        },
        () => {
          if (active) setFailed(true);
        },
      );
    return () => {
      active = false;
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
    const repository = await getRepository();
    await write(createNoticeActions(repository), repository);
    setState(await readState(repository));
  }

  const actions: DemoNoticeState['actions'] = {
    saveNotice: (id) => update((actions) => actions.saveNotice(id)),
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
      value={{ notice: demoNotice, ...state, actions }}
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
