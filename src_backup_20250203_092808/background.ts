import {
  ChromeUtils,
  StateUtils,
  ContextMenuUtils,
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
    ghostFutureEvents: false
  }
};

const chromeUtils: ChromeUtils = {
  async setCalendarIcon(): Promise<void> {
    try {
      const currentDay = new Date().getDate();
      const CALENDAR_ICON_URL = `https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_${currentDay}.ico`;
      await chrome.action.setIcon({ path: CALENDAR_ICON_URL });
    } catch (error) {
      console.error('Failed to set calendar icon:', error);
    }
  },

  getCurrentTab: async (): Promise<chrome.tabs.Tab> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab found');
      return tab;
    } catch (error) {
      console.error('Failed to get current tab:', error);
      throw error;
    }
  },

  checkCalendarPage: async (): Promise<boolean> => {
    try {
      const tab = await chromeUtils.getCurrentTab();
      return tab.url?.includes('calendar.google.com') || false;
    } catch (error) {
      console.error('Failed to check calendar page:', error);
      return false;
    }
  },

  openGoogleCalendar: async (): Promise<void> => {
    try {
      // First, try to find an existing Google Calendar tab
      const tabs = await chrome.tabs.query({});
      const calendarTab = tabs.find(tab => tab.url?.includes('calendar.google.com'));
      
      if (calendarTab?.id) {
        // If found, activate it and focus its window
        await chrome.tabs.update(calendarTab.id, { active: true });
        if (calendarTab.windowId) {
          await chrome.windows.update(calendarTab.windowId, { 
            focused: true,
            drawAttention: true
          });
        }
        return;
      }
      
      // If no calendar tab exists, create a new one
      const newTab = await chrome.tabs.create({ 
        url: 'https://calendar.google.com/',
        active: true 
      });

      // Focus the window containing the new tab
      if (newTab.windowId) {
        await chrome.windows.update(newTab.windowId, { 
          focused: true,
          drawAttention: true
        });
      }
    } catch (error) {
      console.error('Failed to open Google Calendar:', error);
      throw error;
    }
  },

  injectContentScriptIfNeeded: async (): Promise<void> => {
    const tab = await chromeUtils.getCurrentTab();
    if (!tab.id) return;

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
    } catch (error) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-bundle.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['styles.css']
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  },

  checkContentScript: async (): Promise<boolean> => {
    try {
      await chromeUtils.injectContentScriptIfNeeded();
      return true;
    } catch {
      return false;
    }
  },

  getSelectedEvent: async (): Promise<CalendarEvent | null> => {
    try {
      await chromeUtils.injectContentScriptIfNeeded();
      const tab = await chromeUtils.getCurrentTab();
      if (!tab.id) return null;

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelectedEvent' });
      return response.event || null;
    } catch (error) {
      console.error('Failed to get selected event:', error);
      return null;
    }
  },

  toggleGhosting: async (enabled: boolean): Promise<void> => {
    try {
      const tab = await chromeUtils.getCurrentTab();
      if (!tab.id || !tab.url || tab.url.startsWith('chrome://')) return;

      await chromeUtils.injectContentScriptIfNeeded();
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'toggleGhosting',
        enabled: enabled 
      });
      
      // Reload all calendar tabs to ensure changes take effect
      await chromeUtils.reloadCalendarTabs();
    } catch (error) {
      console.error('Failed to toggle ghosting:', error);
    }
  },

  reloadCalendarTabs: async (): Promise<void> => {
    try {
      const tabs = await chrome.tabs.query({url: "https://calendar.google.com/calendar/*"});
      for (const tab of tabs) {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
          await chrome.tabs.reload(tab.id);
        }
      }
    } catch (error) {
      console.error('Failed to reload calendar tabs:', error);
    }
  },

  updateEventEmotion: async (eventTitle: string, emotion: string): Promise<void> => {
    try {
      const tab = await chromeUtils.getCurrentTab();
      if (!tab.id || !tab.url || tab.url.startsWith('chrome://')) return;

      await chromeUtils.injectContentScriptIfNeeded();
      
      // Get the selected event details
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelectedEvent' });
      const event = response.event;
      
      if (!event || !event.eventId) {
        console.error('No event selected or event ID missing');
        return;
      }

      // Extract calendar ID from the event ID
      const [calendarId] = event.eventId.split('_');
      if (!calendarId) {
        console.error('Could not extract calendar ID from event');
        return;
      }

      // Parse energy level from emotion string
      const match = emotion.match(/[+-]?\d+/);
      if (!match) {
        console.error('Could not parse energy level from emotion:', emotion);
        return;
      }

      const energyLevel = parseInt(match[0]);

      // Update the event using the Google Calendar API
      await googleCalendarApi.updateEventEnergyLevel(
        calendarId,
        event.eventId,
        event.title,
        energyLevel
      );

      // Also update the UI immediately
      await chrome.tabs.sendMessage(tab.id, {
        action: 'updateEventEmotion',
        eventTitle: event.title,
        emotion: emotion
      });

    } catch (error) {
      console.error('Failed to update event:', error);
    }
  }
};

