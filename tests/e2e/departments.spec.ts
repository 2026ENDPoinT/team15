import { expect, test } from './fixtures';

test('단과대별 학과·자유전공을 선택하고 대학 변경 시 이전 학과를 해제한다', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  const choose = (name: string) =>
    page.getByRole('radio', { name, exact: true });
  const options = page.getByTestId('department-options');
  await choose('정보통신대학').click();
  await expect(options.getByRole('radio')).toHaveText([
    '학과 선택 안 함',
    '전기정보공학과',
    '전자공학과',
    '컴퓨터공학과',
    '스마트ICT융합공학과',
    '자유전공학부(정보통신대학)',
  ]);
  await choose('자유전공학부(정보통신대학)').click();
  await expect(
    page.getByText('설정이 자동 저장됐어요.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await expect(choose('자유전공학부(정보통신대학)')).toBeChecked();
  await options.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('college-departments.png'),
  });
  for (const [college, department] of [
    ['미래융합대학', '헬스피트니스학과'],
    ['에너지바이오대학', '바이오메디컬학과'],
    ['인문사회대학', '문예창작학과'],
    ['교양대학', 'ST자유전공학부'],
    ['국제대학', '글로벌자유전공학부'],
  ] as const) {
    await choose(college).click();
    await expect(choose('학과 선택 안 함')).toBeChecked();
    await expect(
      options.getByRole('radio', { name: '컴퓨터공학과', exact: true }),
    ).toHaveCount(0);
    await choose(department).click();
    await expect(choose(department)).toBeChecked();
  }
  await choose('조형대학').click();
  await expect(options.getByRole('radio', { name: /자유전공/ })).toHaveCount(0);
  await page
    .getByRole('button', { name: '목록에 없는 학과 직접 입력', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: '학과', exact: true })
    .fill('이전 학과명');
  await expect(
    page.getByText('설정이 자동 저장됐어요.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: '학과', exact: true }),
  ).toHaveValue('이전 학과명');
  await choose('도예학과').click();
  await expect(
    page.getByRole('textbox', { name: '학과', exact: true }),
  ).toHaveCount(0);
  // Re-selecting the same college must not erase a valid department.
  await choose('조형대학').click();
  await expect(choose('도예학과')).toBeChecked();
});
