import { expect, test } from '@playwright/test';

test('the Google button reaches Google consent', async ({ page }) => {
  await page.goto('/sign-in');
  const button = page.getByTestId('google-signin');
  await expect(button).toBeVisible();

  await button.click();
  // The OAuth hand-off leaves our origin entirely.
  await page.waitForURL(/accounts\.google\.com/, { timeout: 30_000 });
  console.log('\nlanded on:', page.url().slice(0, 130));

  await page.screenshot({ path: 'docs/screenshots/14-google-consent.png', fullPage: true });
});
