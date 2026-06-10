import { type Page } from '@playwright/test';

/**
 * Base for blocks (reusable UI sections/components). Wires `page` so blocks declare NO
 * constructor — locators are `readonly` fields referencing `this.page`. Blocks are
 * eagerly instantiated as fields in the owning page object.
 */
abstract class BaseBlock {
    constructor(readonly page: Page) {}
}

export { BaseBlock };
