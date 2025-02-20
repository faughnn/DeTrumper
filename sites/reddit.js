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