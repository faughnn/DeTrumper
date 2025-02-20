// sites/reddit.js
import { BaseSiteHandler } from './base.js';

export class RedditHandler extends BaseSiteHandler {
  constructor() {
    super();
    this.name = 'reddit';
  }

  canHandle(hostname) {
    return hostname.includes('reddit.com');
  }

  getElementsToCheck() {
    // Expanded Reddit selectors to catch more post types
    return document.querySelectorAll(`
      div.thing,
      [data-fullname],
      article.Post,
      article[data-testid="post-container"],
      div[data-testid="post"],
      shreddit-post,
      .sitetable > .thing,
      faceplate-tracker,
      .Post,
      [data-test-id="post-content"],
      .link,
      shreddit-gallery-carousel li
    `);
  }

  findBestElementToRemove(element) {
    let current = element;
    while (current && current !== document.body) {
      // Check for various Reddit post identifiers
      if (current.classList.contains('thing') || 
          current.hasAttribute('data-fullname') ||
          current.classList.contains('Post') ||
          current.tagName === 'ARTICLE' ||
          (current.tagName === 'DIV' && current.getAttribute('data-testid') === 'post-container') ||
          current.classList.contains('sitetable') ||
          (current.tagName && current.tagName.toLowerCase() === 'shreddit-post')) {
          
          // If this is a container with multiple posts, find the specific post
          const postParent = current.closest('.thing, [data-fullname], .Post, article, [data-testid="post-container"]');
          return postParent || current;
      }
      current = current.parentElement;
    }
    return element;
  }

  handleLayoutAdjustment() {
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