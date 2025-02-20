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
        this.domObserver = null;
        this.processingActive = false;
        this.pageObserver = null; // New observer specifically for page changes
      }

      canHandle(hostname) {
        return hostname.includes('reddit.com');
      }

      getElementsToCheck() {
        // For old Reddit UI, get everything
        if (document.querySelector('#siteTable')) {
          return document.querySelectorAll('#siteTable > .thing, #siteTable .title, #siteTable .md');
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
            const postContainer = element.closest('.thing');
            return postContainer || element;
          }
          if (element.classList.contains('md')) {
            const postContainer = element.closest('.thing');
            return postContainer || element;
          }
          
          // Try to find a parent post container
          let current = element;
          while (current && current !== document.body) {
            if (current.classList.contains('thing')) {
              return current;
            }
            current = current.parentElement;
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

      // This is called once during setup
      handleContentProcessing(contentProcessor) {
        // If we're on old Reddit
        if (document.querySelector('#siteTable')) {
          logger.info('Setting up specialized handler for Old Reddit');
          
          // Set up a direct DOM observer for the #siteTable
          this.setupDomObserver(contentProcessor);
          
          // Set up an aggressive polling interval as backup
          if (!this.scrollMonitorInterval) {
            this.scrollMonitorInterval = setInterval(() => {
              this.processPosts(contentProcessor);
            }, 100); // Very frequent checks
          }
          
          // Extra measure: process on scroll events
          window.addEventListener('scroll', () => {
            // Debounce the scroll event to avoid excessive processing
            if (!this.processingActive) {
              this.processingActive = true;
              // Use requestAnimationFrame to ensure we don't block the UI
              requestAnimationFrame(() => {
                this.processPosts(contentProcessor);
                setTimeout(() => {
                  this.processingActive = false;
                }, 50);
              });
            }
          }, { passive: true });
          
          // Set up page-change observer for infinite scroll
          this.setupPageChangeObserver(contentProcessor);
          
          // Force an initial processing
          setTimeout(() => {
            this.processPosts(contentProcessor);
          }, 0);
          
          // Re-process periodically while viewing the page
          setInterval(() => {
            this.processPosts(contentProcessor);
          }, 2000);
          
          return true; // We're handling this site
        }
        
        return false; // Let standard processing handle it
      }

      // Set up a DOM observer specifically watching for new Reddit posts
      setupDomObserver(contentProcessor) {
        const siteTable = document.querySelector('#siteTable');
        
        if (siteTable && !this.domObserver) {
          logger.info('Setting up DOM observer for #siteTable');
          
          this.domObserver = new MutationObserver((mutations) => {
            logger.debug('DOM mutation detected in #siteTable, processing posts');
            this.processPosts(contentProcessor);
          });
          
          this.domObserver.observe(siteTable, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
          });
          
          logger.info('DOM observer set up successfully');
        }
      }

      // NEW FUNCTION: Observe page changes for infinite scroll
      setupPageChangeObserver(contentProcessor) {
        if (!this.pageObserver) {
          logger.info('Setting up page change observer for infinite scroll');
          
          // Observe the entire document body for new page markers or content containers
          this.pageObserver = new MutationObserver((mutations) => {
            // Check for relevant mutations that might indicate new content
            for (const mutation of mutations) {
              if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Inspect added nodes for things that look like Reddit content
                for (const node of mutation.addedNodes) {
                  if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if this is a new siteTable or contains Reddit posts
                    if (node.id === 'siteTable' || 
                        node.classList && node.classList.contains('siteTable') ||
                        node.querySelector && node.querySelector('.thing, .sitetable, .link')) {
                      
                      logger.info('New page content detected in infinite scroll');
                      
                      // Process immediately and then again after a delay
                      // to catch any lazy-loaded content
                      this.processPosts(contentProcessor);
                      
                      // Process again after a short delay to catch any more content
                      setTimeout(() => {
                        this.processPosts(contentProcessor);
                      }, 500);
                      
                      // And again after a longer delay
                      setTimeout(() => {
                        this.processPosts(contentProcessor);
                      }, 1500);
                    }
                  }
                }
              }
            }
          });
          
          // Observe the entire document body for the highest chance of catching new pages
          this.pageObserver.observe(document.body, {
            childList: true,
            subtree: true
          });
          
          logger.info('Page change observer set up successfully');
        }
      }

      // Enhanced version that thoroughly processes all posts
      processPosts(contentProcessor) {
        // Only proceed if the extension is enabled
        if (!contentProcessor || !window.stateManager || !window.stateManager.isEnabled) {
          return;
        }
        
        // Get words to filter
        const wordsToFilter = window.stateManager.wordsToRemove;
        if (!wordsToFilter || wordsToFilter.length === 0) {
          return;
        }
        
        logger.debug('Processing Old Reddit posts with words:', wordsToFilter.join(', '));
        
        try {
          // Get all posts - use a more thorough selector to catch all possible posts
          // This is critical for infinite scroll as it adds different kinds of containers
          const allPosts = document.querySelectorAll('#siteTable > .thing, .sitetable > .thing, .linklisting > .thing, .link, .entry');
          
          // Keep track of document height to detect changes
          const currentHeight = document.documentElement.scrollHeight;
          if (currentHeight !== this.lastHeight) {
            logger.debug('Document height changed, forcing thorough reprocessing');
            this.lastHeight = currentHeight;
            // Clear some of the processed cache to ensure we recheck everything
            if (this.processedElements.size > 5000) {
              logger.debug('Clearing processed elements cache (was too large)');
              this.processedElements.clear();
            }
          }
          
          logger.debug(`Processing ${allPosts.length} posts (${this.processedElements.size} already processed)`);
          
          // Process each post
          allPosts.forEach(post => {
            // Get post ID to avoid reprocessing
            const postId = post.getAttribute('data-fullname') || post.id;
            if (!postId) {
              // If there's no ID, create one based on content hash
              const titleEl = post.querySelector('a.title');
              const titleText = titleEl ? titleEl.textContent : '';
              const contentEl = post.querySelector('.md');
              const contentText = contentEl ? contentEl.textContent : '';
              // Create a pseudo-ID from content
              const pseudoId = `pseudo-${titleText.substring(0, 20)}-${contentText.substring(0, 20)}`;
              // Use this for tracking
              post.setAttribute('data-detrumper-id', pseudoId);
            }
            
            const elementId = postId || post.getAttribute('data-detrumper-id');
            
            // Always check posts, even if we've seen them before
            // This handles cases where content loads after the container
            
            // 1. Check the title
            const titleElement = post.querySelector('a.title');
            if (titleElement) {
              const titleText = titleElement.textContent || '';
              
              // Try to match each word
              for (const word of wordsToFilter) {
                // Use a very simple but effective check - case insensitive includes
                // This is more reliable than regex for basic filtering
                if (titleText.toLowerCase().includes(word.toLowerCase())) {
                  // Hide the post
                  post.style.display = 'none';
                  post.classList.add('removed-by-detrumper');
                  
                  // Only log if we haven't already processed this post
                  if (elementId && !this.processedElements.has(elementId)) {
                    this.processedElements.add(elementId);
                    contentProcessor.logRemoval(post, this.name, titleText, word);
                  }
                  
                  // Break early since we're hiding the whole post anyway
                  return;
                }
              }
            }
            
            // 2. Check the post content
            const contentElements = post.querySelectorAll('.md, .usertext-body');
            for (const contentEl of contentElements) {
              const contentText = contentEl.textContent || '';
              
              // Try to match each word
              for (const word of wordsToFilter) {
                if (contentText.toLowerCase().includes(word.toLowerCase())) {
                  // Hide the post
                  post.style.display = 'none';
                  post.classList.add('removed-by-detrumper');
                  
                  // Only log if we haven't already processed this post
                  if (elementId && !this.processedElements.has(elementId)) {
                    this.processedElements.add(elementId);
                    contentProcessor.logRemoval(post, this.name, contentText.substring(0, 100), word);
                  }
                  
                  // Break early
                  return;
                }
              }
            }
            
            // Mark as processed regardless of outcome
            if (elementId) {
              this.processedElements.add(elementId);
            }
          });
          
          // Track how many posts we've processed
          this.lastProcessedCount = allPosts.length;
          logger.debug(`Processed ${allPosts.length} Old Reddit posts`);
          
        } catch (error) {
          logger.error('Error processing Old Reddit posts:', error);
        }
      }

      removeElement(element, matchedWord, logCallback) {
        // Get the closest post container if we're in Old Reddit
        if (document.querySelector('#siteTable')) {
          const postContainer = element.closest('.thing') || element;
          
          // Hide the entire post
          postContainer.style.display = 'none';
          postContainer.classList.add('removed-by-detrumper');
          
          // Log the removal
          logCallback(postContainer, this.name, element.textContent, matchedWord);
          return;
        }
        
        // For New Reddit or comments
        if (element.classList.contains('comment')) {
          element.style.opacity = '0.2';
          element.style.pointerEvents = 'none';
        } else {
          element.remove();
        }
        
        logCallback(element, this.name, element.textContent, matchedWord);
      }

      handleLayoutAdjustment() {
        // No special adjustments needed for old Reddit
        if (document.querySelector('#siteTable')) {
          return;
        }
        
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
            this.processedTexts = new Set(); // Track processed content
        }

        // Utility function to escape special regex characters
        escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        // Simple hash function for text content
        hashText(text) {
            let hash = 0;
            for (let i = 0; i < Math.min(text.length, 1000); i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash;
        }

        findMatchingWord(text) {
            // Skip empty text
            if (!text || text.trim() === '') return null;
            
            // Hash long text to avoid memory issues
            const textHash = this.hashText(text);
            if (this.processedTexts.has(textHash)) {
                return null;
            }
            
            // Add to processed set
            this.processedTexts.add(textHash);
            
            // Convert text to lowercase
            const lowerText = text.toLowerCase();
            
            // Find first matching word using a more robust pattern
            return stateManager.wordsToRemove.find(targetWord => {
                try {
                    // More robust pattern that handles various word boundaries
                    const safeWord = this.escapeRegExp(targetWord.toLowerCase());
                    const wordRegex = new RegExp(`(^|[^a-zA-Z0-9])${safeWord}([^a-zA-Z0-9]|$)`, 'i');
                    return wordRegex.test(lowerText);
                } catch (error) {
                    logger.error('Regex error for word:', targetWord, error);
                    // Fallback to simple includes check if regex fails
                    return lowerText.includes(targetWord.toLowerCase());
                }
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
    logger.setLevel(LOG_LEVELS.DEBUG); // Temporarily boost logging for troubleshooting
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

            // Create content processor first so it's available for site handlers
            contentProcessor = new ContentProcessor();
            
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
            logger.info('Received updateWords message:', request);
            stateManager.isEnabled = request.isEnabled !== undefined ? request.isEnabled : true;
            
            if (!stateManager.isEnabled) {
                statsManager$1.resetSessionStats();
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
                    if (currentHandler.name === 'reddit' && document.querySelector('#siteTable')) {
                        logger.info('Force processing Old Reddit posts after update');
                        currentHandler.processPosts(contentProcessor);
                    }
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
