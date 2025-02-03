/**
 * @file Google Calendar API Wrapper
 * @module api
 * @description Singleton class handling Google Calendar API interactions
 * @author Your Name
 * @version 1.0.0
 */

// No unused imports

/**
 * Main Google Calendar API class
 * @class GoogleCalendarAPI
 * @description Singleton class managing Google Calendar API connections
 */
class GoogleCalendarAPI {
  private static instance: GoogleCalendarAPI;
  private clientId?: string;
  private apiKey?: string;
  private isInitialized = false;
  private initPromise?: Promise<void>;
  private tabCache?: chrome.tabs.Tab;
  private lastTabQuery = 0;
  private readonly TAB_CACHE_TTL = 5000; // 5 seconds

  private constructor() {}

  static getInstance(): GoogleCalendarAPI {
    if (!GoogleCalendarAPI.instance) {
      GoogleCalendarAPI.instance = new GoogleCalendarAPI();
    }
    return GoogleCalendarAPI.instance;
  }

  private async getCalendarTab(): Promise<chrome.tabs.Tab> {
    const now = Date.now();
    if (this.tabCache && now - this.lastTabQuery < this.TAB_CACHE_TTL) {
      return this.tabCache;
    }

    const [tab] = await chrome.tabs.query({
      url: "https://calendar.google.com/*",
    });

    this.tabCache = tab;
    this.lastTabQuery = now;

    if (!tab?.id) throw new Error("No calendar tab found");
    return tab;
  }

  /**
   * Initialize API connection
   * @param clientId - OAuth2 client ID
   * @param apiKey - Google API key
   * @throws Error if initialization fails
   */
  async init(clientId: string, apiKey: string): Promise<void> {
    // Prevent multiple simultaneous initializations
    if (this.initPromise) return this.initPromise;
    if (
      this.isInitialized &&
      this.clientId === clientId &&
      this.apiKey === apiKey
    ) {
      return Promise.resolve();
    }

    this.initPromise = (async () => {
      try {
        const tab = await this.getCalendarTab();

        await new Promise<void>((resolve, reject) => {
          chrome.tabs.sendMessage(
            tab.id!,
            {
              type: "INIT_GAPI",
              payload: { clientId, apiKey },
            },
            (response) => {
              if (response?.success) {
                this.clientId = clientId;
                this.apiKey = apiKey;
                this.isInitialized = true;
                resolve();
              } else {
                reject(response?.error || "GAPI initialization failed");
              }
            },
          );
        });
      } finally {
        this.initPromise = undefined;
      }
    })();

    return this.initPromise;
  }

  async getToken(): Promise<string> {
    try {
      const auth = await chrome.identity.getAuthToken({ interactive: true });
      if (!auth?.token) {
        throw new Error("Failed to get auth token");
      }
      return auth.token;
    } catch (error) {
      console.error("Failed to get auth token:", error);
      throw new Error("Authentication failed. Please try again.");
    }
  }

  async updateEventTitle(
    calendarId: string,
    eventId: string,
    newTitle: string,
  ): Promise<void> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const tab = await this.getCalendarTab();

        await new Promise<void>((resolve, reject) => {
          chrome.tabs.sendMessage(
            tab.id!,
            {
              type: "API_REQUEST",
              payload: {
                method: "updateEventTitle",
                args: [calendarId, eventId, newTitle],
              },
            },
            (response) => {
              response?.success ? resolve() : reject(response?.error);
            },
          );
        });

        return;
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * attempt),
        );
      }
    }
  }
}

export const googleCalendarApi = GoogleCalendarAPI.getInstance();

/**
 * Refresh calendar data from storage
 * @throws Error if missing API credentials
 */
export async function refreshCalendarData() {
  const { clientId, apiKey } = await chrome.storage.local.get([
    "clientId",
    "apiKey",
  ]);
  if (!clientId || !apiKey) throw new Error("Missing API credentials");

  await googleCalendarApi.init(clientId, apiKey);
}