const stateUtils: StateUtils = {
  state: state,

  async initializeState(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get({
        isAuthorized: false,
        darkMode: false,
        selectedEvent: null,
        settings: {
          ghostFutureEvents: false
        }
      });
      Object.assign(this.state, result);
      
      // Only apply ghosting if explicitly enabled
      if (this.state.settings.ghostFutureEvents) {
        await chromeUtils.toggleGhosting(true);
      }
    } catch (error) {
      console.error('Failed to initialize state:', error);
    }
  },

  updateState(newState: Partial<ExtensionState>): void {
    Object.assign(this.state, newState);
    // Immediately update cache
    Object.assign(state, newState);
    // Then persist to storage
    chrome.storage.sync.set(newState).catch(error => {
      console.error('Failed to persist state:', error);
    });
  },

  getState(): ExtensionState {
    // Always return from cache
    return state;
  },

  updateActiveTab(tabId: number): void {
    this.updateState({ selectedEvent: null });
  }
};

const contextMenuUtils: ContextMenuUtils = {
  createContextMenus(): void {
    try {
      chrome.contextMenus.create({
        id: 'quickEnergy',
        title: 'Quick Energy Level',
        contexts: ['link'],
        documentUrlPatterns: ['*://calendar.google.com/*']
      });

      const energyLevels = [
        { value: -4, text: '🔋 Very Draining (-4)' },
        { value: -2, text: '🔋 Draining (-2)' },
        { value: 0, text: '⚖️ Neutral (0)' },
        { value: 2, text: '⚡ Energizing (+2)' },
        { value: 4, text: '⚡ Very Energizing (+4)' }
      ];

      energyLevels.forEach(level => {
        chrome.contextMenus.create({
          id: `energy_${level.value}`,
          parentId: 'quickEnergy',
          title: level.text,
          contexts: ['link'],
          documentUrlPatterns: ['*://calendar.google.com/*']
        });
      });
    } catch (error) {
      console.error('Failed to create context menus:', error);
    }
  },

  handleContextMenuClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ): void {
    if (!info.menuItemId.toString().startsWith('energy_') || !tab?.id) return;
    
    const energyValue = parseInt(info.menuItemId.toString().split('_')[1]);
    
    chrome.tabs.sendMessage(tab.id, {
      action: 'quickUpdateEnergy',
      value: energyValue
    }).catch(error => {
      console.error('Failed to handle context menu click:', error);
    });
  }
};

// Initialize the extension
const initializeExtension = async () => {
  try {
    await stateUtils.initializeState();
    await chromeUtils.setCalendarIcon();
    contextMenuUtils.createContextMenus();
    chrome.tabs.onActivated.addListener(async () => {
      const tab = await getCurrentTab();
      if (tab?.url?.includes('calendar.google.com')) {
        state.isAuthorized = true;
      }
    });
  } catch (error) {
    console.error('Failed to initialize extension:', error);
  }
};

// Initialize when installed or updated
chrome.runtime.onInstalled.addListener(initializeExtension);

// Message handling
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const handleMessage = async () => {
    const response: MessageResponse = { success: true };

    try {
      switch (message.type) {
        case 'GET_STATE':
          response.data = state;
          break;
        case 'UPDATE_STATE':
          state = { ...state, ...message.payload };
          response.data = state;
          break;
        case 'AUTH_REQUIRED':
          state.isAuthorized = false;
          response.data = { authorized: false };
          break;
        case 'checkCalendarPage':
          if (!sender.tab?.url) {
            response.success = false;
            response.error = 'No tab URL provided';
            break;
          }
          response.data = isGoogleCalendarUrl(sender.tab.url);
          break;
        case 'openGoogleCalendar':
          try {
            await findOrCreateCalendarTab();
            response.data = { success: true };
          } catch (error) {
            response.success = false;
            response.error = 'Failed to open calendar';
          }
          break;
        case 'toggleGhosting':
          await chromeUtils.toggleGhosting(message.payload);
          response.data = { success: true };
          break;
        case 'updateEventEmotion':
          await chromeUtils.updateEventEmotion(
            message.payload.eventTitle,
            message.payload.emotion
          );
          await googleCalendarApi.updateEventEnergyLevel(
            message.payload.calendarId,
            message.payload.eventId,
            message.payload.eventTitle,
            message.payload.energyLevel
          );
          response.data = { success: true };
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
  };

  handleMessage();
  return true;
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(contextMenuUtils.handleContextMenuClick);

// Track active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  stateUtils.updateActiveTab(activeInfo.tabId);
});

