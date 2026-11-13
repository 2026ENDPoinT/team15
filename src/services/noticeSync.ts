import type {
  AnalysisEnvelope,
  AnalyzeNoticeRequest,
  CollectedNotice,
  NoticeActions,
  SourceId,
} from '../../shared/contracts';
import { toAnalyzeNoticeRequest } from '../../shared/mappers';
import type { NoticeRecord, NoticeRepository } from '../db/noticeRepository';
import {
  collectDetail,
  collectSource,
  type CollectorDependencies,
} from '../sources/collector';
import { AnalysisClientError } from './analysisClient';

export interface SyncStatus {
  phase: 'idle' | 'collecting' | 'analyzing';
  message: string | null;
  analysisRetryAt: string | null;
}

export function isLiveNotice(notice: CollectedNotice): boolean {
  return new URL(notice.sourceUrl).hostname !== 'example.invalid';
}

export function createNoticeSync(options: {
  repository: NoticeRepository;
  collector: CollectorDependencies;
  analyze: (request: AnalyzeNoticeRequest) => Promise<AnalysisEnvelope>;
  randomUUID: () => string;
  keywords?: () => string[];
  onDataChange?: () => Promise<void>;
  reconcileReminders?: () => Promise<void>;
  now?: () => Date;
  // Also useful for one-notice device smoke runs. Production defaults cover both boards.
  maxNoticesPerSource?: number;
  collectSource?: typeof collectSource;
  collectDetail?: typeof collectDetail;
}) {
  const { repository } = options;
  const now = options.now ?? (() => new Date());
  let status: SyncStatus = {
    phase: 'idle',
    message: null,
    analysisRetryAt: null,
  };
  const listeners = new Set<() => void>();
  function publish(update: Partial<SyncStatus>) {
    status = { ...status, ...update };
    for (const listener of listeners) listener();
  }
  let refresh: Promise<void> | null = null;
  let continuation: Promise<void> | null = null;
  let analysisQueue = Promise.resolve();
  const detailRequests = new Map<string, Promise<void>>();
  let authBlocked = false;
  async function changed() {
    await options.onDataChange?.();
  }
  async function reconcile() {
    try {
      await options.reconcileReminders?.();
      if (
        (await repository.listReminders()).some(
          ({ state }) => state === 'error',
        )
      ) {
        publish({
          message:
            '알림 변경을 완료하지 못했어요. 다음 갱신에서 다시 확인합니다.',
        });
      }
    } catch {
      publish({
        message:
          '알림 변경을 완료하지 못했어요. 다음 갱신에서 다시 확인합니다.',
      });
    }
  }
  async function store(notice: CollectedNotice) {
    await repository.upsertRawNotice(notice);
    // The home model omits stale events immediately; cancel old reminders before AI.
    await reconcile();
    await changed();
  }

  async function analyzeOne(record: NoticeRecord): Promise<boolean> {
    if (record.analysisFresh || !isLiveNotice(record.notice) || authBlocked)
      return false;
    const state = await repository.getSyncState();
    publish({ analysisRetryAt: state.analysisRetryAt });
    if (
      state.analysisRetryAt &&
      Date.parse(state.analysisRetryAt) > now().getTime()
    )
      return false;
    const requestKey = {
      noticeId: record.notice.id,
      contentHash: record.notice.contentHash,
      requestId: options.randomUUID(),
    };
    if (!(await repository.beginAnalysis(requestKey))) return false;
    publish({ phase: 'analyzing' });
    await changed();
    let request: AnalyzeNoticeRequest;
    try {
      request = toAnalyzeNoticeRequest(record.notice);
    } catch {
      await repository.failAnalysis(
        requestKey,
        'unsupported',
        'INPUT_TOO_LARGE',
      );
      await changed();
      return false;
    }
    try {
      const envelope = await options.analyze(request);
      // Keep the request comparison here as well as in the HTTP adapter: injected adapters
      // and future clients cannot apply another notice's response through this service.
      if (
        envelope.notice_id !== request.notice_id ||
        envelope.content_hash !== request.content_hash ||
        envelope.schema_version !== request.schema_version ||
        envelope.extractor_version !== request.extractor_version
      ) {
        throw new AnalysisClientError('INVALID_RESPONSE');
      }
      if (await repository.applyAnalysis(envelope, requestKey))
        await reconcile();
    } catch (error) {
      const failure =
        error instanceof AnalysisClientError
          ? error
          : new AnalysisClientError('NETWORK_ERROR');
      const applied = await repository.failAnalysis(
        requestKey,
        failure.code === 'INPUT_TOO_LARGE' || failure.code === 'INVALID_INPUT'
          ? 'unsupported'
          : 'failed',
        failure.code,
      );
      if (applied) publish({ message: failure.message });
      if (failure.code === 'RATE_LIMITED') {
        const retryAt = new Date(
          now().getTime() + (failure.retryAfterSeconds ?? 60) * 1000,
        ).toISOString();
        await repository.setAnalysisRetryAt(retryAt);
        publish({ analysisRetryAt: retryAt, message: failure.message });
      }
      if (
        failure.code === 'UNAUTHORIZED' ||
        failure.code === 'NOT_CONFIGURED' ||
        failure.code === 'CONTRACT_MISMATCH'
      )
        authBlocked = true;
    }
    await changed();
    return true;
  }

  function enqueueAnalysis(work: () => Promise<void>) {
    const result = analysisQueue.then(work);
    analysisQueue = result.catch(() => undefined);
    return result;
  }
  function priority(record: NoticeRecord) {
    if (record.disposition === 'saved') return 0;
    if (detailRequests.has(record.notice.id)) return 1;
    const text =
      `${record.notice.title}\n${record.notice.bodyText}`.toLocaleLowerCase(
        'ko',
      );
    if (
      options
        .keywords?.()
        .some(
          (word) =>
            word.trim() && text.includes(word.trim().toLocaleLowerCase('ko')),
        )
    )
      return 2;
    return 3;
  }
  async function analyzeBatch() {
    const attempted = new Set<string>();
    for (let count = 0; count < 10;) {
      const records = (await repository.listNoticeRecords())
        .filter(
          (record) =>
            isLiveNotice(record.notice) &&
            !record.analysisFresh &&
            record.analysisStatus !== 'unsupported' &&
            !attempted.has(record.notice.id),
        )
        .sort(
          (a, b) =>
            priority(a) - priority(b) || a.notice.id.localeCompare(b.notice.id),
        );
      const next = records[0];
      if (!next) break;
      attempted.add(next.notice.id);
      if (await analyzeOne(next)) count++;
      const state = await repository.getSyncState();
      if (
        authBlocked ||
        (state.analysisRetryAt &&
          Date.parse(state.analysisRetryAt) > now().getTime())
      )
        break;
    }
  }

  async function runRefresh(
    reason: Parameters<NoticeActions['refreshNotices']>[0],
  ) {
    const state = await repository.getSyncState();
    publish({ analysisRetryAt: state.analysisRetryAt });
    // First manual refresh opts into live collection; later launches/foregrounds refresh it.
    if (reason !== 'manual' && state.sources.length === 0) return;
    const latest = Math.max(
      0,
      ...state.sources.map(
        (source) => Date.parse(source.lastAttemptAt ?? '') || 0,
      ),
    );
    const waitMs = reason === 'manual' ? 30_000 : 30 * 60_000;
    if (latest && now().getTime() - latest < waitMs) {
      if (reason === 'manual')
        publish({
          message: '최근 갱신 후 30초가 지나면 다시 수집할 수 있어요.',
        });
      return;
    }
    publish({ phase: 'collecting', message: null });
    let failures = 0;
    const saved = (await repository.listNoticeRecords()).filter(
      (record) =>
        isLiveNotice(record.notice) &&
        record.disposition === 'saved' &&
        record.progress !== 'applied',
    );
    for (const sourceId of [
      'seoultech_general',
      'seoultech_cs',
    ] as SourceId[]) {
      const attemptedAt = now().toISOString();
      await repository.beginSourceSync(sourceId, attemptedAt);
      const result = await (options.collectSource ?? collectSource)(
        sourceId,
        { ...options.collector, now },
        {
          maxPages: 2,
          maxNotices: options.maxNoticesPerSource ?? 30,
          onNotice: store,
        },
      );
      result.attemptedAt = attemptedAt;
      // Saved notices remain refresh targets even after leaving the latest lists.
      const seen = new Set([
        ...result.notices.map(({ id }) => id),
        ...result.failures.map(({ noticeId }) => noticeId),
      ]);
      const missing = saved.filter(
        ({ notice }) => notice.sourceId === sourceId && !seen.has(notice.id),
      );
      for (let index = 0; index < missing.length; index += 2) {
        const outcomes = await Promise.allSettled(
          missing.slice(index, index + 2).map(({ notice }) =>
            (options.collectDetail ?? collectDetail)(notice, {
              ...options.collector,
              now,
            }),
          ),
        );
        for (const [offset, outcome] of outcomes.entries()) {
          const previous = missing[index + offset]!.notice;
          if (outcome.status === 'fulfilled') {
            await store(outcome.value);
            result.notices.push(outcome.value);
          } else {
            result.failures.push({
              stage: 'detail',
              url: previous.sourceUrl,
              noticeId: previous.id,
              code: 'SAVED_DETAIL_FAILED',
              message: '저장한 공지의 원문을 확인하지 못했어요.',
            });
          }
        }
      }
      result.status = result.failures.length
        ? result.notices.length
          ? 'partial'
          : 'failed'
        : 'success';
      result.completedAt = now().toISOString();
      failures += result.failures.length;
      await repository.finishSourceSync(result);
      await changed();
    }
    if (failures)
      publish({
        message: `공지 ${failures}건의 수집에 실패했어요. 기존 데이터는 유지합니다.`,
      });
    await enqueueAnalysis(analyzeBatch);
  }

  return {
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resetAccess() {
      authBlocked = false;
      publish({ message: null });
    },
    refreshNotices(
      reason: Parameters<NoticeActions['refreshNotices']>[0],
    ): Promise<void> {
      if (refresh) return refresh;
      if (continuation) return continuation;
      refresh = runRefresh(reason)
        .catch(() => {
          publish({
            message:
              '공지 갱신을 완료하지 못했어요. 저장한 데이터는 유지합니다.',
          });
        })
        .finally(() => {
          refresh = null;
          publish({ phase: 'idle' });
        });
      return refresh;
    },
    analyzePendingNotices(): Promise<void> {
      if (refresh) return refresh;
      if (continuation) return continuation;
      if (
        authBlocked ||
        (status.analysisRetryAt &&
          Date.parse(status.analysisRetryAt) > now().getTime())
      )
        return Promise.resolve();
      publish({ phase: 'analyzing', message: null });
      continuation = enqueueAnalysis(analyzeBatch)
        .catch(() => {
          publish({
            message: '분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
          });
        })
        .finally(() => {
          continuation = null;
          publish({ phase: detailRequests.size ? 'analyzing' : 'idle' });
        });
      return continuation;
    },
    analyzeNotice(noticeId: string): Promise<void> {
      const running = detailRequests.get(noticeId);
      if (running) return running;
      const result = enqueueAnalysis(async () => {
        const record = (await repository.listNoticeRecords()).find(
          ({ notice }) => notice.id === noticeId,
        );
        if (record) await analyzeOne(record);
      }).finally(() => {
        detailRequests.delete(noticeId);
        publish({
          phase:
            continuation || detailRequests.size
              ? 'analyzing'
              : refresh
                ? 'collecting'
                : 'idle',
        });
      });
      detailRequests.set(noticeId, result);
      return result;
    },
  };
}
