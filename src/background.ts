/**
 * @file Background Script
 * @module background
 * @description Chrome extension background script handling core logic
 * @author Your Name
 * @version 1.0.0
 */

import {
  ChromeUtils,
  StateUtils,
  ExtensionState,
  Message,
  MessageResponse,
  CalendarEvent,
  ToggleEventGhostPayload,
} from "./types";
import { googleCalendarApi } from "./api";

/**
 * Global extension state
 * @type {ExtensionState}
 */
const state: ExtensionState = {
  isAuthorized: false,
  darkMode: false,
  selectedEvent: null,
  settings: {
    ghostFutureEvents: false,
    hideUntilTime: undefined,
    ghostedEvents: [],
    ghostEventOpacity: 50, // Default 50% opacity
  },
};

/**
 * Chrome API utilities implementation
 * @implements {ChromeUtils}
 */
const chromeUtils: ChromeUtils = {
  /**
   * Set calendar icon based on current day
   */
  async setCalendarIcon(): Promise<void> {
    try {
      const currentDay = new Date().getDate();
      const iconUrl = `https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_${currentDay}.ico`;
      await chrome.action.setIcon({ path: iconUrl });
    } catch (error) {
      console.error('Failed to set calendar icon:', error);
    }
  },

  async getCurrentTab(): Promise<chrome.tabs.Tab> {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) throw new Error("No active tab found");
      return tab;
    } catch (error) {
      console.error("Failed to get current tab:", error);
      throw error;
    }
  },

  isCalendarPage(url?: string): boolean {
    return url?.includes("calendar.google.com") || false;
  },

  async injectContentScriptIfNeeded(): Promise<void> {
    const tab = await this.getCurrentTab();
    if (!tab.id) return;

    try {
      await chrome.tabs.sendMessage(tab.id, { type: "ping" });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-bundle.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["styles.css"],
      });
    }
  },

  async checkContentScript(): Promise<boolean> {
    try {
      await this.injectContentScriptIfNeeded();
      return true;
    } catch {
      return false;
    }
  },

  async getSelectedEvent(): Promise<CalendarEvent | null> {
    try {
      await this.injectContentScriptIfNeeded();
      const tab = await this.getCurrentTab();
      if (!tab.id) return null;

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "GET_STATE",
      });
      return response.data || null;
    } catch (error) {
      console.error("Failed to get selected event:", error);
      return null;
    }
  },

  async toggleGhosting(enabled: boolean): Promise<void> {
    try {
      const tab = await this.getCurrentTab();
      if (!tab.id || !this.isCalendarPage(tab.url)) return;

      await this.injectContentScriptIfNeeded();
      await chrome.tabs.sendMessage(tab.id, {
        type: "TOGGLE_GHOST",
        payload: enabled,
      });

      await this.reloadCalendarTabs();
    } catch (error) {
      console.error("Failed to toggle ghosting:", error);
    }
  },

  async reloadCalendarTabs(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({
        url: "https://calendar.google.com/calendar/*",
      });
      for (const tab of tabs) {
        if (tab.id && this.isCalendarPage(tab.url)) {
          await chrome.tabs.reload(tab.id);
        }
      }
    } catch (error) {
      console.error("Failed to reload calendar tabs:", error);
    }
  },

  async toggleEventGhost(eventTitle: string): Promise<void> {
    try {
      const tab = await this.getCurrentTab();
      if (!tab.id || !this.isCalendarPage(tab.url)) return;

      const currentState = stateUtils.getState();
      const ghostedEvents = currentState.settings.ghostedEvents;
      const isGhosted = ghostedEvents.includes(eventTitle);

      // Toggle the event's ghost state
      const newGhostedEvents = isGhosted
        ? ghostedEvents.filter((title) => title !== eventTitle)
        : [...ghostedEvents, eventTitle];

      // Update state
      stateUtils.updateState({
        settings: {
          ...currentState.settings,
          ghostedEvents: newGhostedEvents,
        },
      });

      // Apply changes
      await this.injectContentScriptIfNeeded();
      await chrome.tabs.sendMessage(tab.id, {
        type: "TOGGLE_EVENT_GHOST",
        payload: {
          eventTitles: newGhostedEvents,
          opacity: currentState.settings.ghostEventOpacity,
        },
      });
    } catch (error) {
      console.error("Failed to toggle event ghost:", error);
    }
  },

  async openGoogleCalendar(): Promise<void> {
    try {
      // 1. Try to find existing calendar tab in any window
      const tabs = await chrome.tabs.query({
        url: '*://calendar.google.com/calendar/*'
      });
      
      // 2. Prioritize tabs in currently focused window
      const focusedWindow = await chrome.windows.getCurrent();
      const calendarTab = tabs.find(tab => 
        tab.windowId === focusedWindow.id
      ) || tabs[0];

      if (calendarTab?.id) {
        // 3. Proper activation sequence
        await chrome.windows.update(calendarTab.windowId, {
          focused: true
        });
        await chrome.tabs.update(calendarTab.id, { 
          active: true,
          highlighted: true
        });
        return;
      }

      // 4. Create new tab with proper activation
      const newTab = await chrome.tabs.create({
        url: 'https://calendar.google.com/',
        active: true
      });
      
      // 5. Ensure window activation (without forcing maximized state)
      if (newTab.windowId) {
        await chrome.windows.update(newTab.windowId, {
          focused: true
        });
      }
    } catch (error) {
      console.error('Failed to open Google Calendar:', error);
      throw error;
    }
  },
};

