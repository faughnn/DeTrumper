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
        this.domObserver = null;
        this.lastDocumentHeight = 0;
        this.heightCheckInterval = null;
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
          
          // Initialize last document height
          this.lastDocumentHeight = document.documentElement.scrollHeight;
          
          // CHANGED: Instead of using DOM observers, check for height changes 
          // which indicate new content was loaded (e.g. through infinite scroll)
          this.heightCheckInterval = setInterval(() => {
            const currentHeight = document.documentElement.scrollHeight;
            if (currentHeight > this.lastDocumentHeight) {
              logger.info('Page height increased, likely new content loaded');
              this.lastDocumentHeight = currentHeight;
              this.processPosts(contentProcessor);
            }
          }, 1000);
          
          // Force an initial processing
          setTimeout(() => {
            this.processPosts(contentProcessor);
          }, 100);
          
          return true; // We're handling this site
        }
        
        return false; // Let standard processing handle it
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
          
          // Skip if no new posts since last check
          if (allPosts.length <= this.lastProcessedCount) {
            logger.debug('No new posts detected, skipping processing');
            return;
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
            
            // Skip posts we've already processed
            if (elementId && this.processedElements.has(elementId)) {
              return;
            }
            
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
                  
                  // Mark as processed
                  if (elementId) {
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
                  
                  // Mark as processed
                  if (elementId) {
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
        this.handlers = {
          reddit: new RedditHandler(),
          youtube: new YouTubeHandler(),
          linkedin: new LinkedInHandler()
        };
        this.fallbackHandler = new BaseSiteHandler();
        this.currentHandler = null;
        this.currentSiteType = null;
        this.isInitialized = false;
      }

      initialize() {
        if (this.isInitialized) return;
        
        const hostname = window.location.hostname;
        
        // Match the hostname to determine the correct handler
        if (hostname.includes('reddit.com')) {
          this.currentSiteType = 'reddit';
          this.currentHandler = this.handlers.reddit;
        } else if (hostname.includes('youtube.com')) {
          this.currentSiteType = 'youtube';
          this.currentHandler = this.handlers.youtube;
        } else if (hostname.includes('linkedin.com')) {
          this.currentSiteType = 'linkedin';
          this.currentHandler = this.handlers.linkedin;
        } else {
          this.currentSiteType = 'base';
          this.currentHandler = this.fallbackHandler;
        }
        
        logger.info(`Using ${this.currentSiteType} handler for ${hostname}`);
        this.isInitialized = true;
      }

      getCurrentSiteHandler() {
        // Ensure registry is initialized
        if (!this.isInitialized) {
          this.initialize();
        }
        
        return this.currentHandler;
      }

      getSiteType() {
        // Ensure registry is initialized
        if (!this.isInitialized) {
          this.initialize();
        }
        
        logger.debug(`Retrieved cached site type: ${this.currentSiteType}`);
        return this.currentSiteType;
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
            this.pendingUpdates = 0;
            this.lastStorageUpdate = 0;
            this.storageBatch = this.getInitialStats(); // Initialize with empty stats
            this.BATCH_THRESHOLD = 10; // Number of updates to batch before writing
            this.UPDATE_INTERVAL = 5000; // Milliseconds between forced updates
            this.isInitialized = false;
        }

        async updateStats(matchedWord, siteType) {
            logger.debug('Updating stats for:', matchedWord, 'on site:', siteType);
            
            try {
                const state = await sharedState.getState();
                if (!state.isEnabled) {
                    logger.info('Stats update skipped - extension disabled');
                    return;
                }
                
                // Ensure we have a valid batch object
                if (!this.storageBatch || !this.isInitialized) {
                    await this.initBatchUpdate();
                }
                
                // Double-check that we have a valid storage batch after initialization
                if (!this.storageBatch) {
                    logger.warn('Unable to initialize stats storage, using default');
                    this.storageBatch = this.getInitialStats();
                }
                
                // Update in-memory batch with null checks
                this.storageBatch.totalBlocked = (this.storageBatch.totalBlocked || 0) + 1;
                
                // Ensure objects exist
                if (!this.storageBatch.siteStats) this.storageBatch.siteStats = {};
                if (!this.storageBatch.wordStats) this.storageBatch.wordStats = {};
                
                this.storageBatch.siteStats[siteType] = (this.storageBatch.siteStats[siteType] || 0) + 1;
                this.storageBatch.wordStats[matchedWord] = (this.storageBatch.wordStats[matchedWord] || 0) + 1;
                
                this.pendingUpdates++;
                
                // Update session stats
                this.updateSessionStats(matchedWord, siteType);
                
                // Decide whether to commit to storage now
                const now = Date.now();
                if (this.pendingUpdates >= this.BATCH_THRESHOLD || now - this.lastStorageUpdate > this.UPDATE_INTERVAL) {
                    await this.commitBatchUpdate();
                }
            } catch (error) {
                logger.error('Failed to update stats:', error);
            }
        }

        async initBatchUpdate() {
            try {
                // Get current stats from storage
                const result = await chrome.storage.local.get(['blockStats']);
                this.storageBatch = result.blockStats || this.getInitialStats();
                
                // Ensure the batch has all required properties
                if (!this.storageBatch.totalBlocked) this.storageBatch.totalBlocked = 0;
                if (!this.storageBatch.siteStats) this.storageBatch.siteStats = {};
                if (!this.storageBatch.wordStats) this.storageBatch.wordStats = {};
                if (!this.storageBatch.timeStarted) this.storageBatch.timeStarted = Date.now();
                
                logger.debug('Initialized batch with current stats:', this.storageBatch);
                this.isInitialized = true;
            } catch (error) {
                logger.error('Failed to initialize batch update:', error);
                // Provide a fallback
                this.storageBatch = this.getInitialStats();
                this.isInitialized = true;
            }
        }
        
        async commitBatchUpdate() {
            if (this.pendingUpdates === 0 || !this.storageBatch) return;
            
            try {
                logger.debug('Committing batch update with', this.pendingUpdates, 'pending updates');
                await chrome.storage.local.set({ blockStats: this.storageBatch });
                
                this.lastStorageUpdate = Date.now();
                this.pendingUpdates = 0;
            } catch (error) {
                logger.error('Failed to commit batch update:', error);
            }
        }

        updateSessionStats(matchedWord, siteType) {
            try {
                // Ensure we have valid session stats
                if (!this.sessionStats) {
                    this.sessionStats = this.getInitialStats();
                }
                
                this.sessionStats.totalBlocked = (this.sessionStats.totalBlocked || 0) + 1;
                
                // Ensure objects exist
                if (!this.sessionStats.siteStats) this.sessionStats.siteStats = {};
                if (!this.sessionStats.wordStats) this.sessionStats.wordStats = {};
                
                this.sessionStats.siteStats[siteType] = (this.sessionStats.siteStats[siteType] || 0) + 1;
                this.sessionStats.wordStats[matchedWord] = (this.sessionStats.wordStats[matchedWord] || 0) + 1;

                chrome.storage.local.set({ sessionStats: this.sessionStats });
                logger.debug('Session stats updated:', this.sessionStats);
            } catch (error) {
                logger.error('Failed to update session stats:', error);
            }
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
        
        // Make sure to commit any pending updates before extension unloads
        async cleanup() {
            try {
                if (this.pendingUpdates > 0 && this.storageBatch) {
                    await this.commitBatchUpdate();
                }
            } catch (error) {
                logger.error('Failed during stats cleanup:', error);
            }
        }
    }

    const statsManager$1 = new StatsManager();

    // contentProcessor.js

    class ContentProcessor {
        constructor() {
            this.removedCount = 0;
            this.lastCheck = 0;
            this.processedTexts = new Set(); // Track processed content
            this.processingInProgress = false; // Add a flag to prevent concurrent processing
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
                // Skip if extension is disabled or processing is already in progress
                if (!stateManager.isEnabled || this.processingInProgress) return;
                
                // Add throttling to prevent too frequent processing
                const now = Date.now();
                if (now - this.lastCheck < MUTATION_CHECK_INTERVAL) return;
                this.lastCheck = now;
                
                // Set processing flag to prevent concurrent processing
                this.processingInProgress = true;

                // Get the site type once and cache it
                const siteType = siteRegistry.getSiteType();
                logger.debug('Site type:', siteType);
                
                if (siteType === 'base') {
                    this.processingInProgress = false;
                    return;
                }

                siteRegistry.handleLayoutAdjustment();

                // Check if the site handler has a custom content processing method
                const currentHandler = siteRegistry.getCurrentSiteHandler();
                if (currentHandler.handleContentProcessing && currentHandler.handleContentProcessing(this)) {
                    // If the handler returns true, it has handled the processing, so we can return
                    this.processingInProgress = false;
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
                
                // Clear processing flag when done
                this.processingInProgress = false;
            } catch (error) {
                logger.error('Error in process:', error);
                this.processingInProgress = false; // Make sure to clear the flag even if there's an error
            }
        }
    }

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
            if (statsManager$1) {
                statsManager$1.cleanup();
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

})();
