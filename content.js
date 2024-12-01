const DEFAULT_WORDS = ['trump', 'musk', 'elon', 'rogan'];
let wordsToRemove = DEFAULT_WORDS;
let removedCount = 0;
let lastCheck = 0;
let isEnabled = true;

let sessionStats = {
    totalBlocked: 0,
    siteStats: {},
    wordStats: {},
    timeStarted: Date.now()
};

// Broadcast channel for tab communication
const stateChannel = new BroadcastChannel('detrumper-state-sync');

// State types that can be synced
const STATE_TYPES = {
    WORDS_UPDATED: 'WORDS_UPDATED',
    TOGGLE_STATE: 'TOGGLE_STATE',
    REQUEST_STATE: 'REQUEST_STATE',
    PROVIDE_STATE: 'PROVIDE_STATE'
};

// Listen for state changes from other tabs
stateChannel.onmessage = async (event) => {
    const { type, payload, tabId } = event.data;
    
    // Don't process our own messages
    if (tabId === chrome.runtime.id) return;

    switch (type) {
        case STATE_TYPES.WORDS_UPDATED:
            wordsToRemove = payload.words;
            if (isEnabled) {
                processMutations([]);
            }
            break;

        case STATE_TYPES.TOGGLE_STATE:
            isEnabled = payload.isEnabled;
            if (!isEnabled) {
                resetSessionStats();
            } else {
                processMutations([]);
            }
            break;

        case STATE_TYPES.REQUEST_STATE:
            // Respond with current state
            stateChannel.postMessage({
                type: STATE_TYPES.PROVIDE_STATE,
                payload: {
                    words: wordsToRemove,
                    isEnabled: isEnabled
                },
                tabId: chrome.runtime.id
            });
            break;
    }
};

async function initializeExtension() {
    try {
        const state = await chrome.storage.local.get(['isEnabled', 'blockedWords', 'blockStats']);
        
        // Request current state from other tabs
        stateChannel.postMessage({
            type: STATE_TYPES.REQUEST_STATE,
            tabId: chrome.runtime.id
        });

        // Wait briefly for any responses
        await new Promise(resolve => setTimeout(resolve, 100));

        const globalState = {
            isEnabled: state.isEnabled !== undefined ? state.isEnabled : true,
            wordsToRemove: state.blockedWords || DEFAULT_WORDS,
            removedCount: 0,
            lastCheck: 0
        };

        // Initialize stats if needed
        if (!state.blockStats) {
            await chrome.storage.local.set({
                blockStats: {
                    totalBlocked: 0,
                    siteStats: {},
                    wordStats: {},
                    timeStarted: Date.now()
                }
            });
        }

        // Initialize session stats
        const sessionStats = {
            totalBlocked: 0,
            siteStats: {},
            wordStats: {},
            timeStarted: Date.now()
        };
        await chrome.storage.session.set({ sessionStats });

        if (!globalState.isEnabled) {
            await resetSessionStats();
        }

        return globalState;
    } catch (error) {
        console.error('Initialization failed:', error);
        return {
            isEnabled: true,
            wordsToRemove: DEFAULT_WORDS,
            removedCount: 0,
            lastCheck: 0
        };
    }
}

function getSiteType() {
    if (window.location.hostname.includes('reddit.com')) return 'reddit';
    if (window.location.hostname.includes('youtube.com')) return 'youtube';
    return 'other';
}

function findBestElementToRemove(element, siteType) {
    if (siteType === 'reddit') {
        let current = element;
        while (current && current !== document.body) {
            if (current.classList.contains('thing') || 
                current.tagName === 'ARTICLE' ||
                current.classList.contains('Comment') ||
                current.classList.contains('Post')) {
                return current;
            }
            current = current.parentElement;
        }
        return element;
    } 
    else if (siteType === 'youtube') {
        let current = element;
        while (current && current !== document.body) {
            if (current.tagName && (
                current.tagName.startsWith('YTD-') || 
                (current.id === 'content' && current.closest('#primary'))
            )) {
                return current;
            }
            current = current.parentElement;
        }
        return element;
    }
}

function updateStats(matchedWord, siteType) {
    if (!isEnabled) return;
    
    chrome.storage.local.get(['blockStats'], function(result) {
        let stats = result.blockStats || {
            totalBlocked: 0,
            siteStats: {},
            wordStats: {},
            timeStarted: Date.now()
        };

        stats.totalBlocked += 1;
        stats.siteStats[siteType] = (stats.siteStats[siteType] || 0) + 1;
        stats.wordStats[matchedWord] = (stats.wordStats[matchedWord] || 0) + 1;

        chrome.storage.local.set({ blockStats: stats });

        sessionStats.totalBlocked += 1;
        sessionStats.siteStats[siteType] = (sessionStats.siteStats[siteType] || 0) + 1;
        sessionStats.wordStats[matchedWord] = (sessionStats.wordStats[matchedWord] || 0) + 1;

        chrome.storage.local.set({ sessionStats: sessionStats });
    });
}

