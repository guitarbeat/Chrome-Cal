/**
 * @file Popup UI Script
 * @module popup
 * @description Handles popup UI interactions and state synchronization
 * @author Your Name
 * @version 1.0.0
 */

import { Message } from "./types";

/**
 * Safely get DOM element with error handling
 * @param id - Element ID
 * @throws Error if element not found
 */
function safeGetElement<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element ${id} not found`);
    return el as T;
}

// Get elements with null checks
const ghostFutureEventsCheckbox = safeGetElement<HTMLInputElement>('ghostFutureEvents');
const ghostOpacitySlider = safeGetElement<HTMLInputElement>('ghostOpacity');
const opacityValueSpan = safeGetElement<HTMLSpanElement>('opacityValue');
const toggleEventGhostButton = safeGetElement<HTMLButtonElement>('toggleEventGhost');
const selectedEventTitleSpan = safeGetElement<HTMLSpanElement>('selectedEventTitle');
const ghostedEventsList = safeGetElement<HTMLDivElement>('ghostedEvents');

/**
 * Load initial state from storage
 */
function loadInitialState() {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Connection error:', chrome.runtime.lastError);
            return;
        }

        if (response?.success) {
            const state = response.data;
            ghostFutureEventsCheckbox.checked = state.settings.ghostFutureEvents ?? false;
            ghostOpacitySlider.value = String(state.settings.ghostEventOpacity ?? 50);
            opacityValueSpan.textContent = `${state.settings.ghostEventOpacity}%`;

            if (state.selectedEvent?.title) {
                selectedEventTitleSpan.textContent = state.selectedEvent.title;
                toggleEventGhostButton.disabled = false;
            } else {
                selectedEventTitleSpan.textContent = 'None';
                toggleEventGhostButton.disabled = true;
            }

            updateGhostedEventsList(state.settings.ghostedEvents ?? []);
        }
    });
}

// Update ghost future events
ghostFutureEventsCheckbox.addEventListener('change', () => {
    chrome.runtime.sendMessage({
        type: 'TOGGLE_GHOST',
        payload: ghostFutureEventsCheckbox.checked
    });
});

// Update opacity
ghostOpacitySlider.addEventListener('input', () => {
    const opacity = parseInt(ghostOpacitySlider.value);
    opacityValueSpan.textContent = `${opacity}%`;
    chrome.runtime.sendMessage({
        type: 'UPDATE_GHOST_OPACITY',
        payload: opacity
    });
});

// Toggle ghosting for selected event
toggleEventGhostButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Connection error:', chrome.runtime.lastError);
            return;
        }

        if (response?.success && response.data?.selectedEvent) {
            const eventTitle = response.data.selectedEvent.title;
            chrome.runtime.sendMessage({
                type: 'TOGGLE_EVENT_GHOST',
                payload: { eventTitle }
            });
        }
    });
});

// Enhanced event list updating
function updateGhostedEventsList(events: string[]) {
    ghostedEventsList.innerHTML = '';

    if (events.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'No ghosted events';
        ghostedEventsList.appendChild(emptyState);
        return;
    }

    const list = document.createElement('ul');
    events.forEach(eventTitle => {
        const li = document.createElement('li');
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = eventTitle;
        
        const removeButton = document.createElement('button');
        removeButton.className = 'button-primary';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({
                type: 'TOGGLE_EVENT_GHOST',
                payload: { eventTitle }
            });
        });

        li.append(titleSpan, removeButton);
        list.appendChild(li);
    });

    ghostedEventsList.appendChild(list);
}

// Initialize after DOM load
document.addEventListener('DOMContentLoaded', () => {
    loadInitialState();
    
    // Add debounced resize handler
    let resizeTimeout: number;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 100);
    });
});

// Update message listener with error handling
chrome.runtime.onMessage.addListener((message: Message) => {
    if (!message) return;

    if (message.type === 'UPDATE_STATE') {
        const state = message.payload;
        if (state?.settings) {
            ghostFutureEventsCheckbox.checked = state.settings.ghostFutureEvents ?? false;
            ghostOpacitySlider.value = String(state.settings.ghostEventOpacity ?? 50);
            opacityValueSpan.textContent = `${state.settings.ghostEventOpacity}%`;
            updateGhostedEventsList(state.settings.ghostedEvents ?? []);
        }
        if (state?.selectedEvent?.title) {
            selectedEventTitleSpan.textContent = state.selectedEvent.title;
            toggleEventGhostButton.disabled = false;
        } else {
            selectedEventTitleSpan.textContent = 'None';
            toggleEventGhostButton.disabled = true;
        }
    }
}); 