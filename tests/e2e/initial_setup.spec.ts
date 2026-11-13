import { expect, test } from '@playwright/test';

test('첫 실행 설정과 키워드는 저장되고 재실행 시 설정을 반복하지 않는다', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByText('나에게 맞는 공지로 시작해요', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: '메인', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText('나에게 맞는 공지로 시작해요', { exact: true }),
  ).toBeVisible();
  await page.getByRole('radio', { name: '정보통신대학', exact: true }).click();
  await page
    .getByRole('textbox', { name: '학과', exact: true })
    .fill('컴퓨터공학과');
  await page.getByRole('button', { name: '2학년', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('initial-profile.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: '다음: 관심 키워드', exact: true })
    .click();
  await page.getByRole('checkbox', { name: '대회', exact: true }).click();
  await page
    .getByRole('textbox', { name: '관심 키워드 직접 입력' })
    .fill('로봇');
  await page.getByRole('button', { name: '키워드 추가', exact: true }).click();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: '학과', exact: true }),
  ).toHaveValue('컴퓨터공학과');
  await page
    .getByRole('button', { name: '다음: 관심 키워드', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: '로봇', exact: true }),
  ).toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath('initial-keywords.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: '설정 완료하고 시작하기', exact: true })
    .click();
  await expect(
    page.getByRole('tab', { name: '메인', exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: '학과', exact: true }),
  ).toHaveValue('컴퓨터공학과');
  await expect(
    page.getByRole('radio', { name: '정보통신대학', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('button', { name: '로봇', exact: true }),
  ).toContainText('로봇 ✓');
  if (process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === '1') {
    await page
      .getByRole('button', { name: '개발자 도구', exact: true })
      .click();
    await page
      .getByRole('button', { name: '앱 데이터 초기화', exact: true })
      .click();
    await expect(
      page.getByText('삭제한 데이터는 복구할 수 없어요. 초기화할까요?'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '초기화 취소', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: '모든 데이터 삭제하고 초기화',
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: '앱 데이터 초기화', exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath('reset-confirmation.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: '모든 데이터 삭제하고 초기화', exact: true })
      .click();
    await expect(
      page.getByText('나에게 맞는 공지로 시작해요', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('나에게 맞는 공지로 시작해요', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: '학과', exact: true }),
    ).toHaveValue('');
    await page
      .getByRole('button', { name: '다음: 관심 키워드', exact: true })
      .click();
    await expect(
      page.getByRole('checkbox', { name: '로봇', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: '설정 완료하고 시작하기', exact: true })
      .click();
    await expect(
      page.getByRole('tab', { name: '메인', exact: true }),
    ).toBeVisible();
  }
});
