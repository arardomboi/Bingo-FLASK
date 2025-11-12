// Socket.IO will be loaded via CDN before this script
const socket = io();

// Create a button element for an item with accessibility attributes
function makeButton(label, index, active) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.dataset.index = index;
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  if (active) btn.classList.add('active');
  btn.addEventListener('click', () => {
    // Ask server to toggle — server will broadcast the update to everyone
    socket.emit('toggle', { index: index });
  });
  return btn;
}

// Render full board from labels/state arrays
function renderBoard(labels, state) {
  const board = document.querySelector('.board');
  board.innerHTML = '';
  labels.forEach((label, i) => {
    board.appendChild(makeButton(label, i, !!state[i]));
  });
  // keep focus behavior predictable on mobile
  board.scrollTop = 0;
}

// On initial connection the server will send the current board
socket.on('init', data => {
  renderBoard(data.labels, data.state);
});

// When any client toggles a square, server broadcasts 'update'
socket.on('update', data => {
  const idx = data.index;
  const state = !!data.state;
  const btn = document.querySelector(`button[data-index="${idx}"]`);
  if (btn) {
    btn.classList.toggle('active', state);
    btn.setAttribute('aria-pressed', state ? 'true' : 'false');
  } else {
    // If button doesn't exist (rare), re-request full board
    socket.emit('request_init');
  }
});

// Listen for server-initiated sync command and update the board in-place
socket.on('sync', data => {
  // Smoothly update UI to match server state without reloading
  // Optionally could add transition or highlight effect here
  renderBoard(data.labels, data.state);
});

// Wire up the force-refresh button, if present in the DOM
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('force-refresh');
  if (btn) {
    btn.addEventListener('click', () => {
      // Ask server to broadcast a refresh to all clients
      socket.emit('force_refresh');
      // Provide immediate feedback to the clicker
      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 300);
    });
  }
});