// Export utils (for use in other parts of the extension)
export { chromeUtils, stateUtils, contextMenuUtils };

// Helper function to check if a URL is a Google Calendar URL
function isGoogleCalendarUrl(url: string): boolean {
  return url.startsWith('https://calendar.google.com/');
}

// Helper function to find or create a Google Calendar tab
async function findOrCreateCalendarTab(): Promise<chrome.tabs.Tab> {
  try {
    // First, try to find an existing Google Calendar tab
    const tabs = await chrome.tabs.query({});
    const calendarTab = tabs.find(tab => tab.url && isGoogleCalendarUrl(tab.url));
    
    if (calendarTab) {
      // If found, activate it
      await chrome.tabs.update(calendarTab.id!, { active: true });
      await chrome.windows.update(calendarTab.windowId, { focused: true });
      return calendarTab;
    }
    
    // If not found, create a new tab
    return await chrome.tabs.create({
      url: 'https://calendar.google.com/',
      active: true
    });
  } catch (error) {
    console.error('Error managing calendar tab:', error);
    throw error;
  }
}

// Core functionality
async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateIcon(): Promise<void> {
  const currentDay = new Date().getDate();
  const iconUrl = `https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_${currentDay}.ico`;
  await chrome.action.setIcon({ path: iconUrl });
}

// State management
const stateManager = {
  state: {
    isAuthorized: false,
    darkMode: false,
    selectedEvent: null,
    settings: {
      ghostFutureEvents: false,
      hideUntilTime: undefined
    }
  } as ExtensionState,

  async initialize(): Promise<void> {
    try {
      // Load saved state from storage
      const saved = await chrome.storage.sync.get('extensionState');
      if (saved.extensionState) {
        this.state = { ...this.state, ...saved.extensionState };
      }

      // Apply settings to all calendar tabs
      const tabs = await chrome.tabs.query({ url: "*://calendar.google.com/*" });
      for (const tab of tabs) {
        if (tab.id) {
          if (this.state.settings.ghostFutureEvents) {
            await chrome.tabs.sendMessage(tab.id, { 
              type: 'toggleGhosting', 
              payload: true 
            });
          }
          if (this.state.settings.hideUntilTime) {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'hideMornings',
              payload: this.state.settings.hideUntilTime
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize state:', error);
    }
  },

  async updateState(newState: Partial<ExtensionState>): Promise<void> {
    this.state = { ...this.state, ...newState };
    
    // Persist to storage
    await chrome.storage.sync.set({ extensionState: this.state });

    // Apply settings to active calendar tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url?.includes('calendar.google.com')) {
      if ('settings' in newState) {
        if ('ghostFutureEvents' in newState.settings!) {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'toggleGhosting',
            payload: this.state.settings.ghostFutureEvents
          });
        }
        if ('hideUntilTime' in newState.settings!) {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'hideMornings',
            payload: this.state.settings.hideUntilTime
          });
        }
      }
    }
  }
};

// Initialize state when extension loads
chrome.runtime.onInstalled.addListener(() => {
  stateManager.initialize();
});

// Handle messages
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const handleMessage = async () => {
    const response: MessageResponse = { success: true };

    try {
      switch (message.type) {
        case 'GET_STATE':
          response.data = stateManager.state;
          break;

        case 'UPDATE_STATE':
          await stateManager.updateState(message.payload);
          response.data = stateManager.state;
          break;

        case 'openGoogleCalendar':
          await chromeUtils.openGoogleCalendar();
          break;

        case 'updateEventEmotion':
          const { eventTitle, energyLevel } = message.payload;
          await chromeUtils.updateEventEmotion(eventTitle, energyLevel.toString());
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
  };

  handleMessage();
  return true;
}); 