import { expect, test } from '@playwright/test';

test('사용자 키워드만 삭제 모드에서 삭제한다', async ({ page }, testInfo) => {
  await page.goto('/');
  const settings = page.getByRole('tab', { name: '설정', exact: true });
  await settings.click();
  await expect(settings).toHaveAttribute('aria-selected', 'true');
  const input = page.getByRole('textbox', { name: '직접 키워드 입력' });
  await input.fill('로봇공학');
  await page.getByRole('button', { name: '키워드 추가', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '로봇공학', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '키워드 삭제', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '장학금', exact: true }),
  ).toBeDisabled();
  const custom = page.getByRole('button', {
    name: '로봇공학 삭제',
    exact: true,
  });
  await expect(custom).toHaveCSS('border-top-color', 'rgb(207, 52, 52)');
  await page.screenshot({
    path: testInfo.outputPath('keyword-delete-mode.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '삭제 취소', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '로봇공학', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '키워드 삭제', exact: true }).click();
  await custom.click();
  await expect(custom).toHaveCount(0);
  await page.getByRole('button', { name: '삭제 취소', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '장학금', exact: true }),
  ).toBeEnabled();
  await input.fill('장학금');
  await page.getByRole('button', { name: '키워드 추가', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '장학금', exact: true }),
  ).toHaveCount(1);
});
