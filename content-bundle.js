(function () {
    'use strict';

    const DEFAULT_WORDS$1 = ['trump', 'musk', 'elon', 'rogan'];

    const LOG_LEVELS = {
        ERROR: 0,   // Only errors and critical issues
        WARN: 1,    // Warnings and errors
        INFO: 2,    // General information plus warnings and errors
        DEBUG: 3    // Detailed debugging information, all messages
    };

    const LOG_LEVEL = LOG_LEVELS.ERROR; // Default log level

    const STATE_TYPES$1 = {
        WORDS_UPDATED: 'WORDS_UPDATED',
        TOGGLE_STATE: 'TOGGLE_STATE',
        REQUEST_STATE: 'REQUEST_STATE',
        PROVIDE_STATE: 'PROVIDE_STATE'
    };

    const SITE_TYPES = {
        REDDIT: 'reddit',
        YOUTUBE: 'youtube',
        LINKEDIN: 'linkedin',
        OTHER: 'other'
    };

    const MUTATION_CHECK_INTERVAL = 100; // ms
    const YOUTUBE_CHECK_TIMEOUT = 10000; // ms
     // ms

    class Logger {
        constructor() {
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

    const logger = new Logger();

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
                logger.error('State initialization failed:', error);
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

    class Observer {
        constructor(contentProcessor) {
            this.observer = null;
            this.contentProcessor = contentProcessor;
        }

        setup() {
            this.observer = new MutationObserver((mutations) => {
                requestAnimationFrame(() => this.contentProcessor.process());
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            this.contentProcessor.process();
            
            return this.observer;
        }

        cleanup() {
            if (this.observer) {
                this.observer.disconnect();
            }
        }
    }

    class SiteHandlers {
        getSiteType() {
            const hostname = window.location.hostname;
            if (hostname.includes('reddit.com')) return SITE_TYPES.REDDIT;
            if (hostname.includes('youtube.com')) return SITE_TYPES.YOUTUBE;
            if (hostname.includes('linkedin.com')) return 'linkedin';
            // Instead of returning OTHER, let's identify the domain
            const domain = hostname.replace('www.', '');
            return domain || SITE_TYPES.OTHER;
        }

        findBestElementToRemove(element, siteType) {
            if (siteType === SITE_TYPES.REDDIT) {
                return this.findRedditElement(element);
            } 
            else if (siteType === SITE_TYPES.YOUTUBE) {
                return this.findYoutubeElement(element);
            }
            else if (siteType === 'linkedin') {
                return this.findLinkedInElement(element);
            }
            return element;
        }

        findRedditElement(element) {
            let current = element;
            while (current && current !== document.body) {
                // Handle new Reddit horizontal carousel items
                if (current.tagName && current.tagName.toLowerCase() === 'faceplate-tracker') {
                    return current;
                }
                // Handle new Reddit carousel items
                if (current.tagName && current.tagName.toLowerCase() === 'li' && 
                    current.closest('shreddit-gallery-carousel')) {
                    return current;
                }
                // Original Reddit selectors
                if (current.classList.contains('thing') || 
                    current.tagName === 'ARTICLE' ||
                    current.classList.contains('Comment') ||
                    current.classList.contains('Post') ||
                    (current.tagName === 'DIV' && current.getAttribute('data-testid') === 'post-container')) {
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

        findLinkedInElement(element) {
            let current = element;
            while (current && current !== document.body) {
                if (current.classList.contains('feed-shared-update-v2') || 
                    current.classList.contains('feed-shared-post') ||
                    current.classList.contains('comments-comment-item') ||
                    current.classList.contains('feed-shared-article')) {
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
            } 
            else if (siteType === 'linkedin') {
                return document.querySelectorAll('.feed-shared-update-v2, .feed-shared-post, .comments-comment-item, .feed-shared-article');
            } 
            else {
                // Updated Reddit selectors to include carousel items
                return document.querySelectorAll(`
                article, 
                .thing, 
                .Comment, 
                .comment, 
                .Post, 
                .post, 
                div[data-testid="post-container"],
                shreddit-gallery-carousel li,
                faceplate-tracker,
                search-dynamic-id-cache-controller li
            `);
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
            logger.debug('Updating stats for:', matchedWord, 'on site:', siteType);
            
            const state = await sharedState.getState();
            if (!state.isEnabled) {
                logger.info('Stats update skipped - extension disabled');
                return;
            }
            
            try {
                const result = await chrome.storage.local.get(['blockStats']);
                logger.debug('Current stored stats:', result.blockStats);
                
                let stats = result.blockStats || this.getInitialStats();

                stats.totalBlocked += 1;
                stats.siteStats[siteType] = (stats.siteStats[siteType] || 0) + 1;
                stats.wordStats[matchedWord] = (stats.wordStats[matchedWord] || 0) + 1;

                logger.debug('Saving updated stats:', stats);
                await chrome.storage.local.set({ blockStats: stats });
                
                this.updateSessionStats(matchedWord, siteType);
                logger.debug('Session stats updated:', this.sessionStats);
            } catch (error) {
                logger.error('Failed to update stats:', error);
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
            return stateManager.wordsToRemove.find(word => 
                text.toLowerCase().includes(word.toLowerCase())
            );
        }

        logRemoval(element, siteType, text) {
            const matchedWord = this.findMatchingWord(text);
            logger.info('Removed:', {
                site: siteType,
                type: element.tagName,
                classes: element.className,
                matchedWord: matchedWord,
                text: text.slice(0, 100).trim() + (text.length > 100 ? '...' : ''),
                count: ++this.removedCount
            });

            if (matchedWord) {
                logger.debug('Calling updateStats with:', matchedWord, siteType);
                statsManager$1.updateStats(matchedWord, siteType);
            }
        }

        async process() {
            try {
                if (!stateManager.isEnabled) return;

                const now = Date.now();
                if (now - this.lastCheck < MUTATION_CHECK_INTERVAL) return;
                this.lastCheck = now;

                const siteType = siteHandlers.getSiteType();
                logger.debug('Site type:', siteType);
                
                if (siteType === 'other') return;

                siteHandlers.handleLayoutAdjustment(siteType);

                const elements = siteHandlers.getElementsToCheck(siteType);
                logger.debug('Found elements:', elements.length);

                elements.forEach(element => {
                    if (element.hasAttribute('data-checked')) return;
                    
                    const text = element.textContent.toLowerCase();
                    if (stateManager.wordsToRemove.some(word => text.includes(word.toLowerCase()))) {
                        logger.debug('Found matching word in:', text.slice(0, 100));
                        const target = siteHandlers.findBestElementToRemove(element, siteType);
                        if (target && target !== document.body) {
                            this.removeElement(target, siteType, text);
                        }
                    }
                    element.setAttribute('data-checked', 'true');
                });
            } catch (error) {
                logger.error('Error in process:', error);
            }
        }

        removeElement(element, siteType, text) {
            // Immediately remove the element without animation
            this.logRemoval(element, siteType, text);
            element.remove();
        }
    }

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

})();
