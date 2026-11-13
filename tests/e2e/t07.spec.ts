import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import verified from '../../fixtures/real/worker/t05_verified.json' with { type: 'json' };

test('실제 HTML·기록된 AI 응답이 제품 카드·저장·체크·일정과 재실행 캐시로 연결된다', async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-11-13T15:00:00Z'));
  const errors: string[] = [];
  const analyzed: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**.seoultech.ac.kr/**', async (route) => {
    const url = new URL(route.request().url());
    const prefix = url.hostname.startsWith('computer') ? 'cs' : 'general';
    const id = url.searchParams.get('bidx');
    if (id && !['897750', '897737'].includes(id)) {
      await route.fulfill({
        status: 503,
        body: 'Fixture has no detail for this notice',
      });
      return;
    }
    const kind = url.searchParams.has('do')
      ? 'detail'
      : url.searchParams.get('page') === '2'
        ? 'page2'
        : 'list';
    await route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: await readFile(
        `fixtures/real/seoultech/${prefix}_${kind}.html`,
        'utf8',
      ),
    });
  });
  await page.route('https://*.workers.dev/analyze-notice', async (route) => {
    const input = route.request().postDataJSON();
    analyzed.push(input.notice_id);
    const captured = verified.results.find(
      ({ envelope }) => envelope.notice_id === input.notice_id,
    )!;
    expect(input.content_hash).toEqual(captured.envelope.content_hash);
    await route.fulfill({ json: captured.envelope });
  });
  await page.goto('/');
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await page
    .getByLabel('AI 시연 토큰', { exact: true })
    .fill('test-only-e2e-demo-token');
  await page.getByRole('button', { name: 'AI 토큰 저장', exact: true }).click();
  await expect(
    page.getByText('시연 토큰 등록됨', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  await page
    .getByRole('button', { name: '전체 공지 보기', exact: true })
    .click();
  await page
    .getByRole('button', { name: '실제 공지 새로고침', exact: true })
    .click();
  await expect(
    page.getByText('공지 갱신 대기 중', { exact: true }),
  ).toBeVisible();
  // The title is taken from the public HTML fixture, not an authored display sample.
  const actualCsTitle = page.getByText(
    '컴퓨터공학과 취업준비 멘토링2 EPiC 신청-선착순 29명(안내-장학금지급)',
    { exact: true },
  );
  await expect(actualCsTitle).toBeVisible();
  const card = actualCsTitle.locator('..');
  await card
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .click();
  await page.getByRole('button', { name: '관심 저장', exact: true }).click();
  const cs = verified.results.find(({ envelope }) =>
    envelope.notice_id.startsWith('seoultech_cs:'),
  )!;
  const text = cs.envelope.data.checklist[0]!.text;
  await page
    .getByRole('button', { name: `체크하기 · ${text}`, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: `체크됨 · ${text}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '준비 중으로 변경', exact: true })
    .click();
  await expect(
    page.getByText('신청 상태 · 준비 중', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('t07_real_detail.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  const general = page
    .getByText(
      '[국제대학] K-로컬 문화 기행 〈팔도유람:부산편〉 로컬 메이트 모집 안내',
      { exact: true },
    )
    .locator('..');
  await general
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .click();
  await page.getByRole('button', { name: '관심 저장', exact: true }).click();
  await expect(page.getByText(/2026-12-14 시각 미확인/)).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('tab', { name: '메인', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '닫기', exact: true }),
  ).toBeHidden();
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '2026-12-14, 일정 1개', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('t07_real_home.png'),
    fullPage: true,
  });
  expect(analyzed).toHaveLength(2);
  await page.reload();
  await page
    .getByText(
      '컴퓨터공학과 취업준비 멘토링2 EPiC 신청-선착순 29명(안내-장학금지급)',
      { exact: true },
    )
    .locator('..')
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: `체크됨 · ${text}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('신청 상태 · 준비 중', { exact: true }),
  ).toBeVisible();
  expect(analyzed).toHaveLength(2);
  expect(errors).toEqual([]);
});
