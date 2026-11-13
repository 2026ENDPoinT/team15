import { expect, test } from './fixtures';

test('HTML과 같은 네 화면에서 분류·보류·복구·설정이 연결된다', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  const navigateTo = async (name: string) => {
    const tab = page.getByRole('tab', { name, exact: true });
    await tab.click();
    await expect(tab).toBeEnabled();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('선택한 기회를 한눈에')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('home.png'),
    fullPage: true,
  });
  await navigateTo('맞춤 공지');
  const scholarship = page
    .getByTestId('active-page')
    .getByText('2026학년도 2학기 장학금 신청 안내', {
      exact: true,
    });
  await expect(scholarship).toBeVisible();
  await page
    .getByTestId('discover-card')
    .getByRole('button', { name: '↕ 보류', exact: true })
    .click();
  await expect(scholarship).toHaveCount(0);
  await navigateTo('메인');
  await navigateTo('맞춤 공지');
  await expect(scholarship).toHaveCount(0);
  await page
    .getByTestId('discover-card')
    .getByRole('button', { name: '↕ 보류', exact: true })
    .click();
  await expect(scholarship).toBeVisible();
  await page
    .getByTestId('discover-card')
    .getByRole('button', { name: '← 버리기', exact: true })
    .click();
  await expect(scholarship).toHaveCount(0);
  await navigateTo('휴지통');
  const trash = page.getByTestId('active-page');
  const discardedTitle = trash.getByText('2026학년도 2학기 장학금 신청 안내', {
    exact: true,
  });
  await expect(discardedTitle).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('trash.png'),
    fullPage: true,
  });
  await discardedTitle
    .locator('..')
    .getByRole('button', { name: '복구 →', exact: true })
    .click();
  await expect(discardedTitle).toHaveCount(0);
  await navigateTo('맞춤 공지');
  await page
    .getByTestId('discover-card')
    .getByRole('button', { name: '선택 →', exact: true })
    .click();
  await expect(scholarship).toHaveCount(0);
  await navigateTo('메인');
  await expect(scholarship).toBeVisible();
  const detailCard = page
    .getByTestId('active-page')
    .getByText('AI 캠퍼스 해커톤 참가자 모집', { exact: true })
    .locator('..');
  const collapsedHeight = (await detailCard.boundingBox())!.height;
  await detailCard
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .click();
  await expect(
    page
      .getByTestId('notice-sheet-content')
      .getByText('신청 대상', { exact: true }),
  ).toBeVisible();
  expect((await detailCard.boundingBox())!.height).toBe(collapsedHeight);
  await expect(
    page.getByRole('button', { name: '닫기', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('checkbox', { name: '참가 신청서 준비', checked: false })
    .click();
  await expect(
    page.getByRole('checkbox', { name: '참가 신청서 준비', checked: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  const progressSelect = detailCard.getByRole('combobox', {
    name: '공지 상태',
  });
  await expect(progressSelect).toHaveValue('preparing');
  await expect(progressSelect.locator('option')).toHaveText([
    '준비 중',
    '신청 완료',
  ]);
  await expect(
    detailCard.getByRole('button', { name: /으로 변경|로 변경/ }),
  ).toHaveCount(0);
  await progressSelect.selectOption('preparing');
  await expect(progressSelect).toHaveValue('preparing');
  await progressSelect.selectOption('applied');
  await expect(progressSelect).toHaveValue('applied');
  await progressSelect.selectOption('preparing');
  await expect(progressSelect).toHaveValue('preparing');
  await page.screenshot({
    path: testInfo.outputPath('progress-select.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(scholarship).toBeVisible();
  await detailCard
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: '참가 신청서 준비', checked: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(progressSelect).toHaveValue('preparing');
  await expect(detailCard.getByText('신청 대상', { exact: true })).toHaveCount(
    0,
  );
  expect((await detailCard.boundingBox())!.height).toBe(collapsedHeight);
  await navigateTo('설정');
  await page.getByRole('button', { name: '대회', exact: true }).click();
  await page.getByRole('button', { name: '장학금', exact: true }).click();
  await expect(
    page.getByText('설정이 자동 저장됐어요.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('선호 키워드를 선택하면 맞춤 공지를 볼 수 있어요.'),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: '직접 키워드 입력', exact: true })
    .fill('인공지능');
  await page.getByRole('button', { name: '키워드 추가', exact: true }).click();
  await expect(
    page.getByText('설정이 자동 저장됐어요.', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('settings.png'),
    fullPage: true,
  });
  await navigateTo('맞춤 공지');
  await expect(
    page.getByText('학부생 AI 연구 프로젝트 참여자 추가 모집', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('discover.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
