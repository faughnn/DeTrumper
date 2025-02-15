import { MUTATION_CHECK_INTERVAL } from './config.js';
import { siteHandlers } from './siteHandlers.js';
import { statsManager } from './statsManager.js';
import { stateManager } from './stateManager.js';
import { logger } from './logger.js';

export class ContentProcessor {
    constructor() {
        this.removedCount = 0;
        this.lastCheck = 0;
    }

    findMatchingWord(text) {
        // Convert text to lowercase and split into words
        const words = text.toLowerCase().split(/\b/);
        
        // Find first matching word that matches exactly
        return stateManager.wordsToRemove.find(targetWord => 
            words.includes(targetWord.toLowerCase())
        );
    }

    logRemoval(element, siteType, text) {
        const matchedWord = this.findMatchingWord(text);
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
            statsManager.updateStats(matchedWord, siteType);
        }
    }

    async process() {
        try {
            if (!stateManager.isEnabled) return;

            const now = Date.now();
            if (now - this.lastCheck < MUTATION_CHECK_INTERVAL) return;
            this.lastCheck = now;

            const siteType = siteHandlers.getSiteType();
            logger.debug('Site type:', siteType);
            
            if (siteType === 'other') return;

            siteHandlers.handleLayoutAdjustment(siteType);

            const elements = siteHandlers.getElementsToCheck(siteType);
            logger.debug('Found elements:', elements.length);

            elements.forEach(element => {
                if (element.hasAttribute('data-checked')) return;
                
                const text = element.textContent;
                const words = text.toLowerCase().split(/\b/);
                if (stateManager.wordsToRemove.some(word => 
                    words.includes(word.toLowerCase())
                )) {
                    logger.debug('Found matching word in:', text.slice(0, 100));
                    const target = siteHandlers.findBestElementToRemove(element, siteType);
                    if (target && target !== document.body) {
                        this.removeElement(target, siteType, text);
                    }
                }
                element.setAttribute('data-checked', 'true');
            });
        } catch (error) {
            logger.error('Error in process:', error);
        }
    }

    removeElement(element, siteType, text) {
        // Immediately remove the element without animation
        this.logRemoval(element, siteType, text);
        element.remove();
    }
}