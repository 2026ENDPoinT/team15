import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';
import { parseDocument } from 'htmlparser2';
import { createBoardAdapter, SourceError } from '../src/sources/boards';
import {
  collectBoards,
  collectDetail,
  collectSource,
  fetchHtml,
} from '../src/sources/collector';
import { htmlToText } from '../src/sources/html';
import { hashNoticeContent } from '../shared/canonicalize';
import { hashProbe, hashProbeExpected } from '../src/sources/smoke';
import { collectedNoticeSchema } from '../shared/contracts';
import manifest from '../fixtures/real/seoultech/manifest.json';

const fixture = (file: string) =>
  readFileSync(
    new URL(`../fixtures/real/seoultech/${file}.html`, import.meta.url),
    'utf8',
  );
const sha256 = async (text: string) =>
  createHash('sha256').update(text).digest('hex');
const now = () => new Date('2026-11-13T12:00:00Z');
test('기기 검증용 한글·개행 SHA-256 벡터가 Node 결과와 일치한다', async () => {
  assert.equal(await hashNoticeContent(hashProbe, sha256), hashProbeExpected);
});
const cases = [
  {
    sourceId: 'seoultech_general',
    prefix: 'general',
    postId: '897750',
    title:
      '[국제대학] K-로컬 문화 기행 〈팔도유람:부산편〉 로컬 메이트 모집 안내',
  },
  {
    sourceId: 'seoultech_cs',
    prefix: 'cs',
    postId: '897737',
    title:
      '컴퓨터공학과 취업준비 멘토링2 EPiC 신청-선착순 29명(안내-장학금지급)',
  },
] as const;

test('실제 HTML fixture의 원본 바이트·출처 메타데이터를 검증한다', () => {
  for (const entry of manifest) {
    const bytes = readFileSync(
      new URL(`../fixtures/real/seoultech/${entry.file}`, import.meta.url),
    );
    assert.equal(bytes.length, entry.bytes);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      entry.sha256,
    );
    assert.ok(entry.sourceUrl.startsWith('https://'));
  }
});

for (const item of cases) {
  const adapter = createBoardAdapter(item.sourceId);
  const page = {
    html: fixture(`${item.prefix}_list`),
    responseUrl: adapter.listUrl,
  };
  const refs = adapter.parseList(page.html, page.responseUrl);
  const ref = refs.find((value) => value.postId === item.postId)!;
  test(`${item.sourceId}: 실제 목록·2페이지·고정 공지를 ID로 구분한다`, () => {
    assert.ok(ref);
    assert.equal(new Set(refs.map((value) => value.id)).size, refs.length);
    const nextUrl = adapter.buildListUrl(2, page);
    const params = new URL(nextUrl).searchParams;
    assert.equal(params.get('page'), '2');
    assert.equal(params.get('bidx'), ref.boardId);
    assert.equal(params.get('allboard'), 'false');
    assert.equal(params.has('nowpage'), false);
    const second = adapter.parseList(fixture(`${item.prefix}_page2`), nextUrl);
    assert.ok(
      second.some((value) => !refs.some((first) => first.id === value.id)),
    );
    assert.ok(
      second.some((value) => refs.some((first) => first.id === value.id)),
    );
  });

  test(`${item.sourceId}: 실제 상세의 제목·날짜·본문·링크·첨부를 추출한다`, () => {
    const result = adapter.parseDetail(fixture(`${item.prefix}_detail`), {
      ...ref,
      title: '더보기 +',
    });
    assert.equal(result.title, item.title);
    assert.equal(result.id, `${item.sourceId}:${ref.boardId}:${item.postId}`);
    assert.equal(result.publishedDate, '2026-11-12');
    assert.equal(result.sourceUpdatedAt, null);
    assert.doesNotMatch(result.bodyText, /조회수|개인정보처리방침|copyright/i);
    if (item.prefix === 'cs') {
      assert.match(result.bodyText, /선착순 마감/);
      assert.match(result.bodyText, /11\.2\.\(월\)~12\.23\.\(수\)/);
      assert.equal(result.hasBodyImages, false);
      assert.deepEqual(result.attachments, [
        {
          name: '취업 멘토링2차_운영_EPiC_멘티_1신청주요내용_계획서_메뉴얼(안내_홈페지).pdf',
          url: null,
        },
      ]);
      assert.ok(
        result.extractedLinks.some(
          (link) => link.url === 'https://epic.seoultech.ac.kr/',
        ),
      );
    } else {
      assert.equal(result.hasBodyImages, true);
      assert.deepEqual(result.attachments, []);
      assert.ok(
        result.extractedLinks.some(
          (link) => link.url === 'https://forms.gle/rQPRbn8bEEpPDTMK9',
        ),
      );
    }
  });

  test(`${item.sourceId}: 선택자 누락·로그인 화면을 실패로 처리한다`, () => {
    const original = fixture(`${item.prefix}_detail`);
    assert.throws(
      () =>
        adapter.parseDetail(
          original.replace('class="cont"', 'class="changed"'),
          ref,
        ),
      SourceError,
    );
    assert.throws(
      () => adapter.parseDetail('<html>로그인 필요</html>', ref),
      SourceError,
    );
    assert.throws(
      () => adapter.parseList('<html>오류</html>', adapter.listUrl),
      SourceError,
    );
    assert.throws(
      () =>
        adapter.parseDetail(original, {
          ...ref,
          sourceUrl: 'https://example.com/?bidx=1',
        }),
      SourceError,
    );
  });
}

