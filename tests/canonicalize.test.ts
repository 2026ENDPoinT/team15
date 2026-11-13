import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  canonicalizeNoticeContent,
  hashNoticeContent,
} from '../shared/canonicalize';
import {
  normalNoticeFixture,
  syntheticNoticeFixtures,
} from '../fixtures/synthetic/notices';

const sha256 = async (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');

for (const fixture of syntheticNoticeFixtures) {
  test(`${fixture.key}: 고정 SHA-256 값이 정규화 입력과 일치한다`, async () => {
    assert.equal(
      await hashNoticeContent(fixture.request, sha256),
      fixture.request.content_hash,
    );
  });
}

test('개행 인코딩·수평 공백·Unicode 표현·링크 순서와 중복은 해시를 바꾸지 않는다', async () => {
  const original = {
    ...normalNoticeFixture.request,
    extracted_links: [
      ...normalNoticeFixture.request.extracted_links,
      { label: '안내', url: 'https://example.invalid/info?a=1&b=2' },
    ],
    attachments: [
      { name: '안내.pdf', url: null },
      { name: '신청서.pdf', url: null },
    ],
  };
  const equivalent = {
    ...original,
    title: `  ${original.title.normalize('NFD')}  `,
    body_text: original.body_text.replace(/ /g, ' \t ').replace(/\n/g, '\r\n'),
    extracted_links: [...original.extracted_links]
      .reverse()
      .concat(original.extracted_links),
    attachments: [...original.attachments].reverse(),
  };
  assert.equal(
    await hashNoticeContent(original, sha256),
    await hashNoticeContent(equivalent, sha256),
  );
});

test('식별자·출처 URL·계약 버전·수집 시각은 내용 해시에서 제외한다', () => {
  const original = normalNoticeFixture.request;
  const metadataChanged = {
    ...original,
    notice_id: 'another-id',
    source_url: 'https://example.invalid/another',
    schema_version: 'future',
    extractor_version: 'e2',
    fetched_at: '2026-11-14T00:00:00Z',
  };
  assert.equal(
    canonicalizeNoticeContent(original),
    canonicalizeNoticeContent(metadataChanged),
  );
});

test('날짜·문단·링크 쿼리·첨부 메타데이터·이미지 변경을 감지한다', () => {
  const original = normalNoticeFixture.request;
  for (const patch of [
    { body_text: original.body_text.replace('11월 20일', '11월 23일') },
    { body_text: original.body_text.replace(/\n/g, ' ') },
    {
      extracted_links: [
        {
          label: '신청하기',
          url: 'https://example.invalid/synthetic/apply/1?round=2',
        },
      ],
    },
    { attachments: [{ name: '추가서류.pdf', url: null }] },
    { has_body_images: true },
  ]) {
    assert.notEqual(
      canonicalizeNoticeContent(original),
      canonicalizeNoticeContent({ ...original, ...patch }),
    );
  }
});
