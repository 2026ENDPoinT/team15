import { expect, test } from './fixtures';

const toolsEnabled = process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === '1';

test('일반 화면은 공지와 마감 알림 설정을 제공하고 검증 동작을 분리한다', async ({
  page,
}, testInfo) => {
  async function navigateTo(name: string) {
    const tab = page.getByRole('tab', { name, exact: true });
    await tab.click();
    await expect(tab).toBeEnabled();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
  await page.goto('/');
  await navigateTo('맞춤 공지');
  await expect(
    page.getByRole('button', { name: /T02 수집 검증|T09 변경·알림 검증/ }),
  ).toHaveCount(0);
  await navigateTo('설정');
  await expect(page.getByText('마감 알림', { exact: true })).toBeVisible();
  await expect(
    page.getByText('마감 알림은 모바일 앱에서 사용할 수 있어요.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /테스트 알림|가상 마감|마감 알림 허용/ }),
  ).toHaveCount(0);
  const menu = page.getByRole('button', { name: '개발자 도구', exact: true });
  if (toolsEnabled) {
    await menu.click();
    await expect(
      page.getByRole('heading', { name: '개발자 도구', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'T02 수집 검증 열기' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'T09 변경·알림 검증 열기' }).click();
    await expect(
      page.getByRole('heading', { name: 'T09 기기 검증' }),
    ).toBeVisible();
  } else {
    await expect(menu).toHaveCount(0);
    await page.getByText('마감 알림', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('settings.png'),
      fullPage: true,
    });
    for (const path of ['/dev', '/dev/collection', '/dev/t09']) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', {
          name: '선택한 기회를 한눈에',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /검증|가상 공지 저장·예약/ }),
      ).toHaveCount(0);
    }
  }
});
