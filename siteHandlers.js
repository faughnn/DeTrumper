import { SITE_TYPES } from './config.js';

class SiteHandlers {
    getSiteType() {
        const hostname = window.location.hostname;
        if (hostname.includes('reddit.com')) return SITE_TYPES.REDDIT;
        if (hostname.includes('youtube.com')) return SITE_TYPES.YOUTUBE;
        if (hostname.includes('linkedin.com')) return 'linkedin';
        // Instead of returning OTHER, let's identify the domain
        const domain = hostname.replace('www.', '');
        return domain || SITE_TYPES.OTHER;
    }

    findBestElementToRemove(element, siteType) {
        if (siteType === SITE_TYPES.REDDIT) {
            return this.findRedditElement(element);
        } 
        else if (siteType === SITE_TYPES.YOUTUBE) {
            return this.findYoutubeElement(element);
        }
        else if (siteType === 'linkedin') {
            return this.findLinkedInElement(element);
        }
        return element;
    }

    findRedditElement(element) {
        let current = element;
        while (current && current !== document.body) {
            // Handle new Reddit horizontal carousel items
            if (current.tagName && current.tagName.toLowerCase() === 'faceplate-tracker') {
                return current;
            }
            // Handle new Reddit carousel items
            if (current.tagName && current.tagName.toLowerCase() === 'li' && 
                current.closest('shreddit-gallery-carousel')) {
                return current;
            }
            // Original Reddit selectors
            if (current.classList.contains('thing') || 
                current.tagName === 'ARTICLE' ||
                current.classList.contains('Comment') ||
                current.classList.contains('Post') ||
                (current.tagName === 'DIV' && current.getAttribute('data-testid') === 'post-container')) {
                return current;
            }
            current = current.parentElement;
        }
        return element;
    }

    findYoutubeElement(element) {
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

    findLinkedInElement(element) {
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

    handleLayoutAdjustment(siteType) {
        if (siteType === SITE_TYPES.REDDIT) {
            this.adjustRedditLayout();
        }
    }

    adjustRedditLayout() {
        const mainContainer = document.querySelector('.ListingLayout-backgroundContainer');
        if (mainContainer) {
            mainContainer.style.maxWidth = 'none';
            mainContainer.style.padding = '0 24px';
        }

        const contentContainer = document.querySelector('.ListingLayout-contentContainer');
        if (contentContainer) {
            contentContainer.style.margin = '0 auto';
            contentContainer.style.maxWidth = '1200px';
        }
    }

    getElementsToCheck(siteType) {
        if (siteType === SITE_TYPES.YOUTUBE) {
            return document.querySelectorAll('ytd-video-renderer, ytd-comment-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');
        } 
        else if (siteType === 'linkedin') {
            return document.querySelectorAll('.feed-shared-update-v2, .feed-shared-post, .comments-comment-item, .feed-shared-article');
        } 
        else {
            // Updated Reddit selectors to include carousel items
            return document.querySelectorAll(`
                article, 
                .thing, 
                .Comment, 
                .comment, 
                .Post, 
                .post, 
                div[data-testid="post-container"],
                shreddit-gallery-carousel li,
                faceplate-tracker,
                search-dynamic-id-cache-controller li
            `);
        }
    }
}

export const siteHandlers = new SiteHandlers();