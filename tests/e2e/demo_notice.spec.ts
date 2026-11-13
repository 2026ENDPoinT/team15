import { expect, test } from './fixtures';

test('시연 새로고침이 관심 공지를 첫 카드와 메인에 표시한다', async ({
  page,
}) => {
  test.skip(
    process.env.EXPO_PUBLIC_NOTICE_DEMO !== '1' ||
      process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS !== '1',
    '시연 모드 웹 번들이 필요합니다.',
  );
  await page.goto('/');
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await page.getByRole('radio', { name: '정보통신대학', exact: true }).click();
  await expect(
    page.getByText('설정이 자동 저장됐어요.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '개발자 도구', exact: true }).click();
  await page
    .getByRole('button', { name: '시연 공지 새로고침', exact: true })
    .click();
  await expect(
    page.getByText(/관심사에 맞는 새 공지가 올라왔어요/),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '메인으로 돌아가기', exact: true })
    .click();
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  const card = page.getByTestId('active-page').getByTestId('discover-card');
  await expect(card.getByText('새 공지', { exact: true })).toBeVisible();
  await expect(
    card.getByRole('heading', { name: '정보통신대학 장학금 신청 안내' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('discover-refresh-area').filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '메인', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: '정보통신대학 장학금 신청 안내',
      exact: true,
    }),
  ).toBeVisible();
});
