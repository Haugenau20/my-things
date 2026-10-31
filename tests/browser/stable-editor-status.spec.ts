import { expect, test } from '@playwright/test';
import { seedExamples } from './fixtures';

for (const phone of [false, true]) {
  test(`${phone ? 'phone full view' : 'desktop inspector'} keeps decision and review buttons still through save-status changes`, async ({
    page,
  }) => {
    await seedExamples();
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in as test owner' }).click();
    await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
    const editor = page.getByRole('region', { name: 'Edit item', exact: true });
    const decisionButton = phone ? 'Save decision' : 'Store';
    const status = editor.getByRole('status');
    expect(await status.evaluate((element) => element.getBoundingClientRect().height)).toBe(0);
    // Measure every DOM update, including brief Saving/result overlap and scroll changes.
    await editor.evaluate((element, decisionButton) => {
      const names = [decisionButton, 'Mark reviewed'];
      const buttons = names.map((name) =>
        [...element.querySelectorAll('button')].find(
          (button) => button.textContent?.trim() === name,
        )!,
      );
      const offsets = () =>
        buttons.map(
          (button) => button.getBoundingClientRect().top - element.getBoundingClientRect().top,
        );
      const initial = offsets();
      let movement = 0;
      element.setAttribute('data-status-button-movement', '0');
      element.setAttribute('data-saving-seen', 'false');
      const observer = new MutationObserver(() => {
        if (
          [...element.querySelectorAll('[role="status"]')].some(
            (status) => status.textContent === 'Saving…',
          )
        )
          element.setAttribute('data-saving-seen', 'true');
        movement = Math.max(
          movement,
          ...offsets().map((offset, index) => Math.abs(offset - initial[index]!)),
        );
        element.setAttribute('data-status-button-movement', String(movement));
      });
      observer.observe(element, { childList: true, subtree: true, characterData: true });
    }, decisionButton);
    async function expectStableStatus(text: string) {
      await expect(editor.getByRole('status')).toHaveText([text]);
      await expect(editor).toHaveAttribute('data-saving-seen', 'true');
      expect(Number(await editor.getAttribute('data-status-button-movement'))).toBeLessThan(0.5);
    }
    if (phone)
      await editor
        .getByRole('combobox', { name: 'Moving decision', exact: true })
        .selectOption('store');
    await editor.getByRole('button', { name: decisionButton, exact: true }).click();
    await expectStableStatus('Decision saved');
    if (phone) {
      await editor
        .getByRole('combobox', { name: 'Moving progress', exact: true })
        .selectOption('in_progress');
      await editor.getByRole('button', { name: 'Save progress', exact: true }).click();
    } else await editor.getByRole('button', { name: 'In progress', exact: true }).click();
    await expectStableStatus('Progress saved');
    await editor.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
    await expectStableStatus('Reviewed');
    await expect(status).toHaveText([''], { timeout: 6500 });
    expect(await status.evaluate((element) => element.getBoundingClientRect().height)).toBe(0);
    expect(Number(await editor.getAttribute('data-status-button-movement'))).toBeLessThan(0.5);
    await page.screenshot({
      path: test.info().outputPath('stable-editor-status.png'),
      fullPage: true,
    });
  });
}
