import { SITE_TYPES } from './config.js';

class SiteHandlers {
    getSiteType() {
        const hostname = window.location.hostname;
        if (hostname.includes('reddit.com')) return SITE_TYPES.REDDIT;
        if (hostname.includes('youtube.com')) return SITE_TYPES.YOUTUBE;
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
        return element;
    }

    findRedditElement(element) {
        let current = element;
        while (current && current !== document.body) {
            if (current.classList.contains('thing') || 
                current.tagName === 'ARTICLE' ||
                current.classList.contains('Comment') ||
                current.classList.contains('Post')) {
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
        } else {
            return document.querySelectorAll('article, .thing, .Comment, .comment, .Post, .post, div[data-testid="post-container"]');
        }
    }
}

export const siteHandlers = new SiteHandlers();