function detail(body: string, attachment = '') {
  return `<div class="wrap_view"><table class="tbl_view"><tr><th>제목</th><td>테스트</td><th>날짜</th><td>2026-02-30</td></tr><tr><td><ul class="list_attach">${attachment}</ul></td></tr><tr><td class="cont">${body}</td></tr></table></div>`;
}
const general = createBoardAdapter('seoultech_general');
const generalRef = general
  .parseList(fixture('general_list'), general.listUrl)
  .find((ref) => ref.postId === '897750')!;

test('목록 제목의 행사 날짜를 게시일로 오인하지 않는다', () => {
  const html = fixture('general_list').replace(
    '로컬 메이트 모집 안내',
    '2027-01-01 로컬 메이트 모집 안내',
  );
  assert.equal(
    general
      .parseList(html, general.listUrl)
      .find((ref) => ref.postId === '897750')?.publishedDate,
    '2026-11-12',
  );
});

test('명시적인 빈 목록과 목록 구조 변경을 구별한다', () => {
  assert.deepEqual(
    general.parseList(
      '<div class="wrap_list"><table class="tbl_list"><tr><td>등록된 게시물이 없습니다.</td></tr></table></div>',
      general.listUrl,
    ),
    [],
  );
  assert.throws(
    () =>
      general.parseList(
        '<div class="wrap_list"><table class="tbl_list"></table></div>',
        general.listUrl,
      ),
    SourceError,
  );
});

test('문단·표·entity·상대 링크를 보존하고 스크립트와 위험 URL을 제외한다', () => {
  const result = general.parseDetail(
    detail(
      '<script>secret()</script><style>.x{}</style><p>A &amp; B&nbsp;1<br>2</p><table><tr><td>항목</td><td>금액</td></tr><tr><td>장학금</td><td>10,000원</td></tr></table><a href="/apply?q=1&amp;x=2#part">신청</a><a href="javascript:run()">실행</a><p>https://example.org/a(b). https://example.org/x).</p>',
    ),
    generalRef,
  );
  assert.match(result.bodyText, /A & B 1\n2/);
  assert.match(result.bodyText, /항목 \| 금액\n+장학금 \| 10,000원/);
  assert.doesNotMatch(result.bodyText, /secret|\.x/);
  assert.equal(result.publishedDate, null);
  assert.deepEqual(
    result.extractedLinks.map((link) => link.url),
    [
      'https://www.seoultech.ac.kr/apply?q=1&x=2#part',
      'https://example.org/a(b)',
      'https://example.org/x',
    ],
  );
});

test('이미지·첨부 중심은 보존하지만 근거 없이 비어 있는 상세는 거절한다', () => {
  assert.equal(
    general.parseDetail(detail('<img src="poster.png">'), generalRef)
      .hasBodyImages,
    true,
  );
  const attached = general.parseDetail(
    detail(
      '',
      '<li><a href="/files/a.pdf">신청서.pdf</a></li><li><a href="javascript:download()">안내.pdf</a></li>',
    ),
    generalRef,
  );
  assert.equal(attached.bodyText, '');
  assert.deepEqual(attached.attachments, [
    { name: '신청서.pdf', url: 'https://www.seoultech.ac.kr/files/a.pdf' },
    { name: '안내.pdf', url: null },
  ]);
  assert.throws(
    () => general.parseDetail(detail('<p> </p>'), generalRef),
    SourceError,
  );
});

