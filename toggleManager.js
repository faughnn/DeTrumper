class ToggleManager {
    constructor() {
        this.isEnabled = true;
        this.toggleEl = null;
    }

    initialize() {
        this.toggleEl = document.getElementById('toggleExtension');
        this.loadState();
        this.setupEventListeners();
    }

    async loadState() {
        const result = await chrome.storage.local.get(['isEnabled']);
        this.isEnabled = result.isEnabled !== undefined ? result.isEnabled : true;
        // Set initial state without animation
        this.toggleEl.checked = this.isEnabled;
    }

    setupEventListeners() {
        this.toggleEl.addEventListener('change', () => this.toggleState());
    }

    async toggleState() {
        this.isEnabled = !this.isEnabled;
        await chrome.storage.local.set({ isEnabled: this.isEnabled });
        this.notifyTabs();
    }

    async notifyTabs() {
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            // Check if tab.url exists before trying to use includes()
            if (tab.url && (tab.url.includes('reddit.com') || tab.url.includes('youtube.com'))) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateWords",
                    isEnabled: this.isEnabled
                }).catch(() => {
                    // Ignore errors for inactive tabs
                });
            }
        });
    }
}

export const toggleManager = new ToggleManager();