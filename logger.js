import { LOG_LEVELS, LOG_LEVEL } from './config.js';

class Logger {
    constructor() {
        // Restored to original behavior - use LOG_LEVEL from config
        this.currentLevel = LOG_LEVEL;
    }

    error(...args) {
        if (this.currentLevel >= LOG_LEVELS.ERROR) {
            console.error('🔴 ERROR:', ...args);
        }
    }

    warn(...args) {
        if (this.currentLevel >= LOG_LEVELS.WARN) {
            console.warn('🟡 WARN:', ...args);
        }
    }

    info(...args) {
        if (this.currentLevel >= LOG_LEVELS.INFO) {
            console.log('🔵 INFO:', ...args);
        }
    }

    debug(...args) {
        if (this.currentLevel >= LOG_LEVELS.DEBUG) {
            console.log('🟣 DEBUG:', ...args);
        }
    }

    setLevel(level) {
        this.currentLevel = level;
    }
}

export const logger = new Logger();