test('표 구분자를 추가할 때 원문 문장부호와 빈 셀을 보존한다', () => {
  assert.equal(
    htmlToText(
      parseDocument(
        '<p>문장 끝 |</p><table><tr><td>A|</td><td></td><td>1,000원!</td></tr></table><p>끝 |</p>',
      ),
    ),
    '문장 끝 |\n\nA| | | 1,000원!\n\n끝 |',
  );
});

test('본문 정제는 인라인 문장과 문단을 보존한다', () => {
  assert.equal(
    htmlToText(
      parseDocument('<p>신청<strong>마감</strong>: 18:00</p><p>다음 문단</p>'),
    ),
    '신청마감: 18:00\n\n다음 문단',
  );
});

const response = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
test('수집 시각이 달라도 같은 본문은 같은 해시이며 장문을 자르지 않는다', async () => {
  const fetch: typeof globalThis.fetch = async () =>
    response(detail(`<p>${'가'.repeat(20_001)}</p>`));
  const a = await collectDetail(generalRef, { fetch, sha256, now });
  const b = await collectDetail(generalRef, {
    fetch,
    sha256,
    now: () => new Date('2026-11-14T00:00:00Z'),
  });
  collectedNoticeSchema.parse(a);
  assert.equal(a.bodyText.length, 20_001);
  assert.equal(a.contentHash, b.contentHash);
  assert.notEqual(a.fetchedAt, b.fetchedAt);
});

test('HTTP·HTML 형식·네트워크·본문 읽기 시간 초과를 구별한다', async () => {
  for (const [fetch, code] of [
    [async () => response('error', 503), 'HTTP_ERROR'],
    [
      async () =>
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
      'HTTP_ERROR',
    ],
    [
      async () => {
        throw new Error('offline');
      },
      'NETWORK_ERROR',
    ],
    [
      async () => {
        const res = response('');
        res.text = () => new Promise(() => {});
        return res;
      },
      'TIMEOUT',
    ],
  ] as const) {
    await assert.rejects(
      fetchHtml(general.listUrl, { fetch, timeoutMs: 10 }),
      (error: unknown) => error instanceof SourceError && error.code === code,
    );
  }
});

test('상세 리다이렉트가 다른 게시물로 향하면 거절한다', async () => {
  const fetch: typeof globalThis.fetch = async () => {
    const res = response(fixture('general_detail'));
    Object.defineProperty(res, 'url', {
      value: generalRef.sourceUrl.replace('897750', '1'),
    });
    return res;
  };
  await assert.rejects(
    collectDetail(generalRef, { fetch, sha256 }),
    SourceError,
  );
});

test('두 페이지의 중복을 제거하고 상세 동시 요청을 2개로 제한한다', async () => {
  const ids: string[] = [];
  let active = 0;
  let peak = 0;
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (!url.searchParams.has('do'))
      return response(
        fixture(
          url.searchParams.get('page') === '2'
            ? 'general_page2'
            : 'general_list',
        ),
      );
    ids.push(url.searchParams.get('bidx')!);
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return response(fixture('general_detail'));
  };
  const result = await collectSource(
    'seoultech_general',
    { fetch, sha256, now },
    { maxPages: 2 },
  );
  assert.equal(result.status, 'success');
  assert.equal(result.notices.length, 30);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(peak, 2);
});

test('한 출처 목록 실패가 다른 출처 수집을 막지 않으며 상세 실패를 보존한다', async () => {
  let detailCount = 0;
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'www.seoultech.ac.kr') return response('offline', 503);
    if (!url.searchParams.has('do')) return response(fixture('cs_list'));
    return ++detailCount === 1
      ? response('failed', 500)
      : response(fixture('cs_detail'));
  };
  const results = await collectBoards(
    { fetch, sha256, now },
    { maxNotices: 2 },
  );
  assert.equal(results[0]?.status, 'failed');
  assert.equal(results[1]?.status, 'partial');
  assert.equal(results[1]?.notices.length, 1);
  assert.equal(results[1]?.failures[0]?.stage, 'detail');
});

test('2페이지 실패는 이미 수집한 원문을 보존하면서 부분 실패를 반환한다', async () => {
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    return response(
      url.searchParams.has('do')
        ? fixture('general_detail')
        : url.searchParams.get('page') === '2'
          ? '로그인'
          : fixture('general_list'),
    );
  };
  const result = await collectSource(
    'seoultech_general',
    { fetch, sha256 },
    { maxPages: 2 },
  );
  assert.equal(result.status, 'partial');
  assert.ok(result.notices.length > 0);
  assert.equal(result.failures[0]?.stage, 'list');
});
