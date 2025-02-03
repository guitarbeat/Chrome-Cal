/**
 * @file Content Script
 * @module content
 * @description DOM manipulation and event handling for Google Calendar UI
 * @author Your Name
 * @version 1.0.0
 */

import { CalendarEvent, Message, MessageResponse } from "./types";
import type { ToggleEventGhostPayload, InitGapiPayload } from "./types";
import { domUtils } from "./utils";
import type { Gapi } from "./types";

// Add efficient DOM querying utilities
const domSelectors = {
  selectedEvent: [
    '[data-eventid][aria-selected="true"]',
    '[role="gridcell"] [role="button"][aria-selected="true"]',
    '.Jmftzc.gVNoLb.EiZ8Dd[aria-selected="true"]',
  ].join(","),

  calendarEvents: [
    "[data-eventid]",
    '[role="gridcell"] [role="button"]',
    ".Jmftzc.gVNoLb.EiZ8Dd",
  ].join(","),
};

// Cache DOM elements
const elementCache = new Map<string, HTMLElement>();
const CACHE_TTL = 5000; // 5 seconds

function getCachedElement(selector: string): HTMLElement | null {
  const cached = elementCache.get(selector);
  if (cached) return cached;

  const element = document.querySelector(selector) as HTMLElement;
  if (element) {
    elementCache.set(selector, element);
    setTimeout(() => elementCache.delete(selector), CACHE_TTL);
  }
  return element;
}

// Optimize DOM updates with requestAnimationFrame
const batchDOMUpdates = (() => {
  let scheduled = false;
  const updates: (() => void)[] = [];

  return (fn: () => void) => {
    updates.push(fn);
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const fns = [...updates];
        updates.length = 0;
        fns.forEach((f) => f());
      });
    }
  };
})();

/**
 * Calendar event utilities
 * @namespace utils
 */
const utils = {
  /**
   * Get currently selected calendar event
   * @returns {CalendarEvent | null} Selected event or null
   */
  getSelectedEvent(): CalendarEvent | null {
    const element = getCachedElement(domSelectors.selectedEvent);
    if (!element) return null;

    const title = element.getAttribute("title") || "";
    const timeEl =
      element.querySelector("time") ||
      element.querySelector("[data-start-time]");
    const startTime =
      timeEl?.getAttribute("datetime") ||
      timeEl?.getAttribute("data-start-time") ||
      "";

    return {
      id: element.getAttribute("data-eventid") || crypto.randomUUID(),
      title: title.trim(),
      startTime,
      endTime: startTime,
    };
  },

  // Apply ghosting to future events
  applyGhosting(enabled: boolean): void {
    // Get current time from calendar's current time indicator
    const timeIndicator = document.querySelector('.rGFpCd') as HTMLElement;
    const now = timeIndicator?.dataset?.time ? 
      new Date(Number(timeIndicator.dataset.time)) : 
      new Date();

    // Try multiple selectors for better compatibility
    const selectors = [
      "[data-eventid]",
      '[role="gridcell"] [role="button"]',
      ".Jmftzc.gVNoLb.EiZ8Dd",
    ];

    const events: NodeListOf<HTMLElement>[] = selectors.map((selector) =>
      document.querySelectorAll(selector),
    );

    events.forEach((nodeList) => {
      nodeList.forEach((event) => {
        if (!(event instanceof HTMLElement)) return;

        // Try to get event date
        const timeElement =
          event.querySelector("time") ||
          event.querySelector("[data-start-time]");
        const dateStr =
          timeElement?.getAttribute("datetime") ||
          timeElement?.getAttribute("data-start-time");

        if (dateStr) {
          const eventDate = new Date(dateStr);
          if (enabled && eventDate > now) {
            event.style.opacity = "0.5";
            event.style.filter = "grayscale(50%)";
          } else {
            event.style.opacity = "";
            event.style.filter = "";
          }
        }
      });
    });
  },

  // Hide morning events
  hideMorningEvents(untilTime?: string): void {
    if (!untilTime) return;

    const [hours] = untilTime.split(":").map(Number);

    // Try multiple selectors for better compatibility
    const selectors = [
      "[data-eventid]",
      '[role="gridcell"] [role="button"]',
      ".Jmftzc.gVNoLb.EiZ8Dd",
    ];

    const events: NodeListOf<HTMLElement>[] = selectors.map((selector) =>
      document.querySelectorAll(selector),
    );

    events.forEach((nodeList) => {
      nodeList.forEach((event) => {
        if (!(event instanceof HTMLElement)) return;

        const timeElement =
          event.querySelector("time") ||
          event.querySelector("[data-start-time]");
        const dateStr =
          timeElement?.getAttribute("datetime") ||
          timeElement?.getAttribute("data-start-time");

        if (dateStr) {
          const eventDate = new Date(dateStr);
          if (eventDate.getHours() < hours) {
            event.style.display = "none";
          } else {
            event.style.display = "";
          }
        }
      });
    });
  },

  // Apply ghosting to specific events by title
  applyEventGhosting(eventTitles: string[], opacity: number): void {
    const selectors = [
      "[data-eventid]",
      '[role="gridcell"] [role="button"]',
      ".Jmftzc.gVNoLb.EiZ8Dd",
    ];

    selectors.forEach(selector => {
      document.querySelectorAll<HTMLElement>(selector).forEach(event => {
        const eventTitle = event.getAttribute("title")?.trim() || "";
        
        if (eventTitles.includes(eventTitle)) {
          event.style.opacity = (opacity / 100).toString();
          event.style.pointerEvents = "none";
          event.classList.add("ghosted-event");
        } else if (event.classList.contains("ghosted-event")) {
          event.style.opacity = "";
          event.style.pointerEvents = "";
          event.classList.remove("ghosted-event");
        }
      });
    });
  },
};

