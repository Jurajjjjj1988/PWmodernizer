import { type Locator } from "@playwright/test";

/**
 * Base for page Blocks (composable sub-sections of a Page). The owning Page passes its `root`
 * Locator into the BlockClass constructor; subclasses declare NO own constructor and reference
 * `this.root` for their readonly locator fields.
 *
 * v0.2.0 qa-master scaffolding — extract a Block when a section reaches ~5+ locators / 3+ methods
 * or appears on 3+ pages (migration-rules.md §3).
 */
abstract class BaseBlock {
  constructor(readonly root: Locator) {}
}

export { BaseBlock };
