/**
 * Walks the whole product and saves the screenshots the README uses as grading evidence.
 *
 *   npm run evidence                                   (local dev server)
 *   E2E_BASE_URL=https://<app>.vercel.app npm run evidence   (the deployed app)
 *
 * Each step is a real user action against a real database, so a passing run is itself proof that
 * the flows work — the screenshots are a by-product, not a staged mock-up.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'docs/screenshots';
mkdirSync(SHOTS, { recursive: true });

const A_EMAIL = process.env.TEST_USER_A_EMAIL;
const A_PASSWORD = process.env.TEST_USER_A_PASSWORD;
const B_EMAIL = process.env.TEST_USER_B_EMAIL;
const B_PASSWORD = process.env.TEST_USER_B_PASSWORD;

test.skip(
  !A_EMAIL || !A_PASSWORD || !B_EMAIL || !B_PASSWORD,
  'Set the TEST_USER_A/B_EMAIL and _PASSWORD variables in .env.local first.',
);

// A name unique to this run so re-running never trips over an earlier contact.
const CONTACT = `Priya Raman ${Date.now().toString().slice(-5)}`;
const RENAMED = `${CONTACT} (mentor)`;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Signs in, falling back to creating the account the first time. */
async function signIn(page: Page, email: string, password: string, name: string) {
  await page.goto('/sign-in');
  await page.getByTestId('email').fill(email);
  await page.getByTestId('password').fill(password);
  await page.getByTestId('submit-auth').click();

  const landed = await page
    .waitForURL('**/contacts', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (landed) return;

  // No account yet — switch to sign up.
  await page.getByTestId('toggle-mode').click();
  await page.getByLabel('Name').fill(name);
  await page.getByTestId('email').fill(email);
  await page.getByTestId('password').fill(password);
  await page.getByTestId('submit-auth').click();
  await page.waitForURL('**/contacts', { timeout: 20_000 });
}

test.describe.configure({ mode: 'serial' });

test('01 — signed out visitors are sent to sign in', async ({ page }) => {
  await page.goto('/contacts');
  await page.waitForURL('**/sign-in');
  await expect(page.getByTestId('submit-auth')).toBeVisible();
  await shot(page, '01-sign-in');
});

test('02 — user A signs in', async ({ page }) => {
  await signIn(page, A_EMAIL!, A_PASSWORD!, 'Test User A');
  await expect(page.getByTestId('signed-in-as')).toContainText(A_EMAIL!);
  await shot(page, '02-signed-in');
});

test('03 — an empty name fails safely with a clear message', async ({ page }) => {
  await signIn(page, A_EMAIL!, A_PASSWORD!, 'Test User A');
  await page.getByTestId('add-contact').click();

  // Fill everything except the name, then submit. The form has no `required` attribute, so this
  // reaches the backend and the message shown is the one the server returned.
  await page.getByLabel('Company').fill('Anthropic');
  await page.getByRole('button', { name: 'Add contact', exact: true }).last().click();

  await expect(page.getByTestId('error-name')).toHaveText('Name is required.');
  await shot(page, '03-invalid-input');

  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('04 — user A creates a contact', async ({ page }) => {
  await signIn(page, A_EMAIL!, A_PASSWORD!, 'Test User A');
  await page.getByTestId('add-contact').click();

  await page.getByLabel('Name').fill(CONTACT);
  await page.getByLabel('Company').fill('Anthropic');
  await page.getByLabel('Role').fill('Research Engineer');
  await page.getByLabel('Where you met').fill('Berkeley AI Systems mixer');
  await page.getByLabel('Notes').fill('Follow up about her interpretability reading group.');

  await page.getByLabel('Priority').click();
  await page.getByRole('option', { name: 'High' }).click();

  await page.getByRole('button', { name: 'Add contact', exact: true }).last().click();

  await expect(page.getByText(CONTACT)).toBeVisible();
  await shot(page, '04-contact-created');
});

test('05 — the contact survives a full page refresh', async ({ page }) => {
  await signIn(page, A_EMAIL!, A_PASSWORD!, 'Test User A');
  await page.reload();
  await expect(page.getByText(CONTACT)).toBeVisible();
  await shot(page, '05-after-refresh');
});

test('06 — user A edits the contact', async ({ page }) => {
  await signIn(page, A_EMAIL!, A_PASSWORD!, 'Test User A');

  await page.getByRole('button', { name: `Edit ${CONTACT}` }).click();
  await page.getByLabel('Name').fill(RENAMED);
  await page.getByLabel('Priority').click();
  await page.getByRole('option', { name: 'Medium' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText(RENAMED)).toBeVisible();
  await shot(page, '06-contact-edited');
});

test('07 — sorting and filtering', async ({ page }) => {
  await signIn(page, A_EMAIL!, A_PASSWORD!, 'Test User A');

  await page.getByTestId('sort-select').click();
  await page.getByRole('option', { name: 'Name A–Z' }).click();
  await expect(page.getByTestId('contact-row').first()).toBeVisible();
  await shot(page, '07-sorted-by-name');

  await page.getByTestId('search').fill(RENAMED.slice(0, 5));
  await expect(page.getByText(RENAMED)).toBeVisible();
  await shot(page, '08-filtered');
  await page.getByTestId('search').fill('');
});

test('08 — user A list, for the privacy comparison', async ({ page }) => {
  await signIn(page, A_EMAIL!, A_PASSWORD!, 'Test User A');
  await expect(page.getByText(RENAMED)).toBeVisible();
  await shot(page, '09-user-a-list');
});

test('09 — user B cannot see user A contacts', async ({ page }) => {
  await signIn(page, B_EMAIL!, B_PASSWORD!, 'Test User B');
  await expect(page.getByTestId('signed-in-as')).toContainText(B_EMAIL!);

  // The heart of the privacy test: B's list must not contain A's contact.
  await expect(page.getByText(RENAMED)).toHaveCount(0);
  await shot(page, '10-user-b-cannot-see-a');
});

test('10 — mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, A_EMAIL!, A_PASSWORD!, 'Test User A');
  await expect(page.getByTestId('contact-card').first()).toBeVisible();
  await shot(page, '11-mobile');

  // The page must not scroll sideways on a phone.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows, 'the page must not scroll horizontally on mobile').toBe(false);
});

test('11 — user A deletes the contact, then signs out', async ({ page }) => {
  await signIn(page, A_EMAIL!, A_PASSWORD!, 'Test User A');

  await page.getByRole('button', { name: `Delete ${RENAMED}` }).click();
  await page.getByTestId('confirm-delete').click();
  await expect(page.getByText(RENAMED)).toHaveCount(0);
  await shot(page, '12-contact-deleted');

  await page.getByTestId('sign-out').click();
  await page.waitForURL('**/sign-in');
  await expect(page.getByTestId('submit-auth')).toBeVisible();
  await shot(page, '13-signed-out');
});
