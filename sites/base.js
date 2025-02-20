// sites/base.js
import { logger } from '../logger.js';

export class BaseSiteHandler {
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