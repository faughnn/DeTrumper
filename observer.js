export class Observer {
    constructor(contentProcessor) {
        this.observer = null;
        this.contentProcessor = contentProcessor;
    }

    setup() {
        this.observer = new MutationObserver((mutations) => {
            requestAnimationFrame(() => this.contentProcessor.process());
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.contentProcessor.process();
        
        return this.observer;
    }

    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
        }
    }
}