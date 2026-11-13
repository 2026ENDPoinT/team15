import { hashNoticeContent } from '../../shared/canonicalize';
import {
  collectedNoticeSchema,
  type CollectedNotice,
  type ListPageContext,
  type NoticeRef,
  type SourceId,
} from '../../shared/contracts';
import { createBoardAdapter, SourceError, validateBoardUrl } from './boards';

export interface CollectorDependencies {
  sha256: (text: string) => Promise<string>;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  timeoutMs?: number;
}

export interface CollectionResult {
  sourceId: SourceId;
  attemptedAt: string;
  completedAt: string;
  status: 'success' | 'partial' | 'failed';
  notices: CollectedNotice[];
  failures: Array<{
    stage: 'list' | 'detail';
    url: string;
    noticeId: string | null;
    code: string;
    message: string;
  }>;
}

// 응답 본문 읽기까지 제한한다. 실패를 빈 정상 결과로 바꾸지 않는다.
export async function fetchHtml(
  url: string,
  dependencies: Pick<CollectorDependencies, 'fetch' | 'timeoutMs'> = {},
): Promise<ListPageContext> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await (dependencies.fetch ?? globalThis.fetch)(url, {
          signal: controller.signal,
          headers: { Accept: 'text/html' },
        });
        if (!response.ok)
          throw new SourceError('HTTP_ERROR', `HTTP ${response.status}`);
        const type = response.headers.get('content-type') ?? '';
        if (!/text\/html|application\/xhtml\+xml/i.test(type))
          throw new SourceError('HTTP_ERROR', 'HTML 응답이 아닙니다.');
        return {
          html: await response.text(),
          responseUrl: response.url || url,
        };
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new SourceError('TIMEOUT', 'HTML 요청 제한 시간을 초과했습니다.'),
          );
          controller.abort();
        }, dependencies.timeoutMs ?? 10_000);
      }),
    ]);
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError('NETWORK_ERROR', '게시판에 연결하지 못했습니다.');
  } finally {
    clearTimeout(timer);
  }
}

export async function collectDetail(
  ref: NoticeRef,
  dependencies: CollectorDependencies,
): Promise<CollectedNotice> {
  validateBoardUrl(ref.sourceId, ref.sourceUrl, ref.postId);
  const page = await fetchHtml(ref.sourceUrl, dependencies);
  validateBoardUrl(ref.sourceId, page.responseUrl, ref.postId);
  const parsed = createBoardAdapter(ref.sourceId).parseDetail(page.html, ref);
  const fetchedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const contentHash = await hashNoticeContent(
    {
      title: parsed.title,
      body_text: parsed.bodyText,
      extracted_links: parsed.extractedLinks,
      attachments: parsed.attachments,
      has_body_images: parsed.hasBodyImages,
    },
    dependencies.sha256,
  );
  return collectedNoticeSchema.parse({ ...parsed, fetchedAt, contentHash });
}

export async function collectSource(
  sourceId: SourceId,
  dependencies: CollectorDependencies,
  options: { maxPages?: number; maxNotices?: number } = {},
): Promise<CollectionResult> {
  const maxPages = options.maxPages ?? 1;
  const maxNotices = options.maxNotices ?? 30;
  if (
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 5 ||
    !Number.isInteger(maxNotices) ||
    maxNotices < 1 ||
    maxNotices > 30
  ) {
    throw new RangeError('출처별 최대 5페이지·30건까지 수집합니다.');
  }
  const now = dependencies.now ?? (() => new Date());
  const adapter = createBoardAdapter(sourceId);
  const result: CollectionResult = {
    sourceId,
    attemptedAt: now().toISOString(),
    completedAt: '',
    status: 'success',
    notices: [],
    failures: [],
  };
  const refs = new Map<string, NoticeRef>();
  let previousPage: ListPageContext | undefined;
  for (let page = 1; page <= maxPages && refs.size < maxNotices; page++) {
    let url = adapter.listUrl;
    try {
      url = adapter.buildListUrl(page, previousPage);
      previousPage = await fetchHtml(url, dependencies);
      const list = adapter.parseList(
        previousPage.html,
        previousPage.responseUrl,
      );
      const oldSize = refs.size;
      for (const ref of list) {
        if (refs.size === maxNotices) break;
        refs.set(ref.id, ref);
      }
      if (refs.size === oldSize) break;
    } catch (error) {
      result.failures.push(failure('list', url, null, error));
      break;
    }
  }
  // 출처는 collectBoards에서 순차 처리하고 상세만 2개씩 처리한다.
  const queue = [...refs.values()];
  for (let index = 0; index < queue.length; index += 2) {
    const batch = queue.slice(index, index + 2);
    const outcomes = await Promise.allSettled(
      batch.map((ref) => collectDetail(ref, dependencies)),
    );
    outcomes.forEach((outcome, offset) => {
      const ref = batch[offset]!;
      if (outcome.status === 'fulfilled') result.notices.push(outcome.value);
      else
        result.failures.push(
          failure('detail', ref.sourceUrl, ref.id, outcome.reason),
        );
    });
  }
  result.status = result.failures.length
    ? result.notices.length
      ? 'partial'
      : 'failed'
    : 'success';
  result.completedAt = now().toISOString();
  return result;
}

function failure(
  stage: 'list' | 'detail',
  url: string,
  noticeId: string | null,
  error: unknown,
): CollectionResult['failures'][number] {
  return {
    stage,
    url,
    noticeId,
    code: error instanceof SourceError ? error.code : 'INVALID_NOTICE',
    message:
      error instanceof SourceError
        ? error.message
        : '수집 결과가 공지 계약을 충족하지 못했습니다.',
  };
}

export async function collectBoards(
  dependencies: CollectorDependencies,
  options: { maxPages?: number; maxNotices?: number } = {},
): Promise<CollectionResult[]> {
  const results: CollectionResult[] = [];
  for (const sourceId of ['seoultech_general', 'seoultech_cs'] as const) {
    results.push(await collectSource(sourceId, dependencies, options));
  }
  return results;
}
