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