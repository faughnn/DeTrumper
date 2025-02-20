// siteRegistry.js
import { RedditHandler } from './sites/reddit.js';
import { YouTubeHandler } from './sites/youtube.js';
import { LinkedInHandler } from './sites/linkedin.js';
import { BaseSiteHandler } from './sites/base.js';
import { logger } from './logger.js';

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

export const siteRegistry = new SiteRegistry();