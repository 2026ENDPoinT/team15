import { expect, test } from '@playwright/test';
import {
  t09Html,
  t09Envelope,
  t09Title,
  type T09Stage,
} from '../../fixtures/synthetic/t09';

test('T09 가상 HTML 변경·AI 실패·복구 뒤 변경 표시와 사용자 체크를 재실행까지 보존한다', async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-11-14T00:00:00Z') });
  let stage: T09Stage = 'initial';
  let failAI = false;
  let calls = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**.seoultech.ac.kr/**', async (route) => {
    const response = t09Html(route.request().url(), stage);
    await route.fulfill({
      status: response.status,
      contentType: 'text/html',
      body: await response.text(),
    });
  });
  await page.route('https://*.workers.dev/analyze-notice', async (route) => {
    calls++;
    await route.fulfill(
      failAI
        ? {
            status: 503,
            json: {
              error: {
                code: 'PROVIDER_UNAVAILABLE',
                retryable: true,
                retry_after_seconds: null,
              },
              request_id: 'injected-t09',
            },
          }
        : { json: t09Envelope(route.request().postDataJSON(), stage) },
    );
  });
  const button = (name: string) =>
    page.getByRole('button', { name, exact: true });
  const openSaved = async () => {
    await page.getByRole('tab', { name: '메인', exact: true }).click();
    const card = page
      .getByTestId('active-page')
      .getByText(t09Title, { exact: true })
      .locator('..');
    const toggle = card.getByRole('button', {
      name: /공지 자세히 보기 ∨|상세 접기 ∧/,
    });
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true')
      await toggle.click();
  };
  await page.goto('/');
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await page
    .getByLabel('AI 시연 토큰', { exact: true })
    .fill('test-only-t09-demo-token');
  await button('AI 토큰 저장').click();
  await expect(
    page.getByText('시연 토큰 등록됨', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  await button('전체 공지 보기').click();
  await button('실제 공지 새로고침').click();
  await expect(
    page.getByTestId('discover-card').getByText(t09Title, { exact: true }),
  ).toBeVisible();
  await page
    .getByTestId('discover-card')
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .click();
  await button('관심 저장').click();
  await openSaved();
  const checkedItem = page.getByRole('checkbox', {
    name: '참가 신청서 준비',
    exact: true,
  });
  await checkedItem.click();
  await expect(checkedItem).toBeChecked();
  await page
    .getByTestId('active-page')
    .getByText(t09Title, { exact: true })
    .locator('..')
    .getByRole('button', { name: '준비 중으로 변경', exact: true })
    .click();
  await expect(
    page.getByText('신청 상태 · 준비 중', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await button('1학년').click();
  await expect(
    page.getByText('설정이 자동 저장됐어요.', { exact: true }),
  ).toBeVisible();
  await openSaved();
  await expect(
    page.getByText('지원 조건 불일치 · 학년 조건이 입력한 프로필과 달라요.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(checkedItem).toBeChecked();
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await button('3학년').click();
  await expect(
    page.getByText('설정이 자동 저장됐어요.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  stage = 'changed';
  failAI = true;
  await page.clock.fastForward(31_000);
  await button('실제 공지 새로고침').click();
  await expect(
    page.getByText('공지 갱신 대기 중', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('분석 완료 0 / 1건', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('분석 중 0건 · 대기 0건 · 실패 1건 · 분석 불가 0건', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '메인', exact: true }).click();
  await expect(
    page.getByTestId('active-page').getByText(t09Title, { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  failAI = false;
  await button('남은 공지 분석').click();
  await expect(
    page.getByText('분석 완료 1 / 1건', { exact: true }),
  ).toBeVisible();
  await openSaved();
  await expect(checkedItem).toBeChecked();
  await expect(
    page.getByText('신청 상태 · 준비 중', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('신청 마감 · 2026-11-23 18:00', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('마감이 변경되었어요. 새 일정을 확인해 주세요.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/체크리스트가 변경되었어요/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('t09_changed_detail.png'),
    fullPage: true,
  });
  const callsBeforeReload = calls;
  await page.reload();
  await openSaved();
  await expect(button('마감 변경 확인')).toBeVisible();
  await expect(checkedItem).toBeChecked();
  await button('마감 변경 확인').click();
  await expect(button('마감 변경 확인')).toHaveCount(0);
  await page.reload();
  await openSaved();
  await expect(button('마감 변경 확인')).toHaveCount(0);
  await expect(checkedItem).toBeChecked();
  expect(calls).toEqual(callsBeforeReload);
  expect(errors).toEqual([]);
});