/**
 * State management utilities
 * @implements {StateUtils}
 */
const stateUtils: StateUtils = {
  state,

  async initializeState(): Promise<void> {
    try {
      const stored = await chrome.storage.sync.get({
        isAuthorized: false,
        darkMode: false,
        selectedEvent: null,
        settings: {
          ghostFutureEvents: false,
          hideUntilTime: undefined,
          ghostedEvents: [],
          ghostEventOpacity: 50,
        },
      });

      Object.assign(this.state, stored);

      if (this.state.settings.ghostFutureEvents) {
        await chromeUtils.toggleGhosting(true);
      }

      // Apply ghosting to individual events
      if (this.state.settings.ghostedEvents.length > 0) {
        const tab = await chromeUtils.getCurrentTab();
        if (tab.id && chromeUtils.isCalendarPage(tab.url)) {
          await chromeUtils.injectContentScriptIfNeeded();
          await chrome.tabs.sendMessage(tab.id, {
            type: "TOGGLE_EVENT_GHOST",
            payload: {
              eventTitles: this.state.settings.ghostedEvents,
              opacity: this.state.settings.ghostEventOpacity,
            },
          });
        }
      }
    } catch (error) {
      console.error("Failed to initialize state:", error);
    }
  },

  updateState(newState: Partial<ExtensionState>): void {
    Object.assign(this.state, newState);
    chrome.storage.sync.set(newState).catch((error) => {
      console.error("Failed to persist state:", error);
    });
  },

  getState(): ExtensionState {
    return this.state;
  },
};

// Message handling
chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    const response: MessageResponse = { success: true };

    (async () => {
      try {
        switch (message.type) {
          case "GET_STATE":
            response.data = stateUtils.getState();
            break;

          case "UPDATE_STATE":
            if (message.payload) {
              stateUtils.updateState(
                message.payload as Partial<ExtensionState>,
              );
            }
            break;

          case "AUTH_REQUIRED": {
            const { clientId, apiKey } = await chrome.storage.local.get([
              "clientId",
              "apiKey",
            ]);
            if (clientId && apiKey) {
              await googleCalendarApi
                .init(clientId, apiKey)
                .catch(console.error);
              stateUtils.updateState({ isAuthorized: true });
            }
            break;
          }

          case "TOGGLE_GHOST": {
            const enabled = message.payload as boolean;
            await chromeUtils.toggleGhosting(enabled);
            stateUtils.updateState({
              settings: {
                ...state.settings,
                ghostFutureEvents: enabled,
              },
            });
            break;
          }

          case "TOGGLE_EVENT_GHOST": {
            const payload = message.payload as ToggleEventGhostPayload;
            if (payload?.eventTitle) {
              await chromeUtils.toggleEventGhost(payload.eventTitle);
            }
            break;
          }

          case "UPDATE_GHOST_OPACITY": {
            const opacity = message.payload as number;
            stateUtils.updateState({
              settings: {
                ...state.settings,
                ghostEventOpacity: opacity,
              },
            });
            const tab = await chromeUtils.getCurrentTab();
            if (tab.id && chromeUtils.isCalendarPage(tab.url)) {
              await chrome.tabs.sendMessage(tab.id, {
                type: "TOGGLE_EVENT_GHOST",
                payload: {
                  titles: state.settings.ghostedEvents,
                  opacity: opacity,
                },
              });
            }
            break;
          }

          case "INIT_GAPI": {
            const tab = await chromeUtils.getCurrentTab();
            if (!tab.id) {
              return { success: false, error: "No active tab" };
            }

            const { clientId, apiKey } = await chrome.storage.local.get([
              "clientId",
              "apiKey",
            ]);

            try {
              await chrome.tabs.sendMessage(tab.id, {
                type: "INIT_GAPI",
                payload: { clientId, apiKey },
              });
              return { success: true };
            } catch (error) {
              console.error("GAPI initialization failed:", error);
              return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              };
            }
          }

          default:
            response.success = false;
            response.error = "Unknown message type";
        }
      } catch (error) {
        response.success = false;
        response.error =
          error instanceof Error ? error.message : "Unknown error";
      }

      sendResponse(response);
    })();

    return true;
  },
);

// Initialize extension
(async () => {
  await stateUtils.initializeState();
  await chromeUtils.setCalendarIcon();
  // Get credentials from storage
  const { clientId, apiKey } = await chrome.storage.local.get([
    "clientId",
    "apiKey",
  ]);
  if (clientId && apiKey) {
    await googleCalendarApi.init(clientId, apiKey).catch(console.error);
  }

  // Add these listeners in the background.ts initialization
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      const isCalendar = chromeUtils.isCalendarPage(tab.url);
      await chrome.action.setPopup({
        tabId,
        popup: isCalendar ? 'popup.html' : ''
      });
    }
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const isCalendar = chromeUtils.isCalendarPage(tab.url);
    await chrome.action.setPopup({
      tabId: activeInfo.tabId,
      popup: isCalendar ? 'popup.html' : ''
    });
  });
})();

// Update the action handler at the bottom of the file
chrome.action.onClicked.addListener(async () => {
  try {
    const tab = await chromeUtils.getCurrentTab();
    if (!chromeUtils.isCalendarPage(tab.url)) {
      await chromeUtils.openGoogleCalendar();
    }
  } catch (error) {
    console.error('Error handling browser action:', error);
  }
});
