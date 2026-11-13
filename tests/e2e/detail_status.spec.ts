import { expect, test } from '@playwright/test';
test('저장한 공지의 체크 상태와 알림 지원 상태를 표시하고 체크를 유지한다', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: '공지 자세히 보기 ∨', exact: true })
    .first()
    .click();
  await expect(
    page.getByText('신청·제출 체크리스트', { exact: true }),
  ).toBeVisible();
  const item = page.getByRole('checkbox', {
    name: '참가 신청서 준비',
    exact: true,
  });
  await expect(item).not.toBeChecked();
  await item.click();
  await expect(item).toBeChecked();
  await expect(
    page.getByText('마감 알림 · 이 환경에서는 지원하지 않아요.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '알림 상태 다시 확인', exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath('detail-status.png'),
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole('button', { name: '공지 자세히 보기 ∨', exact: true })
    .first()
    .click();
  await expect(item).toBeChecked();
});
