interface GoogleCalendarEvent {
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
}

class GoogleCalendarAPI {
  private static instance: GoogleCalendarAPI;
  private accessToken: string | null = null;

  private constructor() {}

  static getInstance(): GoogleCalendarAPI {
    if (!GoogleCalendarAPI.instance) {
      GoogleCalendarAPI.instance = new GoogleCalendarAPI();
    }
    return GoogleCalendarAPI.instance;
  }

  async init(): Promise<void> {
    try {
      const token = await this.getAccessToken();
      if (token) {
        this.accessToken = token;
      }
    } catch (error) {
      console.error('Failed to initialize Google Calendar API:', error);
      throw error;
    }
  }

  private async getAccessToken(): Promise<string> {
    try {
      const authResult = await chrome.identity.getAuthToken({ interactive: true });
      if (!authResult || !authResult.token) {
        throw new Error('Failed to get auth token');
      }
      return authResult.token;
    } catch (error) {
      console.error('Failed to get auth token:', error);
      throw error;
    }
  }

  async updateEventEnergyLevel(calendarId: string, eventId: string, title: string, energyLevel: number): Promise<void> {
    if (!this.accessToken) {
      await this.init();
    }

    try {
      // First, get the current event details
      const event = await this.getEvent(calendarId, eventId);
      if (!event) throw new Error('Event not found');

      // Update the event title with energy level
      const emoji = this.getEnergyEmoji(energyLevel);
      const sign = energyLevel > 0 ? '+' : '';
      const energyIndicator = `${emoji} (${sign}${energyLevel})`;
      
      // Remove any existing energy indicators
      const cleanTitle = title.replace(/[🔋⚡⚖️]\s*\([+-]?\d+\)/, '').trim();
      const newTitle = `${cleanTitle} ${energyIndicator}`;

      // Update the event
      await this.updateEvent(calendarId, eventId, {
        ...event,
        summary: newTitle
      });

    } catch (error) {
      console.error('Failed to update event energy level:', error);
      throw error;
    }
  }

  private async getEvent(calendarId: string, eventId: string): Promise<GoogleCalendarEvent | null> {
    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get event: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get event:', error);
      return null;
    }
  }

  private async updateEvent(calendarId: string, eventId: string, event: GoogleCalendarEvent): Promise<void> {
    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update event: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to update event:', error);
      throw error;
    }
  }

  private getEnergyEmoji(value: number): string {
    if (value < 0) return '🔋';
    if (value > 0) return '⚡';
    return '⚖️';
  }
}

export const googleCalendarApi = GoogleCalendarAPI.getInstance(); 