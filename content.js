import { stateManager } from './stateManager.js';
import { Observer } from './observer.js';
import { ContentProcessor } from './contentProcessor.js';
import { YOUTUBE_CHECK_TIMEOUT, LOG_LEVEL, LOG_LEVELS } from './config.js';
import { siteHandlers } from './siteHandlers.js';
import { logger } from './logger.js';

// Immediately verify logging level
logger.debug('Current log level:', LOG_LEVEL);
logger.info('Starting DeTrumper extension');

let initialized = false;
let observer = null;
let contentProcessor = null;

async function startExtension() {
    try {
        // Check if chrome.runtime is still available
        if (!chrome.runtime || !chrome.runtime.id) {
            logger.warn('Extension context invalidated, reloading page...');
            window.location.reload();
            return;
        }

        if (initialized) return;
        initialized = true;

        const state = await stateManager.initialize();
        contentProcessor = new ContentProcessor();
        observer = new Observer(contentProcessor);
        
        stateManager.setupMessageListeners(contentProcessor);
        
        if (document.body) {
            logger.info('DeTrumper: Starting up on ' + siteHandlers.getSiteType());
            observer.setup();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                logger.info('DeTrumper: Starting up on ' + siteHandlers.getSiteType());
                observer.setup();
            });
        }

        handleYouTubeInit(contentProcessor);

        // Add runtime disconnect listener
        chrome.runtime.onConnect.addListener(function(port) {
            port.onDisconnect.addListener(function() {
                if (chrome.runtime.lastError || !chrome.runtime.id) {
                    initialized = false;
                    cleanup();
                    window.location.reload();
                }
            });
        });

    } catch (error) {
        logger.error('Failed to start extension:', error);
        if (error.message.includes('Extension context invalidated')) {
            window.location.reload();
        }
    }
}

function handleYouTubeInit(contentProcessor) {
    if (siteHandlers.getSiteType() === 'youtube') {
        let loadCheckInterval = setInterval(() => {
            if (!chrome.runtime.id) {
                clearInterval(loadCheckInterval);
                return;
            }
            if (document.querySelector('ytd-app')) {
                contentProcessor.process();
                clearInterval(loadCheckInterval);
            }
        }, 100);
        
        setTimeout(() => {
            if (loadCheckInterval) {
                clearInterval(loadCheckInterval);
            }
        }, YOUTUBE_CHECK_TIMEOUT);
    }
}

function cleanup() {
    if (observer) {
        observer.cleanup();
    }
    if (stateManager) {
        stateManager.cleanup();
    }
}

// Initialize
startExtension().catch(error => {
    logger.error('Failed to start extension:', error);
    if (error.message.includes('Extension context invalidated')) {
        window.location.reload();
    }
});

// Cleanup
window.addEventListener('unload', cleanup);

// Message handling
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // Check if extension context is still valid
    if (!chrome.runtime.id) {
        window.location.reload();
        return;
    }

    if (request.action === "updateWords") {
        stateManager.isEnabled = request.isEnabled !== undefined ? request.isEnabled : true;
        
        if (!stateManager.isEnabled) {
            statsManager.resetSessionStats();
        }
        
        chrome.storage.local.get(['blockedWords'], function(result) {
            stateManager.wordsToRemove = result.blockedWords || DEFAULT_WORDS;
            
            stateManager.stateChannel.postMessage({
                type: STATE_TYPES.WORDS_UPDATED,
                payload: {
                    words: stateManager.wordsToRemove
                },
                tabId: chrome.runtime.id
            });

            if (stateManager.isEnabled && contentProcessor) {
                contentProcessor.process();
            }
        });
    }
});

// Add a context check interval
setInterval(() => {
    if (!chrome.runtime.id) {
        cleanup();
        window.location.reload();
    }
}, 1000);