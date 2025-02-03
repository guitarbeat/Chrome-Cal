/**
 * @file Type Definitions
 * @description Centralized type definitions for the extension
 * @author Your Name
 * @version 1.0.0
 */

// Global type augmentation
declare global {
  interface Document {
    alreadyRun?: number;
  }
}

/**
 * Calendar event interface
 * @interface CalendarEvent
 */
export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
}

/**
 * Extension state interface
 * @interface ExtensionState
 */
export interface ExtensionState {
  isAuthorized: boolean;
  darkMode: boolean;
  selectedEvent: CalendarEvent | null;
  settings: {
    hideUntilTime?: string;
    ghostFutureEvents: boolean;
    ghostedEvents: string[]; // Array of event titles that are ghosted
    ghostEventOpacity: number; // Opacity level for ghosted events (0-100)
  };
}

// Message types
export type MessageType =
  | "GET_STATE"
  | "UPDATE_STATE"
  | "AUTH_REQUIRED"
  | "TOGGLE_GHOST"
  | "HIDE_MORNINGS"
  | "TOGGLE_EVENT_GHOST"
  | "UPDATE_GHOST_OPACITY"
  | "INIT_GAPI";

export interface ToggleEventGhostPayload {
  eventTitle?: string;
  titles?: string[];
  opacity?: number;
}

export interface InitGapiPayload {
  clientId: string;
  apiKey: string;
}

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

export interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Utility types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

// Function types
export type ThrottleFunction = <T extends (...args: unknown[]) => unknown>(
  func: T,
  limit?: number,
) => (...args: Parameters<T>) => void;

export type WaitForElementFunction = (
  selector: string,
  timeout?: number,
) => Promise<HTMLElement>;

// Chrome utilities
export interface ChromeUtils {
  setCalendarIcon(): Promise<void>;
  getCurrentTab(): Promise<chrome.tabs.Tab>;
  isCalendarPage(url?: string): boolean;
  injectContentScriptIfNeeded(): Promise<void>;
  checkContentScript(): Promise<boolean>;
  getSelectedEvent(): Promise<CalendarEvent | null>;
  toggleGhosting(enabled: boolean): Promise<void>;
  reloadCalendarTabs(): Promise<void>;
  toggleEventGhost(eventTitle: string): Promise<void>;
  openGoogleCalendar(): Promise<void>;
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

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  [key: string]: unknown;
}

// Add Gapi type
export interface Gapi {
  load: (module: string, callback: () => void) => void;
  client: {
    init: (config: {
      apiKey: string;
      clientId: string;
      discoveryDocs: string[];
      scope: string;
    }) => Promise<void>;
  };
}
