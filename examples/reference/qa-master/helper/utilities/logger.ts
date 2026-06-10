/**
 * Minimal structured logger. Never use `console.log` directly in tests/page objects —
 * import this instead. Swap the implementation for winston/pino without touching callers.
 */
type Level = 'info' | 'warn' | 'error' | 'staging' | 'prod';

function emit(level: Level, message: string): void {
    const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    stream(`[${level}] ${message}`);
}

const logger = {
    info: (message: string) => emit('info', message),
    warn: (message: string) => emit('warn', message),
    error: (message: string) => emit('error', message),
    staging: (message: string) => emit('staging', message),
    prod: (message: string) => emit('prod', message)
};

export default logger;
