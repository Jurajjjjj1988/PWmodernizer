import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import { URLS } from '@test-data/urls';
import logger from '@logger';

const LABEL = 'Uploads';

/**
 * Account → My Uploads page (/account/arts). Selectors confirmed live via Playwright MCP:
 * file input + "Browse your device", uploaded card name `.MuiCardHeader-root > div`,
 * `Delete the upload` / `Rename the upload` icon buttons, delete-confirm `[role=alert] + p`.
 */
export class UploadsPage extends BasePage {
    readonly url = URLS.paths.accountUploads;

    readonly browseYourDevice: Locator =
        this.page.getByText('Browse your device').describe(`[${LABEL}] Browse your device`);
    readonly fileInput: Locator = this.page.locator('input[type="file"]').describe(`[${LABEL}] File input`);
    readonly uploadedFileName: Locator =
        this.page.locator('.MuiCardHeader-root > div').first().describe(`[${LABEL}] Uploaded file name`);

    readonly buttonDelete: Locator =
        this.page.getByRole('button', { name: 'Delete the upload' }).first().describe(`[${LABEL}] Delete upload button`);
    readonly textDeleteConfirm: Locator =
        this.page.locator('[role="alert"] + p').describe(`[${LABEL}] Delete confirmation text`);
    readonly buttonConfirmDelete: Locator =
        this.page.getByRole('button', { name: 'Delete', exact: true }).describe(`[${LABEL}] Confirm delete button`);

    readonly buttonRename: Locator =
        this.page.getByRole('button', { name: 'Rename the upload' }).first().describe(`[${LABEL}] Rename upload button`);
    readonly buttonAddToProduct: Locator =
        this.page.getByText('Add to Product').first().describe(`[${LABEL}] Add to Product button`);
    readonly inputNewName: Locator = this.page.locator('#name').describe(`[${LABEL}] New file name input`);
    readonly buttonSaveChanges: Locator =
        this.page.getByRole('button', { name: 'Save Changes' }).describe(`[${LABEL}] Save Changes button`);

    async open(): Promise<void> {
        logger.info(`[${LABEL}] Opening My Uploads`);
        await this.page.goto(this.url, { timeout: 45_000 });
        await this.waitForPageLoad();
    }

    async waitForPageLoad(): Promise<void> {
        await expect(this.page, `[${LABEL}] URL should be the uploads page`).toHaveURL(/\/account\/arts/);
        await expect(this.browseYourDevice, `[${LABEL}] "Browse your device" should be visible`)
            .toBeVisible({ timeout: 30_000 });
    }

    /** Upload a file; asserts the uploaded card shows its name. */
    async uploadFile(filePath: string): Promise<void> {
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
        logger.info(`[${LABEL}] Uploading ${fileName}`);
        await this.fileInput.setInputFiles(filePath);
        await expect(this.uploadedFileName, `[${LABEL}] Uploaded file ${fileName} should appear`)
            .toHaveText(fileName, { timeout: 45_000 });
    }

    /** Delete the first uploaded file; asserts the empty state returns. */
    async deleteFirstUpload(): Promise<void> {
        logger.info(`[${LABEL}] Deleting uploaded file`);
        await this.buttonDelete.click();
        await expect(this.textDeleteConfirm, `[${LABEL}] Delete confirmation should explain the action`)
            .toContainText('This action is permanent and cannot be undone');
        await this.buttonConfirmDelete.click();
        await expect(this.browseYourDevice, `[${LABEL}] Empty state should return after delete`)
            .toBeVisible({ timeout: 30_000 });
    }

    /** Rename the first uploaded file; asserts the card shows the new name. */
    async renameFirstUpload(newName: string): Promise<void> {
        logger.info(`[${LABEL}] Renaming uploaded file to ${newName}`);
        await this.buttonRename.click();
        await this.inputNewName.clear();
        await this.inputNewName.fill(newName);
        await this.buttonSaveChanges.click();
        await expect(this.uploadedFileName, `[${LABEL}] Card should show the new name`)
            .toHaveText(newName, { timeout: 30_000 });
    }
}
