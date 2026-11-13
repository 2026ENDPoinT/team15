import { pullRefresh } from './pull_refresh';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { extractHwpxText } from '../../worker/src/seoultechHwpx';
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import recorded from '../../fixtures/real/t09/verified.json' with { type: 'json' };
import { normalizeText } from '../../shared/canonicalize';
import { analyzeNoticeRequestSchema } from '../../shared/contracts';
import { validateAnalysis } from '../../worker/src/validate';

const sample = process.env.HWPX_SAMPLE_PATH;
const sourceNote =
  '재(휴)학증명서 발급일: 2026년 11월 2일 이후로 보임 · 첨부 내 2027년 표기와 불일치. 원문 확인 필요.';

test('실제 HWPX에서 검증한 첨부 정보를 모의 분석으로 상세와 체크리스트에 전달한다', async ({
  page,
}) => {
  test.skip(!sample, 'HWPX_SAMPLE_PATH에 897698번 첨부를 지정하세요.');
  const bytes = await readFile(sample!);
  const attachment = {
    name: basename(sample!),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    text: extractHwpxText(bytes),
  };
  const source = normalizeText(attachment.text);
  expect(attachment.name).toBe(recorded.notice.attachments[0]!.name);
  expect(attachment.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(source).toContain('2026. 11. 2. 이후 발급');
  expect(source).toContain('2027. 11. 2. 이후');
  const evidence = [
    '개인정보 수집·이용 동의서 1부',
    '공모전 참가 서약서 1부',
    '재(휴)학증명서(팀원 전체)',
  ];
  for (const quote of evidence) {
    expect(source).toContain(quote);
    expect(recorded.notice.bodyText).not.toContain(quote);
  }
  const additional = evidence.map((quote) => ({
    text: quote + ' · 출처: ' + attachment.name,
    evidence: quote,
  }));

  await page.clock.install({ time: new Date('2026-11-14T00:00:00Z') });
  await page.route('https://**.seoultech.ac.kr/**', async (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('bidx');
    if (id === '897698') {
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: await readFile('fixtures/real/t09/general_897698.html', 'utf8'),
      });
      return;
    }
    if (!id && !url.hostname.startsWith('computer')) {
      const html = await readFile(
        'fixtures/real/seoultech/general_list.html',
        'utf8',
      );
      const onlySample = html.replace(
        /<tr class="body_tr">[\s\S]*?<\/tr>/g,
        (row) => (row.includes('bidx=897698') ? row : ''),
      );
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: onlySample,
      });
      return;
    }
    await route.fulfill({ status: 503 });
  });
  await page.route('https://*.workers.dev/analyze-notice', async (route) => {
    const input = analyzeNoticeRequestSchema.parse(
      route.request().postDataJSON(),
    );
    expect(input.notice_id).toBe(recorded.notice.id);
    // The test adapter supplies attachment evidence after ordinary body validation.
    const data = validateAnalysis(input, recorded.envelope.data);
    data.checklist.push(...additional);
    data.review_notes.push(sourceNote);
    await route.fulfill({
      json: {
        notice_id: input.notice_id,
        content_hash: input.content_hash,
        schema_version: input.schema_version,
        extractor_version: input.extractor_version,
        analyzed_at: '2026-11-14T00:00:00.000Z',
        data,
      },
    });
  });

  const button = (name: string) =>
    page.getByRole('button', { name, exact: true });
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await page.goto('/');
  await tab('설정').click();
  await page
    .getByLabel('AI 시연 토큰', { exact: true })
    .fill('test-only-hwpx-demo-token');
  await button('AI 토큰 저장').click();
  await expect(
    page.getByText('시연 토큰 등록됨', { exact: true }),
  ).toBeVisible();
  await tab('맞춤 공지').click();
  await button('전체 공지 보기').click();
  await pullRefresh(page);
  const card = page.getByTestId('active-page').getByTestId('discover-card');
  await expect(
    card.getByText(recorded.notice.title, { exact: true }),
  ).toBeVisible();
  await card
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .click();
  await expect(page.getByText(sourceNote, { exact: true })).toBeVisible();
  await button('관심 저장').click();
  await tab('메인').click();
  await page
    .getByTestId('active-page')
    .getByText(recorded.notice.title, { exact: true })
    .locator('..')
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .click();
  for (const item of additional) {
    await expect(
      page.getByRole('checkbox', { name: item.text, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByText(sourceNote, { exact: true })).toBeVisible();
});
