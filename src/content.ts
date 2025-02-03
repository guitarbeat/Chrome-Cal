import { CalendarEvent, Message, MessageResponse } from './types';
import { domUtils } from './utils';

// Core utilities for DOM manipulation and event handling
const utils = {
  // Get selected event from calendar
  getSelectedEvent(): CalendarEvent | null {
    // Try multiple selectors for better compatibility
    const selectors = [
      '[data-eventid][aria-selected="true"]',
      '[role="gridcell"] [role="button"][aria-selected="true"]',
      '.Jmftzc.gVNoLb.EiZ8Dd[aria-selected="true"]'
    ];

    let element: HTMLElement | null = null;
    for (const selector of selectors) {
      element = document.querySelector(selector);
      if (element) break;
    }

    if (!element) return null;

    // Extract event details
    const title = element.getAttribute('title') || '';
    const timeEl = element.querySelector('time') || element.querySelector('[data-start-time]');
    const energyAttr = element.getAttribute('data-energy');
    const startTime = timeEl?.getAttribute('datetime') || timeEl?.getAttribute('data-start-time') || '';

    // Clean title (remove any existing energy indicators)
    const cleanTitle = title.replace(/[🔋⚡⚖️]\s*\([+-]?\d+\)/, '').trim();

    return {
      id: element.getAttribute('data-eventid') || crypto.randomUUID(),
      title: cleanTitle,
      startTime,
      endTime: startTime, // For now, we'll use the same time
      energy: energyAttr ? parseInt(energyAttr) : 0
    };
  },

  // Update event's energy level
  updateEventEnergy(title: string, energy: number): void {
    // Try multiple selectors for better compatibility
    const selectors = [
      '[data-eventid]',
      '[role="gridcell"] [role="button"]',
      '.Jmftzc.gVNoLb.EiZ8Dd'
    ];

    const events: NodeListOf<HTMLElement>[] = selectors.map(
      selector => document.querySelectorAll(selector)
    );

    events.forEach(nodeList => {
      nodeList.forEach(event => {
        if (!(event instanceof HTMLElement)) return;
        
        const eventTitle = event.getAttribute('title') || '';
        const cleanTitle = eventTitle.replace(/[🔋⚡⚖️]\s*\([+-]?\d+\)/, '').trim();
        
        if (cleanTitle === title) {
          const emoji = energy < 0 ? '🔋' : energy > 0 ? '⚡' : '⚖️';
          const sign = energy > 0 ? '+' : '';
          event.setAttribute('data-energy', energy.toString());
          event.setAttribute('title', `${cleanTitle} ${emoji} (${sign}${energy})`);
        }
      });
    });
  },

  // Apply ghosting to future events
  applyGhosting(enabled: boolean): void {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today

    // Try multiple selectors for better compatibility
    const selectors = [
      '[data-eventid]',
      '[role="gridcell"] [role="button"]',
      '.Jmftzc.gVNoLb.EiZ8Dd'
    ];

    const events: NodeListOf<HTMLElement>[] = selectors.map(
      selector => document.querySelectorAll(selector)
    );

    events.forEach(nodeList => {
      nodeList.forEach(event => {
        if (!(event instanceof HTMLElement)) return;

        // Try to get event date
        const timeElement = event.querySelector('time') || event.querySelector('[data-start-time]');
        const dateStr = timeElement?.getAttribute('datetime') || timeElement?.getAttribute('data-start-time');

        if (dateStr) {
          const eventDate = new Date(dateStr);
          if (enabled && eventDate > now) {
            event.style.opacity = '0.5';
            event.style.filter = 'grayscale(50%)';
          } else {
            event.style.opacity = '';
            event.style.filter = '';
          }
        }
      });
    });
  },

  // Hide morning events
  hideMorningEvents(untilTime?: string): void {
    if (!untilTime) return;
    
    const [hours] = untilTime.split(':').map(Number);
    
    // Try multiple selectors for better compatibility
    const selectors = [
      '[data-eventid]',
      '[role="gridcell"] [role="button"]',
      '.Jmftzc.gVNoLb.EiZ8Dd'
    ];

    const events: NodeListOf<HTMLElement>[] = selectors.map(
      selector => document.querySelectorAll(selector)
    );

    events.forEach(nodeList => {
      nodeList.forEach(event => {
        if (!(event instanceof HTMLElement)) return;

        const timeElement = event.querySelector('time') || event.querySelector('[data-start-time]');
        const dateStr = timeElement?.getAttribute('datetime') || timeElement?.getAttribute('data-start-time');

        if (dateStr) {
          const eventDate = new Date(dateStr);
          if (eventDate.getHours() < hours) {
            event.style.display = 'none';
          } else {
            event.style.display = '';
          }
        }
      });
    });
  }
};

// Watch for DOM changes to reapply styles
const observer = new MutationObserver(
  domUtils.throttle(() => {
    // Get current state and reapply settings
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
  }, 1000)
);

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Handle messages from the extension
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const response: MessageResponse = { success: true };

  try {
    switch (message.type) {
      case 'GET_STATE':
        response.data = utils.getSelectedEvent();
        break;

      case 'UPDATE_EVENT':
        utils.updateEventEnergy(message.payload.title, message.payload.energy);
        break;

      case 'TOGGLE_GHOST':
        utils.applyGhosting(message.payload);
        break;

      case 'HIDE_MORNINGS':
        utils.hideMorningEvents(message.payload);
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

// Watch for event selection
document.addEventListener('click', () => {
  const event = utils.getSelectedEvent();
  if (event) {
    chrome.runtime.sendMessage({
      type: 'UPDATE_STATE',
      payload: { selectedEvent: event }
    });
  }
}); 