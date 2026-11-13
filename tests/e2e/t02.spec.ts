import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('실제 HTML fixture로 Expo 파싱·해시·검증 화면을 연결한다', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**.seoultech.ac.kr/**', async (route) => {
    const url = new URL(route.request().url());
    const prefix =
      url.hostname === 'computer.seoultech.ac.kr' ? 'cs' : 'general';
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
  await page.goto('/dev/collection');
  await page
    .getByRole('button', { name: '두 게시판 수집 확인', exact: true })
    .click();
  await expect(
    page.getByText('두 게시판 수집·해시 확인 성공', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('1페이지 21건 · 2페이지 신규 15건'),
  ).toBeVisible();
  await expect(page.getByText('1페이지 10건 · 2페이지 신규 6건')).toBeVisible();
  await expect(
    page.getByText('ID: seoultech_general:4691:897750', { exact: false }),
  ).toContainText(
    '48778f6d4e82e14ef49a3e70870de55a56299a79943643e31f424fd3734b77b5',
  );
  await expect(
    page.getByText('ID: seoultech_cs:58476:897737', { exact: false }),
  ).toContainText(
    'bd34ef92c2ed6a4fd7029aa10b478e618984988c070e0d0c33fdaf0dfb14e857',
  );
  await expect(
    page.getByText('첨부: 취업 멘토링2차', { exact: false }),
  ).toContainText('원문에서 확인');
  await page.screenshot({
    path: testInfo.outputPath('t02_collection.png'),
    fullPage: true,
  });
  // 성공 결과가 남은 상태에서 실패를 새 성공처럼 보여주지 않는다.
  await page.unroute('https://**.seoultech.ac.kr/**');
  await page.route('https://**.seoultech.ac.kr/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/html',
      body: 'unavailable',
    }),
  );
  await page
    .getByRole('button', { name: '두 게시판 수집 확인', exact: true })
    .click();
  await expect(page.getByText('수집 확인 실패', { exact: true })).toBeVisible();
  await expect(page.getByText('HTTP 503', { exact: true })).toBeVisible();
  await expect(
    page.getByText('ID: seoultech_cs:58476:897737', { exact: false }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '메인으로 돌아가기' }).click();
  await expect(
    page.getByRole('heading', { name: '선택한 기회를 한눈에', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '맞춤 공지', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('이전 공지 찾기 주소는 새 통합 UI로 연결된다', async ({ page }) => {
  await page.goto('/discover');
  await expect(
    page.getByRole('heading', { name: '선택한 기회를 한눈에', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: '맞춤 공지', exact: true }),
  ).toBeVisible();
});
