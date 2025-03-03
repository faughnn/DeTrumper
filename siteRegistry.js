// siteRegistry.js
import { RedditHandler } from './sites/reddit.js';
import { YouTubeHandler } from './sites/youtube.js';
import { LinkedInHandler } from './sites/linkedin.js';
import { BaseSiteHandler } from './sites/base.js';
import { logger } from './logger.js';

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

export const siteRegistry = new SiteRegistry();