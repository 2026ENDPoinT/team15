import { expect, type Page } from '@playwright/test';

export async function pullRefresh(page: Page) {
  await expect(
    page.getByRole('tab', { name: '맞춤 공지', exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId('discover-refresh-indicator')).toHaveCount(0);
  const area = page.getByTestId('discover-refresh-area');
  await expect(area).toBeVisible();
  await area.hover({ position: { x: 15, y: 10 } });
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 15, box.y + 100, { steps: 12 });
  await expect(page.getByTestId('discover-refresh-indicator')).toBeVisible();
  await page.mouse.up();
}
