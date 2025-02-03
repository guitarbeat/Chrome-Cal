import { CalendarEvent, ExtensionState, Message, MessageResponse } from './types';

// UI Elements
const elements = {
  ghostingToggle: document.getElementById('ghosting-toggle') as HTMLInputElement,
  hideMornings: document.getElementById('hide-mornings') as HTMLInputElement,
  hideMorningsTime: document.getElementById('hide-mornings-time') as HTMLInputElement,
  energySlider: document.getElementById('energySlider') as HTMLInputElement,
  energyValue: document.getElementById('energyValue') as HTMLDivElement,
  saveButton: document.getElementById('saveButton') as HTMLButtonElement,
  message: document.getElementById('message') as HTMLDivElement
};

// UI Utilities
const ui = {
  // Format energy level with emoji
  formatEnergy: (value: number): string => {
    const emoji = value < 0 ? '🔋' : value > 0 ? '⚡' : '⚖️';
    const sign = value > 0 ? '+' : '';
    return `${emoji} (${sign}${value})`;
  },

  // Show message to user
  showMessage: (text: string, isError = false) => {
    elements.message.textContent = text;
    elements.message.className = isError ? 'error' : 'success';
    setTimeout(() => elements.message.textContent = '', 3000);
  },

  // Update UI for selected event
  updateSelectedEvent: (event: CalendarEvent | null) => {
    if (!event) {
      elements.energySlider.disabled = true;
      elements.energyValue.textContent = 'No event selected';
      return;
    }

    elements.energySlider.disabled = false;
    elements.energySlider.value = event.energy?.toString() || '0';
    elements.energyValue.textContent = ui.formatEnergy(event.energy || 0);
  },

  // Update energy value display
  updateEnergyValue: (value: number) => {
    elements.energyValue.textContent = ui.formatEnergy(value);
  }
};

// State management
const state = {
  selectedEvent: null as CalendarEvent | null,
  
  async load(): Promise<void> {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      // Get extension state
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (!response.success) throw new Error(response.error);

      const extensionState = response.data as ExtensionState;

      // Update UI with state
      elements.ghostingToggle.checked = extensionState.settings.ghostFutureEvents;
      elements.hideMornings.checked = !!extensionState.settings.hideUntilTime;
      elements.hideMorningsTime.value = extensionState.settings.hideUntilTime || '08:00';
      
      // Update selected event if any
      this.selectedEvent = extensionState.selectedEvent;
      ui.updateSelectedEvent(this.selectedEvent);

    } catch (error) {
      ui.showMessage(error instanceof Error ? error.message : 'Failed to load settings', true);
    }
  },

  async save(): Promise<void> {
    try {
      const settings = {
        ghostFutureEvents: elements.ghostingToggle.checked,
        hideUntilTime: elements.hideMornings.checked ? elements.hideMorningsTime.value : undefined
      };

      await chrome.runtime.sendMessage({
        type: 'UPDATE_STATE',
        payload: { settings }
      });

      ui.showMessage('Settings saved successfully');

    } catch (error) {
      ui.showMessage(error instanceof Error ? error.message : 'Failed to save settings', true);
    }
  }
};

// Event handlers
function setupEventListeners(): void {
  // Save button
  elements.saveButton.addEventListener('click', () => state.save());

  // Energy slider
  elements.energySlider.addEventListener('input', (e) => {
    const value = parseInt((e.target as HTMLInputElement).value);
    ui.updateEnergyValue(value);

    if (state.selectedEvent) {
      chrome.runtime.sendMessage({
        type: 'updateEventEmotion',
        payload: {
          eventTitle: state.selectedEvent.title,
          energyLevel: value
        }
      });
    }
  });

  // Hide mornings toggle
  elements.hideMornings.addEventListener('change', () => {
    elements.hideMorningsTime.disabled = !elements.hideMornings.checked;
  });
}

// Initialize popup
async function initialize(): Promise<void> {
  try {
    // Check if we're on a calendar page, if not redirect
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('calendar.google.com')) {
      await chrome.runtime.sendMessage({ type: 'openGoogleCalendar' });
      window.close(); // Close popup after redirecting
      return;
    }

    await state.load();
    setupEventListeners();
  } catch (error) {
    ui.showMessage(error instanceof Error ? error.message : 'Failed to initialize popup', true);
  }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}