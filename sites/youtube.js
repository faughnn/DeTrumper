// sites/youtube.js
import { BaseSiteHandler } from './base.js';

export class YouTubeHandler extends BaseSiteHandler {
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