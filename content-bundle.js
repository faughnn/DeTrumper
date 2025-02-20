(function () {
    'use strict';

    const DEFAULT_WORDS = ['trump', 'musk', 'elon', 'rogan'];

    const LOG_LEVELS = {
        ERROR: 0,   // Only errors and critical issues
        WARN: 1,    // Warnings and errors
        INFO: 2,    // General information plus warnings and errors
        DEBUG: 3    // Detailed debugging information, all messages
    };

    const LOG_LEVEL = LOG_LEVELS.ERROR; // Default log level

    const STATE_TYPES = {
        WORDS_UPDATED: 'WORDS_UPDATED',
        TOGGLE_STATE: 'TOGGLE_STATE',
        REQUEST_STATE: 'REQUEST_STATE',
        PROVIDE_STATE: 'PROVIDE_STATE'
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
            this.wordsToRemove = DEFAULT_WORDS;
            this.removedCount = 0;
            this.lastCheck = 0;
            // Make the instance globally available
            window.stateManager = this;
        }

        async initialize() {
            try {
                const state = await chrome.storage.local.get(['isEnabled', 'blockedWords', 'blockStats']);
                
                if (!state.blockedWords) {
                    await chrome.storage.local.set({ blockedWords: DEFAULT_WORDS });
                }

                this.wordsToRemove = state.blockedWords || DEFAULT_WORDS;
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
                    case STATE_TYPES.WORDS_UPDATED:
                        this.wordsToRemove = payload.words;
                        if (this.isEnabled) {
                            contentProcessor.process();
                        }
                        break;

                    case STATE_TYPES.TOGGLE_STATE:
                        this.isEnabled = payload.isEnabled;
                        if (!this.isEnabled) {
                            statsManager.resetSessionStats();
                        } else {
                            contentProcessor.process();
                        }
                        break;

                    case STATE_TYPES.REQUEST_STATE:
                        this.respondWithState();
                        break;
                }
            };
        }

        broadcastStateRequest() {
            this.stateChannel.postMessage({
                type: STATE_TYPES.REQUEST_STATE,
                tabId: chrome.runtime.id
            });
        }

        async waitForStateResponses() {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        respondWithState() {
            this.stateChannel.postMessage({
                type: STATE_TYPES.PROVIDE_STATE,
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
                wordsToRemove: DEFAULT_WORDS,
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

    // sites/base.js

    class BaseSiteHandler {
      constructor() {
        this.name = 'base';
      }

      // Returns true if this handler can handle the current site
      canHandle(hostname) { 
        return false; // Base handler doesn't handle any site
      }
      
      // Gets all elements to check for keywords
      getElementsToCheck() { 
        return document.querySelectorAll('*');
      }
      
      // Finds the parent element to remove
      findBestElementToRemove(element) { 
        return element;
      }
      
      // Site-specific removal logic
      removeElement(element, matchedWord, logCallback) { 
        logCallback(element, this.name, element.textContent, matchedWord);
        element.remove();
      }
      
      // Optional: Site-specific layout adjustments after removal
      handleLayoutAdjustment() { 
        // Default empty implementation
      }
    }

    // sites/reddit.js

    class RedditHandler extends BaseSiteHandler {
      constructor() {
        super();
        this.name = 'reddit';
        this.processedElements = new Set();
        this.lastProcessedCount = 0;
        this.lastHeight = 0;
        this.scrollMonitorInterval = null;
      }

      canHandle(hostname) {
        return hostname.includes('reddit.com');
      }

      getElementsToCheck() {
        // For old Reddit UI, directly target the post titles
        if (document.querySelector('#siteTable')) {
          return document.querySelectorAll('#siteTable > .thing a.title, #siteTable > .thing .md');
        }
        
        // For new Reddit UI
        return document.querySelectorAll(`
      div.thing,
      [data-fullname],
      article.Post,
      article[data-testid="post-container"],
      div[data-testid="post"],
      shreddit-post,
      .Post,
      [data-test-id="post-content"],
      .link
    `);
      }

      findBestElementToRemove(element) {
        // For old Reddit
        if (document.querySelector('#siteTable')) {
          // If it's a title or content element, find the parent post
          if (element.tagName === 'A' && element.classList.contains('title')) {
            const postContainer = element.closest('#siteTable > .thing');
            return postContainer || element;
          }
          if (element.classList.contains('md')) {
            const postContainer = element.closest('#siteTable > .thing');
            return postContainer || element;
          }
        }
        
        // For new Reddit UI
        let current = element;
        while (current && current !== document.body) {
          if (current.classList.contains('thing') || 
              current.hasAttribute('data-fullname') ||
              current.classList.contains('Post') ||
              current.tagName === 'ARTICLE' ||
              (current.tagName === 'DIV' && current.getAttribute('data-testid') === 'post-container')) {
            return current;
          }
          current = current.parentElement;
        }
        
        return element;
      }

      // Handle content processing for both initial load and infinite scroll
      handleContentProcessing(contentProcessor) {
        // Setup special monitoring for old Reddit infinite scroll if not already set up
        if (document.querySelector('#siteTable') && !this.scrollMonitorInterval) {
          // Set up an interval to check for new posts from infinite scroll
          this.scrollMonitorInterval = setInterval(() => {
            this.checkForNewContent(contentProcessor);
          }, 500); // Check every 500ms
        }
        
        // Process old Reddit content
        if (document.querySelector('#siteTable')) {
          this.processOldReddit(contentProcessor);
          return true; // We handled it
        }
        
        return false; // Let the standard processor handle it
      }

      // Check for new content added by infinite scroll
      checkForNewContent(contentProcessor) {
        // If we're on old Reddit
        if (document.querySelector('#siteTable')) {
          // Check document height - common way to detect infinite scroll
          const currentHeight = document.body.scrollHeight;
          
          // Check post count
          const posts = document.querySelectorAll('#siteTable > .thing');
          const currentPostCount = posts.length;
          
          // If height changed or we have more posts, process again
          if (currentHeight > this.lastHeight || currentPostCount > this.lastProcessedCount) {
            logger.debug('Detected new content - processing');
            this.lastHeight = currentHeight;
            this.processOldReddit(contentProcessor);
          }
        }
      }

      // Process old Reddit specifically
      processOldReddit(contentProcessor) {
        // Get all posts from old Reddit
        const posts = document.querySelectorAll('#siteTable > .thing');
        
        // Track how many posts we've processed this time
        let processedThisRun = 0;
        
        posts.forEach(post => {
          // Generate a unique ID for this post to avoid double-processing
          const postId = post.getAttribute('data-fullname') || post.id || Math.random().toString(36);
          
          // Skip if already processed
          if (this.processedElements.has(postId)) {
            return;
          }
          
          // Mark as processed
          this.processedElements.add(postId);
          processedThisRun++;
          
          // Check title first
          const titleEl = post.querySelector('a.title');
          if (titleEl) {
            const titleText = titleEl.textContent;
            const matchedWord = contentProcessor.findMatchingWord(titleText);
            
            if (matchedWord) {
              post.style.display = 'none';
              post.classList.add('removed-by-detrumper');
              contentProcessor.logRemoval(post, this.name, titleText, matchedWord);
              return;
            }
          }
          
          // Check content if title didn't match
          const contentEl = post.querySelector('.md');
          if (contentEl) {
            const text = contentEl.textContent;
            const matchedWord = contentProcessor.findMatchingWord(text);
            
            if (matchedWord) {
              post.style.display = 'none';
              post.classList.add('removed-by-detrumper');
              contentProcessor.logRemoval(post, this.name, text, matchedWord);
            }
          }
        });
        
        // Also check comments if we're in a comment thread
        const comments = document.querySelectorAll('.commentarea .comment');
        comments.forEach(comment => {
          const commentId = comment.getAttribute('data-fullname') || comment.id || Math.random().toString(36);
          
          if (this.processedElements.has(commentId)) {
            return;
          }
          
          this.processedElements.add(commentId);
          
          const text = comment.textContent;
          const matchedWord = contentProcessor.findMatchingWord(text);
          
          if (matchedWord) {
            comment.style.opacity = '0.2';
            comment.style.pointerEvents = 'none';
            contentProcessor.logRemoval(comment, this.name, text, matchedWord);
          }
        });
        
        // Update the post count
        this.lastProcessedCount = posts.length;
        
        logger.debug(`Processed ${processedThisRun} new posts, total now: ${this.lastProcessedCount}`);
        
        return true;
      }

      removeElement(element, matchedWord, logCallback) {
        // Skip if already processed
        const elementId = element.getAttribute('data-fullname') || element.id || Math.random().toString(36);
        if (this.processedElements.has(elementId)) {
          return;
        }
        
        // Add to processed set to avoid re-processing
        this.processedElements.add(elementId);
        
        if (document.querySelector('#siteTable') && element.closest('#siteTable > .thing')) {
          // Old Reddit post
          logger.debug('Removing old Reddit post:', element.className);
          element.style.display = 'none';
          element.classList.add('removed-by-detrumper');
        } else if (element.classList.contains('comment')) {
          // Comment in either UI
          element.style.opacity = '0.2';
          element.style.pointerEvents = 'none';
        } else {
          // New Reddit - remove the element
          element.remove();
        }
        
        logCallback(element, this.name, element.textContent, matchedWord);
      }

      handleLayoutAdjustment() {
        // New Reddit layout adjustments
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

    // sites/youtube.js

    class YouTubeHandler extends BaseSiteHandler {
      constructor() {
        super();
        this.name = 'youtube';
      }

      canHandle(hostname) {
        return hostname.includes('youtube.com');
      }

      getElementsToCheck() {
        return document.querySelectorAll('ytd-video-renderer, ytd-comment-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');
      }

      findBestElementToRemove(element) {
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

    // sites/linkedin.js

    class LinkedInHandler extends BaseSiteHandler {
      constructor() {
        super();
        this.name = 'linkedin';
      }

      canHandle(hostname) {
        return hostname.includes('linkedin.com');
      }

      getElementsToCheck() {
        return document.querySelectorAll('.feed-shared-update-v2, .feed-shared-post, .comments-comment-item, .feed-shared-article');
      }

      findBestElementToRemove(element) {
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
    }

    // siteRegistry.js

    class SiteRegistry {
      constructor() {
        this.handlers = [
          new RedditHandler(),
          new YouTubeHandler(),
          new LinkedInHandler()
        ];
        this.fallbackHandler = new BaseSiteHandler();
        this.currentHandler = null;
      }

      getCurrentSiteHandler() {
        if (!this.currentHandler) {
          const hostname = window.location.hostname;
          this.currentHandler = this.handlers.find(handler => handler.canHandle(hostname)) || this.fallbackHandler;
          logger.info(`Using ${this.currentHandler.name} handler for ${hostname}`);
        }
        return this.currentHandler;
      }

      getSiteType() {
        const handler = this.getCurrentSiteHandler();
        return handler.name;
      }

      getElementsToCheck() {
        return this.getCurrentSiteHandler().getElementsToCheck();
      }

      findBestElementToRemove(element) {
        return this.getCurrentSiteHandler().findBestElementToRemove(element);
      }

      removeElement(element, matchedWord, logCallback) {
        return this.getCurrentSiteHandler().removeElement(element, matchedWord, logCallback);
      }

      handleLayoutAdjustment() {
        return this.getCurrentSiteHandler().handleLayoutAdjustment();
      }

      // Register a new handler
      registerHandler(handler) {
        this.handlers.push(handler);
      }
    }

    const siteRegistry = new SiteRegistry();

    class SharedState {
        constructor() {
            this.isEnabled = true;
            this.wordsToRemove = DEFAULT_WORDS;
        }

        async getState() {
            const result = await chrome.storage.local.get(['isEnabled', 'blockedWords']);
            return {
                isEnabled: result.isEnabled !== undefined ? result.isEnabled : true,
                wordsToRemove: result.blockedWords || DEFAULT_WORDS
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

    // contentProcessor.js

    class ContentProcessor {
        constructor() {
            this.removedCount = 0;
            this.lastCheck = 0;
        }

        findMatchingWord(text) {
            // Convert text to lowercase
            const lowerText = text.toLowerCase();
            
            // Find first matching word using exact word boundaries
            return stateManager.wordsToRemove.find(targetWord => {
                const wordRegex = new RegExp(`\\b${targetWord.toLowerCase()}\\b`);
                return wordRegex.test(lowerText);
            });
        }

        logRemoval(element, siteType, text, matchedWord) {
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

                const siteType = siteRegistry.getSiteType();
                logger.debug('Site type:', siteType);
                
                if (siteType === 'base') return;

                siteRegistry.handleLayoutAdjustment();

                // Check if the site handler has a custom content processing method
                const currentHandler = siteRegistry.getCurrentSiteHandler();
                if (currentHandler.handleContentProcessing && currentHandler.handleContentProcessing(this)) {
                    // If the handler returns true, it has handled the processing, so we can return
                    return;
                }

                // Standard processing for sites without custom handlers
                const elements = siteRegistry.getElementsToCheck();
                logger.debug('Found elements:', elements.length);

                elements.forEach(element => {
                    const text = element.textContent;
                    const matchedWord = this.findMatchingWord(text);
                    
                    if (matchedWord) {
                        logger.debug('Found matching word in:', text.slice(0, 100));
                        const target = siteRegistry.findBestElementToRemove(element);
                        if (target && target !== document.body) {
                            try {
                                siteRegistry.removeElement(target, matchedWord, this.logRemoval.bind(this));
                            } catch (error) {
                                logger.error('Failed to remove element:', error);
                            }
                        }
                    }
                });
            } catch (error) {
                logger.error('Error in process:', error);
            }
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
                logger.info('DeTrumper: Starting up on ' + siteRegistry.getSiteType());
                observer.setup();
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    logger.info('DeTrumper: Starting up on ' + siteRegistry.getSiteType());
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
                statsManager$1.resetSessionStats();
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
