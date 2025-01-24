import { SITE_TYPES } from './config.js';

class SiteHandlers {
    getSiteType() {
        const hostname = window.location.hostname;
        if (hostname.includes('reddit.com')) return SITE_TYPES.REDDIT;
        if (hostname.includes('youtube.com')) return SITE_TYPES.YOUTUBE;
        if (hostname.includes('linkedin.com')) return SITE_TYPES.LINKEDIN;
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
        else if (siteType === SITE_TYPES.LINKEDIN) {
            return this.findLinkedInElement(element);
        }
        return element;
    }

    findRedditElement(element) {
        let current = element;
        while (current && current !== document.body) {
            // New Reddit UI selectors
            if (
                current.classList.contains('Post') ||
                current.tagName === 'SHREDDIT-POST' ||
                current.classList.contains('Comment') ||
                current.tagName === 'SHREDDIT-COMMENT' ||
                current.getAttribute('data-testid') === 'post-container' ||
                current.classList.contains('ListingLayout-post') ||
                current.classList.contains('scrollerItem') ||
                (current.tagName === 'DIV' && current.getAttribute('data-testid') === 'comment') ||
                // Feed items in new UI
                (current.tagName === 'DIV' && current.getAttribute('data-testid')?.includes('feed-item'))
            ) {
                return current;
            }
            // Old Reddit UI selectors
            if (
                current.classList.contains('thing') ||
                current.classList.contains('entry') ||
                current.classList.contains('comment') ||
                (current.tagName === 'DIV' && current.classList.contains('sitetable'))
            ) {
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
                current.classList.contains('occludable-update') ||
                current.classList.contains('comments-comment-item') ||
                current.classList.contains('feed-shared-article') ||
                current.classList.contains('feed-shared-post')) {
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
        // New Reddit UI
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

        // Old Reddit UI
        const oldContentContainer = document.querySelector('.content[role="main"]');
        if (oldContentContainer) {
            oldContentContainer.style.margin = '0 auto';
            oldContentContainer.style.maxWidth = '1200px';
        }
    }

    getElementsToCheck(siteType) {
        if (siteType === SITE_TYPES.YOUTUBE) {
            return document.querySelectorAll('ytd-video-renderer, ytd-comment-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');
        } else if (siteType === SITE_TYPES.LINKEDIN) {
            return document.querySelectorAll('.feed-shared-update-v2, .occludable-update, .comments-comment-item, .feed-shared-article, .feed-shared-post');
        } else if (siteType === SITE_TYPES.REDDIT) {
            // Combine selectors for both old and new Reddit
            return document.querySelectorAll(`
                article,
                .thing,
                .Comment,
                .comment,
                .Post,
                .post,
                div[data-testid="post-container"],
                shreddit-post,
                shreddit-comment,
                .ListingLayout-post,
                .scrollerItem,
                div[data-testid="comment"],
                div[data-testid*="feed-item"]
            `);
        } else {
            return document.querySelectorAll('article, .thing, .Comment, .comment, .Post, .post, div[data-testid="post-container"]');
        }
    }
}

export const siteHandlers = new SiteHandlers();