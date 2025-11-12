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


@app.route("/")
def index():
    return render_template("index.html")


@socketio.on('connect')
def handle_connect():
    # Send current labels and board state to the connecting client
    emit('init', {'labels': labels, 'state': board_state})


@socketio.on('toggle')
def handle_toggle(data):
    # Expect data: {'index': <int>}
    try:
        idx = int(data.get('index'))
    except Exception:
        return
    if 0 <= idx < len(board_state):
        # Flip state and broadcast update to all clients
        board_state[idx] = not board_state[idx]
        socketio.emit('update', {'index': idx, 'state': board_state[idx]}, broadcast=True)


if __name__ == "__main__":
    # Use socketio.run so Flask-SocketIO starts the appropriate async worker (eventlet/gevent)
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)