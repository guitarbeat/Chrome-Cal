declare global {
    interface Document {
        alreadyRun?: number;
    }
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  energy?: number;
}

export interface ExtensionState {
  isAuthorized: boolean;
  darkMode: boolean;
  selectedEvent: CalendarEvent | null;
  settings: {
    hideUntilTime?: string;
    ghostFutureEvents: boolean;
  }
}

export interface EnergyLevel {
  value: number;
  text: string;
}

export type MessageType = 
  | 'GET_STATE' 
  | 'UPDATE_STATE' 
  | 'AUTH_REQUIRED'
  | 'checkCalendarPage'
  | 'openGoogleCalendar'
  | 'toggleGhosting'
  | 'updateEventEmotion';

export interface Message {
  type: MessageType;
  payload?: any;
}

export interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface GoogleAuthToken {
  token: string;
}

export interface ChromeUtils {
  setCalendarIcon(): Promise<void>;
  getCurrentTab(): Promise<chrome.tabs.Tab>;
  checkCalendarPage(): Promise<boolean>;
  openGoogleCalendar(): Promise<void>;
  injectContentScriptIfNeeded(): Promise<void>;
  checkContentScript(): Promise<boolean>;
  getSelectedEvent(): Promise<CalendarEvent | null>;
  toggleGhosting(enabled: boolean): Promise<void>;
  updateEventEmotion(eventTitle: string, emotion: string): Promise<void>;
  reloadCalendarTabs(): Promise<void>;
}

export interface StateUtils {
  state: ExtensionState;
  initializeState(): Promise<void>;
  updateState(newState: Partial<ExtensionState>): void;
  getState(): ExtensionState;
  updateActiveTab(tabId: number): void;
}

export interface DOMUtils {
  listen<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    eventName: K,
    callback: (event: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): () => void;
  throttle<T extends (...args: any[]) => any>(
    func: T,
    limit?: number
  ): (...args: Parameters<T>) => void;
  waitForElement(
    selector: string,
    timeout?: number
  ): Promise<HTMLElement>;
  isDarkMode?(): boolean;
}

export interface UIUtils {
  getEnergyDescription(value: string | number): string;
  getEnergyEmoji(value: string | number): string;
  formatEnergyLevel(value: string | number): string;
  showMessage(text: string, isError?: boolean): void;
  updateSelectedEventUI(event: CalendarEvent | null): void;
  updateEnergyValue(value: string | number): void;
  showAuthorizationRequired(): void;
}

export interface ContextMenuUtils {
  createContextMenus(): void;
  handleContextMenuClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ): void;
}

export interface GhostingUtils {
  initializeGhosting(getState: () => Promise<ExtensionState>): Promise<void>;
  resetGhosting(): void;
  applyFutureEventGhosting(): void;
  applyMorningHiding(hideUntilTime: string): void;
}

export interface CalendarUtils {
  getSelectedCalendarEvent(): CalendarEvent | null;
  getHoveredCalendarEvent(): CalendarEvent | null;
  updateEventWithEmotion(eventTitle: string, emotion: string): void;
  applyMorningHiding(hideUntilTime: string): void;
}

export interface FileSettings {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: {
      [key: string]: string[];
    };
  }>;
  excludeAcceptAllOption: boolean;
  multiple: boolean;
} 