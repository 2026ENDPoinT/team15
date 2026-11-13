import { expect, test } from '@playwright/test';
test('저장한 공지 상세에서 알림 영역을 숨기고 체크 상태를 유지한다', async ({
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
  const active = page.getByTestId('active-page');
  await expect(
    active.getByText(/마감 알림|예약된 알림|확정된 신청 마감 하루 전/),
  ).toHaveCount(0);
  await expect(
    active.getByRole('button', { name: '알림 상태 다시 확인', exact: true }),
  ).toHaveCount(0);
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
