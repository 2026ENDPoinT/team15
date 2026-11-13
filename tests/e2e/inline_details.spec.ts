import { expect, test } from '@playwright/test';

test('맞춤 공지는 한 장씩 처리하고 상세를 펼쳤을 때만 스크롤한다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/');
  const discover = page.getByRole('tab', { name: '맞춤 공지', exact: true });
  await discover.click();
  await expect(discover).toBeEnabled();
  const active = page.getByTestId('active-page');
  const card = active.getByTestId('discover-card');
  const body = card.getByTestId('discover-card-body');
  const scholarship = '2026학년도 2학기 장학금 신청 안내';
  const next = '학부생 AI 연구 프로젝트 참여자 추가 모집';
  await expect(card).toHaveCount(1);
  await expect(card.getByText(scholarship, { exact: true })).toBeVisible();
  await expect(active.getByText(next, { exact: true })).toHaveCount(0);
  await expect(active.getByText('나에게 맞는 새로운 기회')).toHaveCount(0);
  await expect(body).not.toHaveCSS('overflow-y', 'auto');
  const originalHeight = (await card.boundingBox())!.height;
  await card.getByRole('button', { name: '공지 자세히 보기 ↗' }).click();
  await expect(body).not.toHaveCSS('overflow-y', 'auto');
  await expect(body.getByTestId(/^notice-detail-/)).toBeVisible();
  expect((await card.boundingBox())!.height).toBeGreaterThan(originalHeight);
  await active.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(() => active.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await expect(
    card.getByRole('button', { name: '↕ 보류', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('discover-details.png') });
  await card.getByRole('button', { name: '접어 두기 ↑' }).click();
  await expect(body).toHaveCSS('overflow-y', 'hidden');
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);
  await card.getByRole('button', { name: '↕ 보류', exact: true }).click();
  await expect(card.getByText(next, { exact: true })).toBeVisible();
  await expect(card.getByText(scholarship, { exact: true })).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: '공지 자세히 보기 ↗' }),
  ).toHaveAttribute('aria-expanded', 'false');
  await card.getByRole('button', { name: '← 버리기', exact: true }).click();
  await expect(card).toHaveCount(0);
  const home = page.getByRole('tab', { name: '메인', exact: true });
  await home.click();
  await expect(home).toBeEnabled();
  await discover.click();
  await expect(discover).toBeEnabled();
  await expect(card.getByText(scholarship, { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '선택 →', exact: true }).click();
  await expect(card).toHaveCount(0);
});
