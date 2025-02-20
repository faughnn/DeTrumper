// sites/reddit.js
import { BaseSiteHandler } from './base.js';
import { logger } from '../logger.js';

export class RedditHandler extends BaseSiteHandler {
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