// Migrated from selenium-java on 2026-06-10 by Migrator.
// See outputs/plans/PromptJupiterTest.java.md for plan and rationale.

import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import { DIALOG_BOXES_PATH } from '@test-data/prompt-jupiter';

const LABEL = 'PromptJupiter';

export class PageClassPromptJupiter extends BasePage {
  readonly url = DIALOG_BOXES_PATH;

  // Q2 unresolved: prompt button accessible name not DOM-confirmed — accessible name /prompt/i
  // inferred from element id value only. HIGH-confidence fallback: page.locator('#my-prompt').
  // Reviewer: inspect https://bonigarcia.dev/selenium-webdriver-java/dialog-boxes.html accessibility
  // tree; upgrade to getByRole('button', { name: /prompt/i }) if accessible name is confirmed,
  // or ask page owner to add data-testid='prompt-button'.
  readonly buttonPrompt: Locator = this.page
    .locator('#my-prompt')
    .describe(`[${LABEL}] Prompt trigger button`);

  async waitForPageLoad(): Promise<void> {
    await expect(this.buttonPrompt, `[${LABEL}] prompt button visible`).toBeVisible();
  }

  // Handler registered BEFORE click — critical ordering per plan risk callout.
  // Captures dialog.message() in a closure; returns it after click resolves so the
  // caller can assert without the assert-inside-handler abort risk (generate.md rule 15).
  async clickPromptAndAccept(inputText: string): Promise<string> {
    let capturedMessage = '';
    this.page.once('dialog', async (dialog) => {
      capturedMessage = dialog.message();
      await dialog.accept(inputText);
    });
    await this.buttonPrompt.click();
    return capturedMessage;
  }

  // Q3 unresolved: bonigarcia.dev demo typically renders the entered name after prompt.accept().
  // Reviewer must confirm getByText(name) matches the actual post-dialog DOM element text.
  async expectResultVisible(name: string): Promise<void> {
    await expect(
      this.page.getByText(name),
      `[${LABEL}] result text visible after prompt accept`,
    ).toBeVisible();
  }
}
