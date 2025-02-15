import { SITE_TYPES } from './config.js';

class SiteHandlers {
    getSiteType() {
        const hostname = window.location.hostname;
        if (hostname.includes('reddit.com')) return SITE_TYPES.REDDIT;
        if (hostname.includes('youtube.com')) return SITE_TYPES.YOUTUBE;
        if (hostname.includes('linkedin.com')) return SITE_TYPES.LINKEDIN;
        return hostname;
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
            // Check for various Reddit post identifiers
            if (current.classList.contains('thing') || 
                current.hasAttribute('data-fullname') ||
                current.classList.contains('Post') ||
                current.tagName === 'ARTICLE' ||
                (current.tagName === 'DIV' && current.getAttribute('data-testid') === 'post-container') ||
                current.classList.contains('sitetable') ||
                (current.tagName && current.tagName.toLowerCase() === 'shreddit-post')) {
                
                // If this is a container with multiple posts, find the specific post
                const postParent = current.closest('.thing, [data-fullname], .Post, article, [data-testid="post-container"]');
                return postParent || current;
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
        else if (siteType === SITE_TYPES.LINKEDIN) {
            return document.querySelectorAll('.feed-shared-update-v2, .feed-shared-post, .comments-comment-item, .feed-shared-article');
        } 
        else if (siteType === SITE_TYPES.REDDIT) {
            // Expanded Reddit selectors to catch more post types
            return document.querySelectorAll(`
                div.thing,
                [data-fullname],
                article.Post,
                article[data-testid="post-container"],
                div[data-testid="post"],
                shreddit-post,
                .sitetable > .thing,
                faceplate-tracker,
                .Post,
                [data-test-id="post-content"],
                .link,
                shreddit-gallery-carousel li
            `);
        }
        return document.querySelectorAll('*');
    }
}

export const siteHandlers = new SiteHandlers();