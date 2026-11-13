import { expect, test } from './fixtures';
test('저장한 공지 상세에서 알림 영역을 숨기고 체크 상태를 유지한다', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
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
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
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
      .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
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

test('메인 카드 메모를 저장·수정·비우고 다시 열어도 유지한다', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const expand = () =>
    page
      .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
      .first()
      .click();
  await expand();
  const input = page.getByRole('textbox', { name: '공지 메모', exact: true });
  const save = page.getByRole('button', { name: '메모 저장', exact: true });
  await expect(input).toHaveValue('');
  await expect(save).toBeDisabled();
  await input.fill('신청서 준비\n제출 후 담당자에게 확인');
  await save.click();
  await expect(page.getByText('저장하지 않은 변경사항이 있어요.')).toHaveCount(
    0,
  );
  await expect(save).toBeDisabled();
  await page.reload();
  await expand();
  await expect(input).toHaveValue('신청서 준비\n제출 후 담당자에게 확인');
  await input.fill('제출 완료, 결과 확인하기');
  await save.click();
  await expect(page.getByText('저장하지 않은 변경사항이 있어요.')).toHaveCount(
    0,
  );
  await expect(save).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('notice-memo.png'),
    fullPage: true,
  });
  await page.reload();
  await expand();
  await expect(input).toHaveValue('제출 완료, 결과 확인하기');
  await input.fill('');
  await save.click();
  await expect(page.getByText('저장하지 않은 변경사항이 있어요.')).toHaveCount(
    0,
  );
  await expect(save).toBeDisabled();
  await page.reload();
  await expand();
  await expect(input).toHaveValue('');
});

test('메인과 휴지통 상세는 별도 화면에서 열리고 닫으면 카드 크기와 위치를 유지한다', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const active = page.getByTestId('active-page');
  const card = active
    .getByText('AI 캠퍼스 해커톤 참가자 모집', { exact: true })
    .locator('..');
  await card
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .scrollIntoViewIfNeeded();
  const before = await card.boundingBox();
  await card
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .click();
  const sheet = page.getByTestId('notice-sheet-content');
  await expect(
    sheet.getByRole('heading', { name: 'AI 캠퍼스 해커톤 참가자 모집' }),
  ).toBeVisible();
  await expect(
    sheet.getByRole('textbox', { name: '공지 메모', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await sheet.boundingBox())!.y)
    .toBeLessThan(100);
  await page.screenshot({
    path: testInfo.outputPath('home-detail-screen.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(sheet).toBeHidden();
  expect(await card.boundingBox()).toEqual(before);
  await card
    .getByRole('button', { name: '← 휴지통으로 이동', exact: true })
    .click();
  await page.getByRole('tab', { name: '휴지통', exact: true }).click();
  await card
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .scrollIntoViewIfNeeded();
  const trashBefore = await card.boundingBox();
  await card
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .click();
  await expect(
    sheet.getByRole('heading', { name: 'AI 캠퍼스 해커톤 참가자 모집' }),
  ).toBeVisible();
  await expect(sheet.getByText('주요 일정', { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await sheet.boundingBox())!.y)
    .toBeLessThan(100);
  await page.screenshot({
    path: testInfo.outputPath('trash-detail-screen.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(sheet).toBeHidden();
  expect(await card.boundingBox()).toEqual(trashBefore);
  await card.getByRole('button', { name: '복구 →', exact: true }).click();
  await expect(card).toHaveCount(0);
});