function findMatchingWord(text) {
    return wordsToRemove.find(word => text.toLowerCase().includes(word.toLowerCase()));
}

function logRemoval(element, siteType, text) {
    const matchedWord = findMatchingWord(text);
    console.log('🗑️ Removed:', {
        site: siteType,
        type: element.tagName,
        classes: element.className,
        matchedWord: matchedWord,
        text: text.slice(0, 100).trim() + (text.length > 100 ? '...' : ''),
        count: ++removedCount
    });

    if (matchedWord) {
        updateStats(matchedWord, siteType);
    }
}

function handleLayoutAdjustment(siteType) {
    if (siteType === 'reddit') {
        const mainContainer = document.querySelector('.ListingLayout-backgroundContainer');
        if (mainContainer) {
            mainContainer.style.maxWidth = 'none';
            mainContainer.style.padding = '0 24px';
        }

        const contentContainer = document.querySelector('.ListingLayout-contentContainer');
        if (contentContainer) {
            contentContainer.style.margin = '0 auto';
            contentContainer.style.maxWidth = '1200px';
        }
    }
}

function resetSessionStats() {
    sessionStats = {
        totalBlocked: 0,
        siteStats: {},
        wordStats: {},
        timeStarted: Date.now()
    };
    chrome.storage.local.set({ sessionStats: sessionStats });
}

function processMutations(mutations) {
    if (!isEnabled) return;

    const now = Date.now();
    if (now - lastCheck < 100) return;
    lastCheck = now;

    const siteType = getSiteType();
    if (siteType === 'other') return;

    handleLayoutAdjustment(siteType);

    let elements;
    if (siteType === 'youtube') {
        elements = document.querySelectorAll('ytd-video-renderer, ytd-comment-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');
    } else {
        elements = document.querySelectorAll('article, .thing, .Comment, .comment, .Post, .post, div[data-testid="post-container"]');
    }

    elements.forEach(element => {
        if (element.hasAttribute('data-checked')) return;
        
        const text = element.textContent.toLowerCase();
        if (wordsToRemove.some(word => text.includes(word.toLowerCase()))) {
            const target = findBestElementToRemove(element, siteType);
            if (target && target !== document.body) {
                target.classList.add('removed');
                target.style.transition = 'opacity 0.3s ease-out';
                target.style.opacity = '0';
                
                setTimeout(() => {
                    logRemoval(target, siteType, text);
                    target.remove();
                }, 300);
            }
        }
        element.setAttribute('data-checked', 'true');
    });
}

function setupContentObserver() {
    const observer = new MutationObserver((mutations) => {
        requestAnimationFrame(() => processMutations(mutations));
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    processMutations([]);
    
    return observer;
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "updateWords") {
        isEnabled = request.isEnabled !== undefined ? request.isEnabled : true;
        
        if (!isEnabled) {
            resetSessionStats();
        }
        
        chrome.storage.local.get(['blockedWords'], function(result) {
            wordsToRemove = result.blockedWords || DEFAULT_WORDS;
            
            // Broadcast state change to other tabs
            stateChannel.postMessage({
                type: STATE_TYPES.WORDS_UPDATED,
                payload: {
                    words: wordsToRemove
                },
                tabId: chrome.runtime.id
            });

            if (isEnabled) {
                processMutations([]);
            }
        });
    }
});

async function startExtension() {
    const state = await initializeExtension();
    
    isEnabled = state.isEnabled;
    wordsToRemove = state.wordsToRemove;
    removedCount = state.removedCount;
    lastCheck = state.lastCheck;

    if (document.body) {
        console.log('✨ DeTrumper: Starting up on ' + getSiteType());
        observer = setupContentObserver();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✨ DeTrumper: Starting up on ' + getSiteType());
            observer = setupContentObserver();
        });
    }

    if (getSiteType() === 'youtube') {
        let loadCheckInterval = setInterval(() => {
            if (document.querySelector('ytd-app')) {
                processMutations([]);
                clearInterval(loadCheckInterval);
            }
        }, 100);
        
        setTimeout(() => {
            if (loadCheckInterval) {
                clearInterval(loadCheckInterval);
            }
        }, 10000);
    }
}

let observer;
startExtension().catch(error => {
    console.error('Failed to start extension:', error);
});

window.addEventListener('unload', () => {
    if (observer) {
        observer.disconnect();
    }
    stateChannel.close();
});