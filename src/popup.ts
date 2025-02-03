import { ExtensionState, CalendarEvent } from './types';

// UI Elements
const elements = {
  selectedEvent: document.getElementById('selectedEvent') as HTMLDivElement,
  energySlider: document.getElementById('energySlider') as HTMLInputElement,
  energyValue: document.getElementById('energyValue') as HTMLDivElement,
  ghostToggle: document.getElementById('ghostToggle') as HTMLInputElement,
  morningToggle: document.getElementById('morningToggle') as HTMLInputElement,
  morningTime: document.getElementById('morningTime') as HTMLInputElement
};

// UI Utilities
const ui = {
  formatEnergy(value: number): string {
    const emoji = value < 0 ? '🔋' : value > 0 ? '⚡' : '⚖️';
    const sign = value > 0 ? '+' : '';
    return `${emoji} (${sign}${value})`;
  },

  updateEventDisplay(event: CalendarEvent | null): void {
    if (!event) {
      elements.selectedEvent.textContent = 'Select an event in Google Calendar';
      elements.energySlider.disabled = true;
      elements.energyValue.textContent = ui.formatEnergy(0);
      return;
    }

    elements.selectedEvent.textContent = event.title;
    elements.energySlider.disabled = false;
    elements.energySlider.value = event.energy.toString();
    elements.energyValue.textContent = ui.formatEnergy(event.energy);
  },

  updateSettings(settings: ExtensionState['settings']): void {
    elements.ghostToggle.checked = settings.ghostFutureEvents;
    elements.morningToggle.checked = !!settings.hideUntilTime;
    elements.morningTime.disabled = !settings.hideUntilTime;
    elements.morningTime.value = settings.hideUntilTime || '08:00';
  }
};

// State management
let state: ExtensionState = {
  selectedEvent: null,
  settings: {
    ghostFutureEvents: false,
    hideUntilTime: undefined
  }
};

// Load state
async function loadState(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (response.success && response.data) {
    state = response.data;
    ui.updateEventDisplay(state.selectedEvent);
    ui.updateSettings(state.settings);
  }
}

// Event handlers
elements.energySlider.addEventListener('input', async () => {
  const energy = parseInt(elements.energySlider.value);
  elements.energyValue.textContent = ui.formatEnergy(energy);

  if (state.selectedEvent) {
    const updatedEvent = {
      ...state.selectedEvent,
      energy
    };

    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_EVENT',
      payload: updatedEvent
    });

    if (response.success) {
      state.selectedEvent = updatedEvent;
      
      // Update the event in the calendar
      const tab = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab[0]?.id) {
        chrome.tabs.sendMessage(tab[0].id, {
          type: 'UPDATE_EVENT',
          payload: updatedEvent
        });
      }
    }
  }
});

elements.ghostToggle.addEventListener('change', async () => {
  const enabled = elements.ghostToggle.checked;
  
  const response = await chrome.runtime.sendMessage({
    type: 'TOGGLE_GHOST',
    payload: enabled
  });

  if (response.success) {
    state.settings.ghostFutureEvents = enabled;
    
    // Update the calendar view
    const tab = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab[0]?.id) {
      chrome.tabs.sendMessage(tab[0].id, {
        type: 'TOGGLE_GHOST',
        payload: enabled
      });
    }
  }
});

elements.morningToggle.addEventListener('change', async () => {
  const enabled = elements.morningToggle.checked;
  elements.morningTime.disabled = !enabled;
  
  const hideUntilTime = enabled ? elements.morningTime.value : undefined;
  
  const response = await chrome.runtime.sendMessage({
    type: 'HIDE_MORNINGS',
    payload: hideUntilTime
  });

  if (response.success) {
    state.settings.hideUntilTime = hideUntilTime;
    
    // Update the calendar view
    const tab = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab[0]?.id) {
      chrome.tabs.sendMessage(tab[0].id, {
        type: 'HIDE_MORNINGS',
        payload: hideUntilTime
      });
    }
  }
});

elements.morningTime.addEventListener('change', async () => {
  if (elements.morningToggle.checked) {
    const hideUntilTime = elements.morningTime.value;
    
    const response = await chrome.runtime.sendMessage({
      type: 'HIDE_MORNINGS',
      payload: hideUntilTime
    });

    if (response.success) {
      state.settings.hideUntilTime = hideUntilTime;
      
      // Update the calendar view
      const tab = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab[0]?.id) {
        chrome.tabs.sendMessage(tab[0].id, {
          type: 'HIDE_MORNINGS',
          payload: hideUntilTime
        });
      }
    }
  }
});

// Initialize popup
loadState(); 