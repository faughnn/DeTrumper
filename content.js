import { stateManager } from './stateManager.js';
import { observer } from './observer.js';
import { contentProcessor } from './contentProcessor.js';
import { YOUTUBE_CHECK_TIMEOUT } from './config.js';
import { siteHandlers } from './siteHandlers.js';

async function startExtension() {
    const state = await stateManager.initialize();
    stateManager.setupMessageListeners(contentProcessor);
    
    if (document.body) {
        console.log('✨ DeTrumper: Starting up on ' + siteHandlers.getSiteType());
        observer.setup();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✨ DeTrumper: Starting up on ' + siteHandlers.getSiteType());
            observer.setup();
        });
    }

    handleYouTubeInit();
}

function handleYouTubeInit() {
    if (siteHandlers.getSiteType() === 'youtube') {
        let loadCheckInterval = setInterval(() => {
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

// Initialize
startExtension().catch(error => {
    console.error('Failed to start extension:', error);
});

// Cleanup
window.addEventListener('unload', () => {
    observer.cleanup();
    stateManager.cleanup();
});

// Message handling
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
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

            if (stateManager.isEnabled) {
                contentProcessor.process();
            }
        });
    }
});
