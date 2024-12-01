(function () {
    'use strict';

    const DEFAULT_WORDS$1 = ['trump', 'musk', 'elon', 'rogan'];

    const STATE_TYPES$1 = {
        WORDS_UPDATED: 'WORDS_UPDATED',
        TOGGLE_STATE: 'TOGGLE_STATE',
        REQUEST_STATE: 'REQUEST_STATE',
        PROVIDE_STATE: 'PROVIDE_STATE'
    };

    const SITE_TYPES = {
        REDDIT: 'reddit',
        YOUTUBE: 'youtube',
        OTHER: 'other'
    };

    const MUTATION_CHECK_INTERVAL = 100; // ms
    const ANIMATION_DURATION = 300; // ms
    const YOUTUBE_CHECK_TIMEOUT = 10000; // ms

    class StateManager {
        constructor() {
            this.stateChannel = new BroadcastChannel('detrumper-state-sync');
            this.isEnabled = true;
            this.wordsToRemove = DEFAULT_WORDS$1;
            this.removedCount = 0;
            this.lastCheck = 0;
            // Make the instance globally available
            window.stateManager = this;
        }

        async initialize() {
            try {
                const state = await chrome.storage.local.get(['isEnabled', 'blockedWords', 'blockStats']);
                
                if (!state.blockedWords) {
                    await chrome.storage.local.set({ blockedWords: DEFAULT_WORDS$1 });
                }

                this.wordsToRemove = state.blockedWords || DEFAULT_WORDS$1;
                this.isEnabled = state.isEnabled !== undefined ? state.isEnabled : true;

                this.broadcastStateRequest();
                await this.waitForStateResponses();

                return {
                    isEnabled: this.isEnabled,
                    wordsToRemove: this.wordsToRemove,
                    removedCount: 0,
                    lastCheck: 0
                };
            } catch (error) {
                console.error('State initialization failed:', error);
                return this.getDefaultState();
            }
        }

        setupMessageListeners(contentProcessor) {
            this.stateChannel.onmessage = async (event) => {
                const { type, payload, tabId } = event.data;
                if (tabId === chrome.runtime.id) return;

                switch (type) {
                    case STATE_TYPES$1.WORDS_UPDATED:
                        this.wordsToRemove = payload.words;
                        if (this.isEnabled) {
                            contentProcessor.process();
                        }
                        break;

                    case STATE_TYPES$1.TOGGLE_STATE:
                        this.isEnabled = payload.isEnabled;
                        if (!this.isEnabled) {
                            statsManager.resetSessionStats();
                        } else {
                            contentProcessor.process();
                        }
                        break;

                    case STATE_TYPES$1.REQUEST_STATE:
                        this.respondWithState();
                        break;
                }
            };
        }

        broadcastStateRequest() {
            this.stateChannel.postMessage({
                type: STATE_TYPES$1.REQUEST_STATE,
                tabId: chrome.runtime.id
            });
        }

        async waitForStateResponses() {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        respondWithState() {
            this.stateChannel.postMessage({
                type: STATE_TYPES$1.PROVIDE_STATE,
                payload: {
                    words: this.wordsToRemove,
                    isEnabled: this.isEnabled
                },
                tabId: chrome.runtime.id
            });
        }

        getDefaultState() {
            return {
                isEnabled: true,
                wordsToRemove: DEFAULT_WORDS$1,
                removedCount: 0,
                lastCheck: 0
            };
        }

        cleanup() {
            this.stateChannel.close();
            delete window.stateManager;
        }
    }

    const stateManager = new StateManager();

    class SiteHandlers {
        getSiteType() {
            if (window.location.hostname.includes('reddit.com')) return SITE_TYPES.REDDIT;
            if (window.location.hostname.includes('youtube.com')) return SITE_TYPES.YOUTUBE;
            return SITE_TYPES.OTHER;
        }

        findBestElementToRemove(element, siteType) {
            if (siteType === SITE_TYPES.REDDIT) {
                return this.findRedditElement(element);
            } 
            else if (siteType === SITE_TYPES.YOUTUBE) {
                return this.findYoutubeElement(element);
            }
            return element;
        }

        findRedditElement(element) {
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

        findYoutubeElement(element) {
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

        handleLayoutAdjustment(siteType) {
            if (siteType === SITE_TYPES.REDDIT) {
                this.adjustRedditLayout();
            }
        }

        adjustRedditLayout() {
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

        getElementsToCheck(siteType) {
            if (siteType === SITE_TYPES.YOUTUBE) {
                return document.querySelectorAll('ytd-video-renderer, ytd-comment-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');
            } else {
                return document.querySelectorAll('article, .thing, .Comment, .comment, .Post, .post, div[data-testid="post-container"]');
            }
        }
    }

    const siteHandlers = new SiteHandlers();

    class SharedState {
        constructor() {
            this.isEnabled = true;
            this.wordsToRemove = DEFAULT_WORDS$1;
        }

        async getState() {
            const result = await chrome.storage.local.get(['isEnabled', 'blockedWords']);
            return {
                isEnabled: result.isEnabled !== undefined ? result.isEnabled : true,
                wordsToRemove: result.blockedWords || DEFAULT_WORDS$1
            };
        }

        async setState(state) {
            await chrome.storage.local.set({
                isEnabled: state.isEnabled,
                blockedWords: state.wordsToRemove
            });
        }
    }

    const sharedState = new SharedState();

    class StatsManager {
        constructor() {
            this.sessionStats = this.getInitialStats();
        }

        async updateStats(matchedWord, siteType) {
            const state = await sharedState.getState();
            if (!state.isEnabled) return;
            
            try {
                const result = await chrome.storage.local.get(['blockStats']);
                let stats = result.blockStats || this.getInitialStats();

                stats.totalBlocked += 1;
                stats.siteStats[siteType] = (stats.siteStats[siteType] || 0) + 1;
                stats.wordStats[matchedWord] = (stats.wordStats[matchedWord] || 0) + 1;

                await chrome.storage.local.set({ blockStats: stats });
                this.updateSessionStats(matchedWord, siteType);
            } catch (error) {
                console.error('Failed to update stats:', error);
            }
        }

        updateSessionStats(matchedWord, siteType) {
            this.sessionStats.totalBlocked += 1;
            this.sessionStats.siteStats[siteType] = (this.sessionStats.siteStats[siteType] || 0) + 1;
            this.sessionStats.wordStats[matchedWord] = (this.sessionStats.wordStats[matchedWord] || 0) + 1;

            chrome.storage.local.set({ sessionStats: this.sessionStats });
        }

        resetSessionStats() {
            this.sessionStats = this.getInitialStats();
            chrome.storage.local.set({ sessionStats: this.sessionStats });
        }

        getInitialStats() {
            return {
                totalBlocked: 0,
                siteStats: {},
                wordStats: {},
                timeStarted: Date.now()
            };
        }
    }

    const statsManager$1 = new StatsManager();

    class ContentProcessor {
        constructor() {
            this.removedCount = 0;
            this.lastCheck = 0;
        }

        findMatchingWord(text) {
            return sharedState.wordsToRemove.find(word => 
                text.toLowerCase().includes(word.toLowerCase())
            );
        }

        logRemoval(element, siteType, text) {
            const matchedWord = this.findMatchingWord(text);
            console.log('🗑️ Removed:', {
                site: siteType,
                type: element.tagName,
                classes: element.className,
                matchedWord: matchedWord,
                text: text.slice(0, 100).trim() + (text.length > 100 ? '...' : ''),
                count: ++this.removedCount
            });

            if (matchedWord) {
                statsManager$1.updateStats(matchedWord, siteType);
            }
        }

        async process() {
            try {
                const state = await sharedState.getState();
                if (!state.isEnabled) return;

                const now = Date.now();
                if (now - this.lastCheck < MUTATION_CHECK_INTERVAL) return;
                this.lastCheck = now;

                const siteType = siteHandlers.getSiteType();
                console.log('Site type:', siteType);
                
                if (siteType === 'other') return;

                siteHandlers.handleLayoutAdjustment(siteType);

                const elements = siteHandlers.getElementsToCheck(siteType);
                console.log('Found elements:', elements.length);

                elements.forEach(element => {
                    if (element.hasAttribute('data-checked')) return;
                    
                    const text = element.textContent.toLowerCase();
                    if (state.wordsToRemove.some(word => text.includes(word.toLowerCase()))) {
                        console.log('Found matching word in:', text.slice(0, 100));
                        const target = siteHandlers.findBestElementToRemove(element, siteType);
                        if (target && target !== document.body) {
                            this.removeElement(target, siteType, text);
                        }
                    }
                    element.setAttribute('data-checked', 'true');
                });
            } catch (error) {
                console.error('Error in process:', error);
            }
        }

        removeElement(element, siteType, text) {
            element.classList.add('removed');
            element.style.transition = 'opacity 0.3s ease-out';
            element.style.opacity = '0';
            
            setTimeout(() => {
                this.logRemoval(element, siteType, text);
                element.remove();
            }, ANIMATION_DURATION);
        }
    }

    const contentProcessor = new ContentProcessor();

    class Observer {
        constructor() {
            this.observer = null;
        }

        setup() {
            this.observer = new MutationObserver((mutations) => {
                requestAnimationFrame(() => contentProcessor.process());
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            contentProcessor.process();
            
            return this.observer;
        }

        cleanup() {
            if (this.observer) {
                this.observer.disconnect();
            }
        }
    }

    const observer = new Observer();

    async function startExtension() {
        await stateManager.initialize();
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

})();
