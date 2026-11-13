import { test as base, expect } from '@playwright/test';

// Existing product tests start after first-run setup. The setup spec uses a
// fresh browser without this handler to exercise the full onboarding flow.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addLocatorHandler(
      page.getByText('나에게 맞는 공지로 시작해요', { exact: true }),
      async () => {
        await page
          .getByRole('textbox', { name: '학과', exact: true })
          .fill('컴퓨터공학과');
        await page.getByRole('button', { name: '3학년', exact: true }).click();
        await page
          .getByRole('button', { name: '다음: 관심 키워드', exact: true })
          .click();
        await page
          .getByRole('button', { name: '설정 완료하고 시작하기', exact: true })
          .click();
        await expect(
          page.getByText('어떤 소식에 관심 있나요?', { exact: true }),
        ).toHaveCount(0);
      },
    );
    await use(page);
  },
});
export { expect };
