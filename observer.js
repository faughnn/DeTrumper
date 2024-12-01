import { contentProcessor } from './contentProcessor.js';

class Observer {
    constructor() {
        this.observer = null;
    }

    setup() {
        this.observer = new MutationObserver((mutations) => {
            requestAnimationFrame(() => contentProcessor.process());
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        contentProcessor.process();
        
        return this.observer;
    }

    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
        }
    }
}

export const observer = new Observer();
