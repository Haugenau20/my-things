import { expect, test } from '@playwright/test';
import { changeSyntheticNotes, seedExamples } from './fixtures';

test('decision and review saves refresh quietly without inserting the metadata-loading paragraph', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Item inspector', exact: true });
  const browse = page.locator('.browse-column');
  // Observe insertions so even a banner removed before an assertion is caught.
  await browse.evaluate((element) => {
    element.setAttribute('data-loading-banner-seen', 'false');
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes].some((node) =>
            node.textContent?.includes('Loading the complete metadata index.'),
          ),
        )
      )
        element.setAttribute('data-loading-banner-seen', 'true');
    });
    observer.observe(element, { childList: true, subtree: true });
  });
  async function expectQuietRefresh() {
    await expect(page.getByText(/refreshing metadata/)).toHaveCount(0);
    await expect(inspector.getByRole('button', { name: 'Store', exact: true })).toBeEnabled();
    await expect(browse).toHaveAttribute('data-loading-banner-seen', 'false');
  }
  await inspector.getByRole('button', { name: 'Store', exact: true }).click();
  await expect(inspector.getByRole('status').filter({ hasText: 'Decision saved' })).toBeVisible();
  await expectQuietRefresh();
  await inspector.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await expect(inspector.getByRole('status').filter({ hasText: 'Reviewed' })).toBeVisible();
  await expectQuietRefresh();
  await page.getByRole('button', { name: 'Refresh inventory', exact: true }).click();
  await expectQuietRefresh();

  await changeSyntheticNotes('Synthetic Wool blanket', 'Synthetic concurrent quiet refresh');
  await inspector.getByRole('button', { name: 'In progress', exact: true }).click();
  await expect(inspector.getByRole('alert')).toContainText('changed elsewhere');
  await expectQuietRefresh();
});
