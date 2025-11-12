from flask import Flask, render_template
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Labels for the 5x5 bingo board (kept here so server can send them to clients)
labels = [
    "Someone drops their VK",
    "Someone falls over",
    "Someone gets ID’d",
    "Someone loses their jacket",
    "Someone bumps into their ex",

    "Mirror selfies in the toilet",
    "Someone cries in the bathroom",
    "Someone starts chanting",
    "Someone says \"shots!\"",
    "Someone gets denied entry",

    "Someone spills their drink",
    "New best friend in smoking area",
    "\u201cThis is my song!\u201d",
    "Someone is barefoot",
    "Someone disappears for 30 mins",

    "Card gets declined",
    "\u201cI\'ve got a 9am tomorrow\u201d",
    "Orders water",
    "Gets takeaway mid-night",
    "Drops their phone",

    "Wearing a society hoodie",
    "Lost their voice",
    "Filming a TikTok",
    "Forgets student card",
    "\u201cYou\'re my best friend\u201d",
]

# Server-side board state (True = active/marked). New clients receive this on connect.
board_state = [False] * len(labels)
# Track per-index, per-user color: {index: {user_id: color_hex}}
board_colors = {i: {} for i in range(len(labels))}


@app.route("/")
def index():
    return render_template("index.html")


@socketio.on('connect')
def handle_connect():
    # Send current labels, board state, and per-index colors to the connecting client
    emit('init', {
        'labels': labels,
        'state': board_state,
        'colors': board_colors  # {index: {user_id: color_hex}}
    })


@socketio.on('toggle')
def handle_toggle(data):
    # Expect data: {'index': <int>, 'user_id': <str>, 'color': <hex_color>}
    try:
        idx = int(data.get('index'))
        user_id = data.get('user_id')
        color = data.get('color', '#ff66cc')  # default to pink if not provided
    except Exception:
        return
    if 0 <= idx < len(board_state):
        # Flip state and broadcast update to all clients
        board_state[idx] = not board_state[idx]
        
        # Track color: if toggling on, store the color; if toggling off, remove it
        if board_state[idx]:
            board_colors[idx][user_id] = color
        else:
            board_colors[idx].pop(user_id, None)
        
        # Broadcast update with color information
        socketio.emit('update', {
            'index': idx,
            'state': board_state[idx],
            'colors': board_colors[idx]  # {user_id: color}
        })

@socketio.on('force_refresh')
def handle_force_refresh():
    """Emit the current board state to all connected clients so they can sync in-place.

    This avoids a full page reload and preserves UI state smoothly across clients.
    """
    socketio.emit('sync', {
        'labels': labels,
        'state': board_state,
        'colors': board_colors
    })


@socketio.on('request_init')
def handle_request_init():
    """Client can request the current board state (returns only to requester)."""
    emit('init', {
        'labels': labels,
        'state': board_state,
        'colors': board_colors
    })


if __name__ == "__main__":
    # Use socketio.run so Flask-SocketIO starts the appropriate async worker (eventlet/gevent)
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)