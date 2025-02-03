import { CalendarEvent, ExtensionState, Message, MessageResponse } from './types';

// Core utilities for DOM manipulation and event handling
const utils = {
  // Wait for an element to appear in the DOM
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
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found after ${timeout}ms`));
      }, timeout);
    });
  },

  // Throttle function calls
  throttle: <T extends (...args: any[]) => any>(
    func: T,
    limit = 100
  ): (...args: Parameters<T>) => void => {
    let waiting = false;
    return (...args: Parameters<T>) => {
      if (!waiting) {
        func(...args);
        waiting = true;
        setTimeout(() => waiting = false, limit);
      }
    };
  },

  // Get the currently selected calendar event
  getSelectedEvent: (): CalendarEvent | null => {
    // Google Calendar uses multiple possible selectors for events
    const selectedElement = document.querySelector(
      '[data-eventid][aria-selected="true"], ' + // Main event view
      '[role="gridcell"] [role="button"][aria-selected="true"], ' + // Month view
      '.Jmftzc.gVNoLb.EiZ8Dd[aria-selected="true"]' // Agenda view
    );
    
    if (!selectedElement) return null;

    // Find the title element (Google Calendar uses different structures)
    const titleElement = selectedElement.querySelector('.FAxxKc') || // Main title
                        selectedElement.querySelector('.r4nke') ||   // Compact title
                        selectedElement.querySelector('[aria-label]') || // Accessible title
                        selectedElement;

    const title = titleElement instanceof HTMLElement ? 
      (titleElement.textContent || titleElement.getAttribute('aria-label') || '').trim() : '';

    // Get event ID
    const eventId = selectedElement.getAttribute('data-eventid') || 
                   selectedElement.getAttribute('data-key') || 
                   crypto.randomUUID();

    // Get time information
    const timeElement = selectedElement.querySelector('time') ||
                       selectedElement.querySelector('[data-start-time]');
    const startTime = timeElement?.getAttribute('datetime') || 
                     timeElement?.getAttribute('data-start-time') || '';
    const endTime = timeElement?.getAttribute('data-end-time') || startTime;

    // Extract existing energy level if present
    const energyMatch = title.match(/[🔋⚡⚖️]\s*\(([+-]?\d+)\)/);
    const energy = energyMatch ? parseInt(energyMatch[1]) : 0;

    // Clean title from any existing energy indicators
    const cleanTitle = title.replace(/[🔋⚡⚖️]\s*\([+-]?\d+\)/, '').trim();

    return {
      id: eventId,
      title: cleanTitle,
      startTime,
      endTime,
      energy
    };
  },

  // Update event UI with energy level
  updateEventUI: (eventTitle: string, energyLevel: number) => {
    // Find all possible event elements
    const events = document.querySelectorAll(
      '[data-eventid], ' +
      '[role="gridcell"] [role="button"], ' +
      '.Jmftzc.gVNoLb.EiZ8Dd'
    );

    events.forEach(event => {
      if (!(event instanceof HTMLElement)) return;

      // Get the event's title element
      const titleElement = event.querySelector('.FAxxKc') ||
                          event.querySelector('.r4nke') ||
                          event.querySelector('[aria-label]');

      if (!titleElement) return;

      const currentTitle = titleElement instanceof HTMLElement ?
        (titleElement.textContent || titleElement.getAttribute('aria-label') || '').trim() : '';

      // Clean both titles for comparison
      const cleanCurrentTitle = currentTitle.replace(/[🔋⚡⚖️]\s*\([+-]?\d+\)/, '').trim();
      const cleanTargetTitle = eventTitle.replace(/[🔋⚡⚖️]\s*\([+-]?\d+\)/, '').trim();

      if (cleanCurrentTitle === cleanTargetTitle) {
        // Store energy level as data attribute
        event.setAttribute('data-energy', energyLevel.toString());
        
        // Update visual classes
        event.classList.remove('low-energy', 'neutral-energy', 'high-energy');
        event.classList.add(
          energyLevel < 0 ? 'low-energy' :
          energyLevel > 0 ? 'high-energy' :
          'neutral-energy'
        );
        
        // Create energy indicator
        const emoji = energyLevel < 0 ? '🔋' : energyLevel > 0 ? '⚡' : '⚖️';
        const sign = energyLevel > 0 ? '+' : '';
        const energyIndicator = `${emoji} (${sign}${energyLevel})`;
        
        // Update the title
        const newTitle = `${cleanCurrentTitle} ${energyIndicator}`;
        
        // Update all title elements
        [titleElement, ...event.querySelectorAll('.FAxxKc, .r4nke, [aria-label]')]
          .forEach(el => {
            if (el instanceof HTMLElement) {
              if (el.classList.contains('FAxxKc') || el.classList.contains('r4nke')) {
                el.textContent = newTitle;
              }
              if (el.hasAttribute('aria-label')) {
                el.setAttribute('aria-label', newTitle);
              }
            }
          });
      }
    });
  },

  // Apply ghosting effect to future events
  applyGhosting: (enabled: boolean) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today

    const events = document.querySelectorAll(
      '[data-eventid], ' +
      '[role="gridcell"] [role="button"], ' +
      '.Jmftzc.gVNoLb.EiZ8Dd'
    );

    events.forEach(event => {
      if (!(event instanceof HTMLElement)) return;

      // Try to get event date
      const timeElement = event.querySelector('time') ||
                         event.querySelector('[data-start-time]');
      const dateStr = timeElement?.getAttribute('datetime') ||
                     timeElement?.getAttribute('data-start-time');

      if (dateStr) {
        const eventDate = new Date(dateStr);
        event.classList.toggle('ghosted', enabled && eventDate > now);
      }
    });
  }
};

// Handle messages from the extension
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const response: MessageResponse = { success: true };

  try {
    switch (message.type) {
      case 'GET_STATE':
        response.data = utils.getSelectedEvent();
        break;
      case 'updateEventEmotion':
        utils.updateEventUI(message.payload.eventTitle, message.payload.energyLevel);
        break;
      case 'toggleGhosting':
        utils.applyGhosting(message.payload);
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
  return true;
});

// Initialize the content script
const initialize = async () => {
  try {
    // Wait for the calendar to load
    await utils.waitForElement('[role="grid"]');
    
    // Set up event listeners
    document.addEventListener('click', utils.throttle(() => {
      const event = utils.getSelectedEvent();
      if (event) {
        chrome.runtime.sendMessage({ type: 'UPDATE_STATE', payload: { selectedEvent: event } });
      }
    }));

  } catch (error) {
    console.error('Failed to initialize content script:', error);
  }
};

// Start initialization if not already done
if (!document.alreadyRun) {
  document.alreadyRun = 1;
  initialize();
}

// ... existing code ...