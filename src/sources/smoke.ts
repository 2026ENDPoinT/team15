import { hashNoticeContent } from '../../shared/canonicalize';
import { createBoardAdapter } from './boards';
import {
  collectDetail,
  fetchHtml,
  type CollectorDependencies,
} from './collector';

// Node와 Expo가 같은 입력을 해시하는지 확인하는 고정 벡터다.
export const hashProbe = {
  title: '한글 café',
  body_text: '첫 줄\r\n둘째 줄',
  extracted_links: [],
  attachments: [],
  has_body_images: false,
};
export const hashProbeExpected =
  '11d66ed8fd615fb88952c293736a4906755161b60eb1162f773303186c89a39e';

export async function runCollectionSmoke(dependencies: CollectorDependencies) {
  const hash = await hashNoticeContent(hashProbe, dependencies.sha256);
  if (hash !== hashProbeExpected) throw new Error('플랫폼 SHA-256 검증 실패');
  const results = [];
  for (const [sourceId, postId] of [
    ['seoultech_general', '897750'],
    ['seoultech_cs', '897737'],
  ] as const) {
    const adapter = createBoardAdapter(sourceId);
    const first = await fetchHtml(adapter.buildListUrl(1), dependencies);
    const refs = adapter.parseList(first.html, first.responseUrl);
    const second = await fetchHtml(
      adapter.buildListUrl(2, first),
      dependencies,
    );
    const nextRefs = adapter.parseList(second.html, second.responseUrl);
    const newIds = nextRefs.filter(
      (ref) => !refs.some((firstRef) => firstRef.id === ref.id),
    );
    if (!newIds.length)
      throw new Error(`${sourceId}: 2페이지의 신규 게시물이 없습니다.`);
    // 목록에서 밀려난 회귀 사례도 같은 출처의 실제 상세 주소로 검증한다.
    const url = new URL(adapter.listUrl);
    url.searchParams.set(
      'do',
      sourceId === 'seoultech_general' ? 'commonview' : 'view',
    );
    const boardId = sourceId === 'seoultech_general' ? '4691' : '58476';
    url.searchParams.set('bnum', boardId);
    url.searchParams.set('bidx', postId);
    const ref = refs.find((entry) => entry.postId === postId) ?? {
      id: `${sourceId}:${boardId}:${postId}`,
      sourceId,
      boardId,
      postId,
      sourceUrl: url.href,
      title: '상세 제목 확인 중',
      publishedDate: null,
    };
    const notice = await collectDetail(ref, dependencies);
    results.push({
      sourceId,
      firstPageCount: refs.length,
      secondPageNewCount: newIds.length,
      notice,
    });
  }
  return results;
}
