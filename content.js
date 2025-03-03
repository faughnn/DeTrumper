import { stateManager } from './stateManager.js';
import { Observer } from './observer.js';
import { ContentProcessor } from './contentProcessor.js';
import { YOUTUBE_CHECK_TIMEOUT, LOG_LEVEL, LOG_LEVELS, DEFAULT_WORDS, STATE_TYPES } from './config.js';
import { siteRegistry } from './siteRegistry.js';
import { logger } from './logger.js';
import { statsManager } from './statsManager.js';

// Use the config-defined log level but still log initialization
logger.setLevel(LOG_LEVELS.ERROR); // Set to ERROR level for production
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

        // Guard against multiple initializations
        if (window.hasOwnProperty('detrumperInitialized')) {
            logger.warn('Extension already initialized, preventing duplicate initialization');
            return;
        }
        window.detrumperInitialized = true;

        if (initialized) return;
        initialized = true;

        // Create content processor first so it's available for site handlers
        contentProcessor = new ContentProcessor();
        
        // Initialize site registry
        siteRegistry.initialize();
        
        // Then initialize state - this loads stored settings
        const state = await stateManager.initialize();
        logger.info('State initialized:', state);
        
        // Setup the observer
        observer = new Observer(contentProcessor);
        
        // Setup message listeners
        stateManager.setupMessageListeners(contentProcessor);
        
        // Check if we're on Reddit Old and log it
        const isRedditOld = document.querySelector('#siteTable') !== null;
        if (isRedditOld) {
            logger.info('Detected Old Reddit interface');
        }
        
        // Start processing
        if (document.body) {
            const siteType = siteRegistry.getSiteType();
            logger.info(`DeTrumper: Starting up on ${siteType}`);
            observer.setup();
            
            // Force an immediate process after setup
            setTimeout(() => {
                logger.info('Running initial content processing');
                contentProcessor.process();
            }, 100);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                const siteType = siteRegistry.getSiteType();
                logger.info(`DeTrumper: Starting up on ${siteType}`);
                observer.setup();
                
                // Force an immediate process after setup
                setTimeout(() => {
                    logger.info('Running initial content processing');
                    contentProcessor.process();
                }, 100);
            });
        }

        // Special handling for YouTube
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
    if (siteRegistry.getSiteType() === 'youtube') {
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
    try {
        if (observer) {
            observer.cleanup();
        }
        if (stateManager) {
            stateManager.cleanup();
        }
        if (statsManager) {
            statsManager.cleanup();
        }
    } catch (error) {
        logger.error('Error during cleanup:', error);
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
    try {
        // Check if extension context is still valid
        if (!chrome.runtime.id) {
            window.location.reload();
            return;
        }

        if (request.action === "updateWords") {
            logger.info('Received updateWords message:', request);
            stateManager.isEnabled = request.isEnabled !== undefined ? request.isEnabled : true;
            
            if (!stateManager.isEnabled) {
                statsManager.resetSessionStats();
            }
            
            chrome.storage.local.get(['blockedWords'], function(result) {
                stateManager.wordsToRemove = result.blockedWords || DEFAULT_WORDS;
                logger.info('Updated words to remove:', stateManager.wordsToRemove);
                
                stateManager.stateChannel.postMessage({
                    type: STATE_TYPES.WORDS_UPDATED,
                    payload: {
                        words: stateManager.wordsToRemove
                    },
                    tabId: chrome.runtime.id
                });

                if (stateManager.isEnabled && contentProcessor) {
                    logger.info('Triggering reprocessing after words update');
                    contentProcessor.process();
                    
                    // For Old Reddit, force the site handler to process as well
                    const currentHandler = siteRegistry.getCurrentSiteHandler();
                    if (currentHandler && currentHandler.name === 'reddit' && document.querySelector('#siteTable')) {
                        logger.info('Force processing Old Reddit posts after update');
                        currentHandler.processPosts(contentProcessor);
                    }
                }
            });
        }
    } catch (error) {
        logger.error('Error handling message:', error);
    }
});

// MODIFIED: Using a less frequent check that doesn't force reload
// Just check for extension validity, but don't force page reload
let lastExtensionCheck = Date.now();
setInterval(() => {
    try {
        // Only check once every 10 seconds to reduce overhead
        if (Date.now() - lastExtensionCheck < 10000) return;
        lastExtensionCheck = Date.now();
        
        // Just check if extension is still valid
        if (!chrome.runtime || !chrome.runtime.id) {
            logger.warn('Extension context invalidated during check');
            // Don't force reload, just cleanup
            cleanup();
        }
    } catch (error) {
        logger.error('Extension context check error:', error);
    }
}, 10000); // Check only every 10 seconds instead of every second