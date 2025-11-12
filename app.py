from flask import Flask, render_template
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Labels for the 5x5 bingo board (kept here so server can send them to clients)
labels = [
    "Someone drops their drink", #row1, top left
    "Someone falls over",
    "Someone throws up",
    "Gets kicked out",
    "Some sort of conflict",

    "Mirror selfies in the toilet", #row2
    "Bump into people you know",
    "Someone starts chanting",
    "Someone says \"shots!\"",
    "Matching outfits",

    "\u201cI'm so drunk\u201d", #row3
    "Old person",
    "FREE SQUARE", #MIDDLE SQUARE
    "Someone makes out",
    "Someone dances w another",

    "Apple Bottom Jeans plays", #row4
    "\u201cI\'ve got a 9am tomorrow\u201d", #BELOW NEED CHANGEING
    "Orders water",
    "Gets takeaway mid-night",
    "Drops their phone",

    "Wearing a society hoodie", #row5
    "Lost their voice",
    "Filming a TikTok",
    "Forgets student card",
    "\u201cYou\'re my best friend\u201d", # bottom right
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
        # If the box is already claimed by other users, block attempts from different users
        # Allow the original claimer(s) to toggle (so they can unclaim)
        existing_users = board_colors.get(idx, {})
        if existing_users and (user_id not in existing_users):
            # Inform only the requester that their attempt was blocked
            emit('blocked', {
                'index': idx,
                'message': 'Box already claimed by another colour'
            })
            return

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