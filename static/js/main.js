// Socket.IO will be loaded via CDN before this script
const socket = io();

// Track toggles initiated by this client so we can distinguish local vs remote updates
const pendingToggles = new Set();

// User color and ID (picked on first visit)
let userColor = localStorage.getItem('userColor') || null;
let userId = localStorage.getItem('userId') || 'user_' + Math.random().toString(36).substr(2, 9);

// Store user ID and color if not already stored
if (!localStorage.getItem('userId')) {
  localStorage.setItem('userId', userId);
}

// Track board colors so we can colorize buttons correctly
let boardColors = {};

// Create a button element for an item with accessibility attributes
function makeButton(label, index, active, colors) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.dataset.index = index;
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  
  // Apply active state and colors
  if (active) {
    btn.classList.add('active');
    // Apply the color of the first user who toggled this (or mix if multiple)
    applyButtonColor(btn, colors);
  }
  
  btn.addEventListener('click', () => {
    // Ensure user has picked a color before allowing toggle
    if (!userColor) {
      showColorPicker();
      return;
    }
    
    // Mark this index as pending for this client so when the server echoes the
    // update back we don't treat it as a remote change.
    pendingToggles.add(index);
    // Safety: clear pending mark after 5s in case the server response is lost
    setTimeout(() => pendingToggles.delete(index), 5000);
    // Ask server to toggle — server will broadcast the update to everyone
    socket.emit('toggle', { index: index, user_id: userId, color: userColor });
  });
  return btn;
}

// Apply color to a button based on who activated it
function applyButtonColor(btn, colors) {
  // colors is {user_id: color_hex}
  if (!colors || Object.keys(colors).length === 0) {
    // No colors: reset to default styling
    btn.style.backgroundColor = '';
    btn.style.color = '#ffffff'; // reset text to white
    btn.classList.remove('has-color');
    return;
  }
  
  // Get the first color (could implement gradient for multiple users later)
  const firstColor = Object.values(colors)[0];
  if (firstColor) {
    btn.style.backgroundColor = firstColor;
    btn.classList.add('has-color');
    
    // Calculate perceived brightness and set text color for readability
    const textColor = getContrastColor(firstColor);
    btn.style.color = textColor;
  }
}

// Calculate if text should be white or black for readability on a background color
function getContrastColor(hexColor) {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert hex to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate perceived brightness using luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return white text for dark colors, black text for light colors
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Render full board from labels/state arrays
function renderBoard(labels, state, colors) {
  const board = document.querySelector('.board');
  board.innerHTML = '';

  // Store colors globally
  if (colors) boardColors = colors;

  labels.forEach((label, i) => {
    const btnColors = colors && colors[i] ? colors[i] : {};
    const btn = makeButton(label, i, !!state[i], btnColors);
    board.appendChild(btn);
    // Fit the text after layout (use RAF to ensure dimensions are calculated)
    requestAnimationFrame(() => fitTextToButton(btn));
  });

  // keep focus behavior predictable on mobile
  board.scrollTop = 0;
}

// Adjust a button's font-size so its text stays fully inside the box.
// Reduces font-size in 1px steps from computed size until it fits, but
// doesn't go below a sensible minimum.
function fitTextToButton(btn) {
  if (!btn) return;
  // Reset any inline font-size to allow CSS clamps to apply first
  btn.style.fontSize = '';
  const computed = window.getComputedStyle(btn);
  let fontSize = parseFloat(computed.fontSize) || 12;
  const minSize = 7; // px — don't make text unreadably small

  // If content already fits, we're done
  if (btn.scrollHeight <= btn.clientHeight && btn.scrollWidth <= btn.clientWidth) return;

  // Reduce font-size until content fits or we hit the minimum
  while ((btn.scrollHeight > btn.clientHeight || btn.scrollWidth > btn.clientWidth) && fontSize > minSize) {
    fontSize -= 1;
    btn.style.fontSize = fontSize + 'px';
  }
}

// Simple debounce utility for resize events
function debounce(fn, wait) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// On window resize, re-fit all buttons after a short debounce
window.addEventListener('resize', debounce(() => {
  document.querySelectorAll('.board button').forEach(fitTextToButton);
}, 120));

// On initial connection the server will send the current board
socket.on('init', data => {
  // If user hasn't picked a color yet, show the modal
  if (!userColor) {
    showColorPicker();
  }
  renderBoard(data.labels, data.state, data.colors);
});

// When any client toggles a square, server broadcasts 'update'
socket.on('update', data => {
  const idx = data.index;
  const state = !!data.state;
  const colors = data.colors || {};  // {user_id: color_hex}
  const btn = document.querySelector(`button[data-index="${idx}"]`);
  
  if (btn) {
    // Update board colors globally
    boardColors[idx] = colors;
    
    // If this client initiated the toggle, don't show the remote pulse.
    const isLocal = pendingToggles.has(idx);
    if (isLocal) {
      // Local: simply apply state and color, then clear pending mark.
      btn.classList.toggle('active', state);
      btn.setAttribute('aria-pressed', state ? 'true' : 'false');
      applyButtonColor(btn, colors);
      pendingToggles.delete(idx);
    } else {
      // Remote: apply state, color, and if it became active, animate an edge pulse to notify user.
      btn.classList.toggle('active', state);
      btn.setAttribute('aria-pressed', state ? 'true' : 'false');
      applyButtonColor(btn, colors);
      if (state) {
        btn.classList.add('pulse');
        // Remove pulse class after animation completes (match CSS duration ~700ms)
        setTimeout(() => btn.classList.remove('pulse'), 800);
      }
    }
  } else {
    // If button doesn't exist (rare), re-request full board
    socket.emit('request_init');
  }
});

// Listen for server-initiated sync command and update the board in-place
socket.on('sync', data => {
  // Smoothly update UI to match server state without reloading
  renderBoard(data.labels, data.state, data.colors);
});

// Show the color picker modal
function showColorPicker() {
  const modal = document.getElementById('color-picker-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

// Hide the color picker modal
function hideColorPicker() {
  const modal = document.getElementById('color-picker-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  // Show the minimized color picker button
  const btn = document.getElementById('color-picker-button');
  if (btn) {
    btn.style.display = 'block';
    btn.style.backgroundColor = userColor;
    btn.style.color = getContrastColor(userColor);
  }
}

// Wire up the color picker modal
document.addEventListener('DOMContentLoaded', () => {
  // Set up color options
  const colorOptions = document.querySelectorAll('.color-option');
  colorOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      userColor = btn.dataset.color;
      localStorage.setItem('userColor', userColor);
      
      // Hide modal and show minimized button
      hideColorPicker();
    });
  });
  
  // Set up color picker button (to reopen modal)
  const pickerBtn = document.getElementById('color-picker-button');
  if (pickerBtn) {
    pickerBtn.addEventListener('click', () => {
      showColorPicker();
      pickerBtn.style.display = 'none';
    });
    
    // If user already has a color, show the button and hide the modal
    if (userColor) {
      hideColorPicker();
    }
  }
  
  // Set up force-refresh button
  const syncBtn = document.getElementById('force-refresh');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      // Ask server to broadcast a refresh to all clients
      socket.emit('force_refresh');
      // Provide immediate feedback to the clicker
      syncBtn.classList.add('active');
      setTimeout(() => syncBtn.classList.remove('active'), 300);
    });
  }
});
