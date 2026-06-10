/**
 * Minimal logger — single import source via the `@logger` alias.
 *
 * v0.2.0 qa-master baseline scaffolding. Mirrors the qa-master reference shape
 * (examples/reference/qa-master/helper/utilities/logger.ts). Pure default export so callers
 * write `import logger from "@logger"`.
 */

interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug: (msg: string) => void;
}

const logger: Logger = {
  info: (msg) => {
    console.log(`[INFO] ${msg}`);
  },
  warn: (msg) => {
    console.warn(`[WARN] ${msg}`);
  },
  error: (msg) => {
    console.error(`[ERROR] ${msg}`);
  },
  debug: (msg) => {
    if (process.env.DEBUG) console.log(`[DEBUG] ${msg}`);
  },
};

export default logger;
