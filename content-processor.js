import { ANIMATION_DURATION, MUTATION_CHECK_INTERVAL } from './config.js';
import { siteHandlers } from './siteHandlers.js';
import { statsManager } from './statsManager.js';

class ContentProcessor {
    constructor() {
        this.removedCount = 0;
        this.lastCheck = 0;
    }

    findMatchingWord(text) {
        return stateManager.wordsToRemove.find(word => 
            text.toLowerCase().includes(word.toLowerCase())
        );
    }

    logRemoval(element, siteType, text) {
        const matchedWord = this.findMatchingWord(text);
        console.log('🗑️ Removed:', {
            site: siteType,
            type: element.tagName,
            classes: element.className,
            matchedWord: matchedWord,
            text: text.slice(0, 100).trim() + (text.length > 100 ? '...' : ''),
            count: ++this.removedCount
        });

        if (matchedWord) {
            statsManager.updateStats(matchedWord, siteType);
        }
    }

    process() {
        if (!stateManager.isEnabled) return;

        const now = Date.now();
        if (now - this.lastCheck < MUTATION_CHECK_INTERVAL) return;
        this.lastCheck = now;

        const siteType = siteHandlers.getSiteType();
        if (siteType === 'other') return;

        siteHandlers.handleLayoutAdjustment(siteType);

        const elements = siteHandlers.getElementsToCheck(siteType);

        elements.forEach(element => {
            if (element.hasAttribute('data-checked')) return;
            
            const text = element.textContent.toLowerCase();
            if (stateManager.wordsToRemove.some(word => text.includes(word.toLowerCase()))) {
                const target = siteHandlers.findBestElementToRemove(element, siteType);
                if (target && target !== document.body) {
                    this.removeElement(target, siteType, text);
                }
            }
            element.setAttribute('data-checked', 'true');
        });
    }

    removeElement(element, siteType, text) {
        element.classList.add('removed');
        element.style.transition = 'opacity 0.3s ease-out';
        element.style.opacity = '0';
        
        setTimeout(() => {
            this.logRemoval(element, siteType, text);
            element.remove();
        }, ANIMATION_DURATION);
    }
}

export const contentProcessor = new ContentProcessor();
