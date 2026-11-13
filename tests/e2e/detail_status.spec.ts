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

test('메인 체크리스트 항목을 추가·삭제하고 다시 열어도 유지한다', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const expand = () =>
    page
      .getByRole('button', { name: '공지 자세히 보기 ∨', exact: true })
      .first()
      .click();
  await expand();
  const input = page.getByRole('textbox', { name: '새 체크리스트 항목' });
  const add = page.getByRole('button', {
    name: '체크리스트 항목 추가',
    exact: true,
  });
  await expect(add).toBeDisabled();
  await input.fill('  제출 확인하기  ');
  await add.click();
  const item = page.getByRole('checkbox', {
    name: '제출 확인하기',
    exact: true,
  });
  await expect(item).toBeVisible();
  await expect(input).toHaveValue('');
  await item.click();
  await expect(item).toBeChecked();
  await page
    .getByRole('button', { name: '참가 신청서 준비 삭제', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: '참가 신청서 준비', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('checklist-editor.png'),
    fullPage: true,
  });
  await page.reload();
  await expand();
  await expect(item).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: '참가 신청서 준비', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: '제출 확인하기 삭제', exact: true })
    .click();
  await expect(item).toHaveCount(0);
});
