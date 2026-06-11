// Migrated by PWmodernizer on 2026-06-10 from selenium-java/PromptJupiterTest.java.
// See outputs/plans/PromptJupiterTest.java.md for plan.

import { test, expect } from '@fixtures/base.fixture';
import { EXPECTED_PROMPT_MESSAGE, PROMPT_INPUT_TEXT } from '@test-data/prompt-jupiter';

test.describe('PromptJupiter — browser prompt dialog', () => {
  // plan:scenario=1.1
  test('enters text into a browser prompt dialog and verifies the message @positive', async ({
    promptJupiterPage,
  }) => {
    await test.step('navigate to the dialog-boxes demo page', async () => {
      await promptJupiterPage.open();
    });

    await test.step('click the prompt button and accept with input text', async () => {
      // Non-web-first assertion unavoidable — dialog.message() returns an event payload, not a Locator
      const message = await promptJupiterPage.clickPromptAndAccept(PROMPT_INPUT_TEXT);
      expect(message).toBe(EXPECTED_PROMPT_MESSAGE);
    });

    await test.step('verify the entered name appears on the page after accepting', async () => {
      // Q3 unresolved — reviewer must confirm post-dialog DOM observable matches PROMPT_INPUT_TEXT
      await promptJupiterPage.expectResultVisible(PROMPT_INPUT_TEXT);
    });
  });

  // plan:scenario=1.2
  test('enters text into a browser prompt dialog (wait-and-assign variant) @positive', async ({
    promptJupiterPage,
  }) => {
    await test.step('navigate to the dialog-boxes demo page', async () => {
      await promptJupiterPage.open();
    });

    await test.step('click the prompt button and accept with input text', async () => {
      // Non-web-first assertion unavoidable — dialog.message() returns an event payload, not a Locator
      const message = await promptJupiterPage.clickPromptAndAccept(PROMPT_INPUT_TEXT);
      expect(message).toBe(EXPECTED_PROMPT_MESSAGE);
    });

    await test.step('verify the entered name appears on the page after accepting', async () => {
      // Q3 unresolved — reviewer must confirm post-dialog DOM observable matches PROMPT_INPUT_TEXT
      await promptJupiterPage.expectResultVisible(PROMPT_INPUT_TEXT);
    });
  });
});
