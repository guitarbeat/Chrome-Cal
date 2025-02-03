/**
 * @file DOM and Chrome API utilities module
 * @module utils
 * @description Contains reusable utilities for DOM manipulation and Chrome extension APIs
 * @author Your Name
 * @version 1.0.0
 */

// DOM utilities
export const domUtils = {
  /**
   * Wait for an element to appear in the DOM
   * @param selector - CSS selector to watch for
   * @param timeout - Timeout in milliseconds (default: 2000)
   * @returns Promise resolving to found element
   */
  waitForElement: (selector: string, timeout = 2000): Promise<HTMLElement> => {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) return resolve(element);

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector) as HTMLElement;
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found after ${timeout}ms`));
      }, timeout);
    });
  },

  /**
   * Throttle function execution
   * @param func - Function to throttle
   * @param limit - Minimum time between calls in ms (default: 1000)
   * @returns Throttled function
   */
  throttle: <T extends (...args: unknown[]) => unknown>(
    func: T,
    limit = 1000,
  ): ((...args: Parameters<T>) => void) => {
    let waiting = false;
    return (...args: Parameters<T>) => {
      if (!waiting) {
        func(...args);
        waiting = true;
        setTimeout(() => (waiting = false), limit);
      }
    };
  },
};

// Chrome utilities
export const chromeUtils = {
  /**
   * Get current active tab
   * @throws Error if no active tab found
   * @returns Promise resolving to current tab
   */
  getCurrentTab: async (): Promise<chrome.tabs.Tab> => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab) throw new Error("No active tab found");
    return tab;
  },

  // Check if we're on a calendar page
  isCalendarPage: (url?: string): boolean => {
    if (!url) return false;
    return url.startsWith("https://calendar.google.com/");
  },

  // Inject content script if needed
  injectContentScriptIfNeeded: async (): Promise<void> => {
    const tab = await chromeUtils.getCurrentTab();
    if (!tab.id || !chromeUtils.isCalendarPage(tab.url)) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-bundle.js"],
      });
    } catch (error) {
      // Script might already be injected, which would cause an error
      // eslint-disable-next-line no-console
      console.debug(
        "Content script injection error (might already be injected):",
        error,
      );
    }
  },
};
