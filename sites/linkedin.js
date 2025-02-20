// sites/linkedin.js
import { BaseSiteHandler } from './base.js';

export class LinkedInHandler extends BaseSiteHandler {
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