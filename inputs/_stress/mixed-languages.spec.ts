import { test, expect } from '@playwright/test';

// Multilingual content: English + Slovak (čšž) + German (äöüß) + Japanese (日本語)
// + Russian Cyrillic (Привет). All written as valid UTF-8 — `file` should
// report utf-8 and Stage 0 should PASS. Catches the "we never test non-Latin
// script in test names" gap. Language alone is not a rejection criterion.

test.describe('mixed-languages localisation suite', () => {
  test('Slovak: prihlásenie cez čítačku kódov', async ({ page }) => {
    await page.goto('https://shop.example.test/sk/prihlasenie');
    await expect(page.getByRole('heading', { name: 'Prihlásenie' })).toBeVisible();
    await page.getByLabel('Heslo').fill('žltý-kôň-šťastný-čas');
    await page.getByRole('button', { name: 'Prihlásiť' }).click();
  });

  test('German: Größe und Schließfach prüfen', async ({ page }) => {
    await page.goto('https://shop.example.test/de/größen');
    await expect(page.getByRole('heading', { name: 'Größentabelle' })).toBeVisible();
    await expect(page.getByText('Straße, Köln, Zürich')).toBeVisible();
  });

  test('Japanese: 日本語テストケース ()', async ({ page }) => {
    await page.goto('https://shop.example.test/ja/');
    await expect(page.getByRole('heading', { name: 'こんにちは' })).toBeVisible();
    await expect(page.getByText('商品一覧')).toBeVisible();
  });

  test('Russian: Привет мир из теста', async ({ page }) => {
    await page.goto('https://shop.example.test/ru/');
    await expect(page.getByRole('heading', { name: 'Добро пожаловать' })).toBeVisible();
  });
});
