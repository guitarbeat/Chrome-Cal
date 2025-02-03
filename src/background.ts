import {
  ChromeUtils,
  StateUtils,
  ExtensionState,
  Message,
  MessageResponse,
  CalendarEvent
} from './types';
import { googleCalendarApi } from './api';

// Global state
let state: ExtensionState = {
  isAuthorized: false,
  darkMode: false,
  selectedEvent: null,
  settings: {
    ghostFutureEvents: false,
    hideUntilTime: undefined
  }
};

const chromeUtils: ChromeUtils = {
  async getCurrentTab(): Promise<chrome.tabs.Tab> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab found');
      return tab;
    } catch (error) {
      console.error('Failed to get current tab:', error);
      throw error;
    }
  },

  isCalendarPage(url?: string): boolean {
    return url?.includes('calendar.google.com') || false;
  },

  async injectContentScriptIfNeeded(): Promise<void> {
    const tab = await this.getCurrentTab();
    if (!tab.id) return;

    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-bundle.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['styles.css']
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

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATE' });
      return response.data || null;
    } catch (error) {
      console.error('Failed to get selected event:', error);
      return null;
    }
  },

  async toggleGhosting(enabled: boolean): Promise<void> {
    try {
      const tab = await this.getCurrentTab();
      if (!tab.id || !this.isCalendarPage(tab.url)) return;

      await this.injectContentScriptIfNeeded();
      await chrome.tabs.sendMessage(tab.id, { 
        type: 'TOGGLE_GHOST',
        payload: enabled 
      });
      
      await this.reloadCalendarTabs();
    } catch (error) {
      console.error('Failed to toggle ghosting:', error);
    }
  },

  async updateEventEmotion(eventTitle: string, emotion: string): Promise<void> {
    try {
      const tab = await this.getCurrentTab();
      if (!tab.id || !this.isCalendarPage(tab.url)) return;

      await this.injectContentScriptIfNeeded();
      await chrome.tabs.sendMessage(tab.id, {
        type: 'UPDATE_EVENT',
        payload: { eventTitle, emotion }
      });
    } catch (error) {
      console.error('Failed to update event emotion:', error);
    }
  },

  async reloadCalendarTabs(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({url: "https://calendar.google.com/calendar/*"});
      for (const tab of tabs) {
        if (tab.id && this.isCalendarPage(tab.url)) {
          await chrome.tabs.reload(tab.id);
        }
      }
    } catch (error) {
      console.error('Failed to reload calendar tabs:', error);
    }
  }
};

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
          hideUntilTime: undefined
        }
      });
      
      Object.assign(this.state, stored);
      
      if (this.state.settings.ghostFutureEvents) {
        await chromeUtils.toggleGhosting(true);
      }
    } catch (error) {
      console.error('Failed to initialize state:', error);
    }
  },

  updateState(newState: Partial<ExtensionState>): void {
    Object.assign(this.state, newState);
    chrome.storage.sync.set(newState).catch(error => {
      console.error('Failed to persist state:', error);
    });
  },

  getState(): ExtensionState {
    return this.state;
  }
};

// Message handling
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const response: MessageResponse = { success: true };

  (async () => {
    try {
      switch (message.type) {
        case 'GET_STATE':
          response.data = stateUtils.getState();
          break;

        case 'UPDATE_STATE':
          stateUtils.updateState(message.payload);
          break;

        case 'AUTH_REQUIRED':
          await googleCalendarApi.init();
          stateUtils.updateState({ isAuthorized: true });
          break;

        case 'UPDATE_EVENT':
          if (message.payload?.eventTitle && message.payload?.emotion) {
            await chromeUtils.updateEventEmotion(
              message.payload.eventTitle,
              message.payload.emotion
            );
          }
          break;

        case 'TOGGLE_GHOST':
          await chromeUtils.toggleGhosting(message.payload);
          stateUtils.updateState({
            settings: {
              ...state.settings,
              ghostFutureEvents: message.payload
            }
          });
          break;

        default:
          response.success = false;
          response.error = 'Unknown message type';
      }
    } catch (error) {
      response.success = false;
      response.error = error instanceof Error ? error.message : 'Unknown error';
    }

    sendResponse(response);
  })();

  return true; // Keep the message channel open for the async response
});

// Initialize extension
(async () => {
  await stateUtils.initializeState();
  await googleCalendarApi.init().catch(console.error);
})(); 