/**
 * MutationObserver for detecting DOM changes
 * @type {MutationObserver}
 */
const observer = new MutationObserver(
  domUtils.throttle(() => {
    elementCache.clear(); // Clear cache on DOM changes
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
      if (response.success && response.data) {
        const state = response.data;
        if (state.settings.ghostFutureEvents) {
          utils.applyGhosting(true);
        }
        if (state.settings.hideUntilTime) {
          utils.hideMorningEvents(state.settings.hideUntilTime);
        }
      }
    });
  }, 250), // Reduced from 1000ms to 250ms for better responsiveness while maintaining performance
);

// Clean up observer on page unload
window.addEventListener("beforeunload", () => {
  observer.disconnect();
  elementCache.clear();
});

// Handle messages from the extension
chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    const response: MessageResponse = { success: true };

    try {
      switch (message.type) {
        case "GET_STATE":
          response.data = utils.getSelectedEvent();
          break;

        case "TOGGLE_GHOST":
          if (typeof message.payload === "boolean") {
            utils.applyGhosting(message.payload);
          }
          break;

        case "HIDE_MORNINGS":
          if (
            typeof message.payload === "string" ||
            message.payload === undefined
          ) {
            utils.hideMorningEvents(message.payload);
          }
          break;

        case "TOGGLE_EVENT_GHOST": {
          const payload = message.payload as ToggleEventGhostPayload;
          if (payload?.titles && typeof payload.opacity === "number") {
            utils.applyEventGhosting(payload.titles, payload.opacity);
          }
          break;
        }

        case "INIT_GAPI": {
          const { clientId, apiKey } = message.payload as InitGapiPayload;
          initializeGapi(clientId, apiKey)
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error }));
          return true; // Keep the channel open
        }

        default:
          response.success = false;
          response.error = "Unknown message type";
      }
    } catch (error) {
      response.success = false;
      response.error = error instanceof Error ? error.message : "Unknown error";
    }

    sendResponse(response);
    return true;
  },
);

// Click listener for event selection
document.addEventListener("click", () => {
  const event = utils.getSelectedEvent();
  if (event) {
    chrome.runtime.sendMessage({
      type: "UPDATE_STATE",
      payload: { selectedEvent: event },
    });
  }
});

declare const gapi: Gapi;

async function initializeGapi(clientId: string, apiKey: string) {
  return new Promise<void>((resolve, reject) => {
    gapi.load("client", async () => {
      try {
        await gapi.client.init({
          apiKey,
          clientId,
          discoveryDocs: [
            "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
          ],
          scope: "https://www.googleapis.com/auth/calendar.events",
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Add this to the end of the file to handle initial load
document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (response.success && response.data) {
      const state = response.data;
      if (state.settings.ghostFutureEvents) {
        utils.applyGhosting(true);
      }
      if (state.settings.hideUntilTime) {
        utils.hideMorningEvents(state.settings.hideUntilTime);
      }
    }
  });
});
