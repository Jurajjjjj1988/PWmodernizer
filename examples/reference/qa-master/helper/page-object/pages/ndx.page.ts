import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import logger from '@logger';

const LABEL = 'NDX';

/**
 * NDX (the Design Lab). Used here to **seed a saved design** — the only path that populates the
 * GraphQL-backed My Designs list (a cold `POST /api/designs` does not). Flow confirmed via MCP:
 * open `/ndx/` (loads a default product) → Save | Share → name → Save → design gets a `cid`.
 */
export class NdxPage extends BasePage {
    readonly url = '/ndx/';

    readonly buttonSaveShare: Locator =
        this.page.getByTestId('ndx-cta-save-share').describe(`[${LABEL}] Save | Share button`);
    readonly inputDesignName: Locator = this.page.locator('#designName').describe(`[${LABEL}] Design name input`);
    readonly buttonSaveForm: Locator =
        this.page.getByTestId('form-submit').describe(`[${LABEL}] Save (form submit) button`);

    async openBlankDesign(): Promise<void> {
        logger.info(`[${LABEL}] Opening a blank design`);
        await this.page.goto(this.url, { timeout: 60_000 });
        await this.waitForPageLoad();
    }

    async waitForPageLoad(): Promise<void> {
        await expect(this.buttonSaveShare, `[${LABEL}] Save | Share should be available`)
            .toBeVisible({ timeout: 60_000 });
    }

    /** Save the current design with a name; returns its composite id (cid) once persisted. */
    async saveDesign(name: string): Promise<string> {
        logger.info(`[${LABEL}] Saving design "${name}"`);
        await this.buttonSaveShare.click();
        await this.inputDesignName.fill(name);
        await this.buttonSaveForm.click();
        await expect(this.page, `[${LABEL}] Saved design should have a composite id in the URL`)
            .toHaveURL(/cid=/, { timeout: 45_000 });
        const cid = new URL(this.page.url()).searchParams.get('cid');
        expect(cid, `[${LABEL}] A composite id should be present after saving`).toBeTruthy();
        return cid!;
    }

    /** Seed a fresh saved design end-to-end; returns its composite id (cid). */
    async seedDesign(name: string): Promise<string> {
        await this.openBlankDesign();
        return this.saveDesign(name);
    }
}
