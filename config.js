export const DEFAULT_WORDS = ['trump', 'musk', 'elon', 'rogan'];

export const LOG_LEVELS = {
    ERROR: 0,   // Only errors and critical issues
    WARN: 1,    // Warnings and errors
    INFO: 2,    // General information plus warnings and errors
    DEBUG: 3    // Detailed debugging information, all messages
};

export const LOG_LEVEL = LOG_LEVELS.ERROR; // Default log level

export const STATE_TYPES = {
    WORDS_UPDATED: 'WORDS_UPDATED',
    TOGGLE_STATE: 'TOGGLE_STATE',
    REQUEST_STATE: 'REQUEST_STATE',
    PROVIDE_STATE: 'PROVIDE_STATE'
};

export const SITE_TYPES = {
    REDDIT: 'reddit',
    YOUTUBE: 'youtube',
    LINKEDIN: 'linkedin',
    OTHER: 'other'
};

export const MUTATION_CHECK_INTERVAL = 100; // ms
export const YOUTUBE_CHECK_TIMEOUT = 10000; // ms
export const STATUS_MESSAGE_DURATION = 2000; // ms