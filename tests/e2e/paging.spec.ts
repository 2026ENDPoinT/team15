import { expect, test } from '@playwright/test';

test('이어진 페이지가 손가락을 따라 움직이고 취소·탭 이동·스크롤 초기화를 지원한다', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const home = page.getByTestId('campus-page-2');
  const settings = page.getByTestId('campus-page-3');
  await expect(page.getByTestId('active-page')).toBeVisible();
  const start = (await home.boundingBox())!;
  // Start in the page margin so this gesture does not classify a notice card.
  const y = start.y + 12;
  await page.mouse.move(start.x + 250, y);
  await page.mouse.down();
  await page.mouse.move(start.x + 200, y, { steps: 10 });
  await expect
    .poll(async () => (await home.boundingBox())!.x)
    .toBeLessThan(start.x - 20);
  const beforeMove = (await home.boundingBox())!.x;
  await page.mouse.move(start.x + 190, y);
  await expect
    .poll(async () => Math.abs((await home.boundingBox())!.x - beforeMove + 10))
    .toBeLessThan(2);
  const draggedHome = (await home.boundingBox())!;
  const draggedSettings = (await settings.boundingBox())!;
  expect(
    Math.abs(draggedSettings.x - (draggedHome.x + draggedHome.width)),
  ).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('connected-drag.png') });
  // A stationary release after a short drag must snap back rather than fling.
  await page.waitForTimeout(120);
  await page.mouse.up();
  await expect
    .poll(async () => Math.abs((await home.boundingBox())!.x))
    .toBeLessThan(2);
  await expect(
    page.getByRole('tab', { name: '메인', exact: true }),
  ).toBeEnabled();

  await page.mouse.move(250, y);
  await page.mouse.down();
  await page.mouse.move(70, y, { steps: 12 });
  await page.mouse.up();
  await expect(
    page.getByRole('tab', { name: '설정', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('active-page').evaluate((element) => {
    element.scrollTop = 300;
  });
  await expect
    .poll(() =>
      page.getByTestId('active-page').evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(0);

  // Nonadjacent tabs traverse the same continuous strip.
  await page.getByRole('tab', { name: '휴지통', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: '휴지통', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(async () =>
      Math.abs((await page.getByTestId('campus-page-0').boundingBox())!.x),
    )
    .toBeLessThan(2);
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: '설정', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(() =>
      page.getByTestId('active-page').evaluate((element) => element.scrollTop),
    )
    .toBe(0);

  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: '맞춤 공지', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  const scholarship = page
    .getByTestId('active-page')
    .getByText('2026학년도 2학기 장학금 신청 안내', { exact: true });
  const card = (await scholarship.locator('..').boundingBox())!;
  const cardX = card.x + card.width / 2;
  await page.mouse.move(cardX, card.y + 25);
  await page.mouse.down();
  await page.mouse.move(cardX + 5, card.y + 115, { steps: 12 });
  await page.mouse.up();
  await expect(scholarship).toHaveCount(0);
  await expect(
    page.getByRole('tab', { name: '맞춤 공지', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});
