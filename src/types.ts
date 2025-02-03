// Global type augmentation
declare global {
  interface Document {
    alreadyRun?: number;
  }
}

// Basic event type
export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  energy?: number;
}

// Extension state
export interface ExtensionState {
  isAuthorized: boolean;
  darkMode: boolean;
  selectedEvent: CalendarEvent | null;
  settings: {
    hideUntilTime?: string;
    ghostFutureEvents: boolean;
  }
}

// Message types
export type MessageType = 
  | 'GET_STATE'
  | 'UPDATE_STATE'
  | 'AUTH_REQUIRED'
  | 'UPDATE_EVENT'
  | 'TOGGLE_GHOST'
  | 'HIDE_MORNINGS';

export interface Message {
  type: MessageType;
  payload?: any;
}

export interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// Utility types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

// Function types
export type ThrottleFunction = <T extends (...args: any[]) => any>(
  func: T,
  limit?: number
) => (...args: Parameters<T>) => void;

export type WaitForElementFunction = (
  selector: string,
  timeout?: number
) => Promise<HTMLElement>;

// Chrome utilities
export interface ChromeUtils {
  getCurrentTab(): Promise<chrome.tabs.Tab>;
  isCalendarPage(url?: string): boolean;
  injectContentScriptIfNeeded(): Promise<void>;
  checkContentScript(): Promise<boolean>;
  getSelectedEvent(): Promise<CalendarEvent | null>;
  toggleGhosting(enabled: boolean): Promise<void>;
  updateEventEmotion(eventTitle: string, emotion: string): Promise<void>;
  reloadCalendarTabs(): Promise<void>;
}

// DOM utilities
export interface DOMUtils {
  waitForElement: WaitForElementFunction;
  throttle: ThrottleFunction;
  isDarkMode(): boolean;
}

// Calendar utilities
export interface CalendarUtils {
  getSelectedEvent(): CalendarEvent | null;
  updateEventEnergy(title: string, energy: number): void;
  applyGhosting(enabled: boolean): void;
  hideMorningEvents(untilTime?: string): void;
}

// State management
export interface StateUtils {
  state: ExtensionState;
  initializeState(): Promise<void>;
  updateState(newState: Partial<ExtensionState>): void;
  getState(): ExtensionState;
}

export interface EnergyLevel {
  value: number;
  text: string;
}

export interface GoogleAuthToken {
  token: string;
} 