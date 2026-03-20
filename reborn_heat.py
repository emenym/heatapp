from reborn.app import app, init_reborn
from reborn.config import PORT


if __name__ == "__main__":
    init_reborn()
    app.run(host="0.0.0.0", port=PORT, debug=False)
