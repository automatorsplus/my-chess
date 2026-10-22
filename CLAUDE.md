# Setting up MyChess

You are setting up MyChess, a chess trainer that runs on the user's Mac: a 3D board, a computer opponent, a
Stockfish coach, puzzles, endgames and opening theory. It is a web app served from this folder by a small local server,
with a tiny `MyChess.app` launcher. Work through the steps in order. Tell the user in one line what each step is doing.
Don't change the source code unless something fails, and then change as little as possible and say what you changed.

## 1. Check the Mac and the folder

- `sw_vers -productVersion` must be 11 or higher.
- `xcode-select -p` must print a path. If it fails, run `xcode-select --install`, ask the user to click **Install** in
  the dialog, and wait until they say it has finished. It provides `clang` and `python3`.
- `python3 --version` must work.
- **MyChess runs from this folder, so it has to stay where it is.** If the folder is somewhere temporary, ask the user
  where they'd like to keep it and move it there before building.

## 2. Build the launcher

```sh
bash tools/launcher/build.sh
```

It prints `Built and signed …/MyChess.app`.

## 3. Run the tests, if Node is installed

If `node --version` works:

```sh
node tests/test-core.js     # prints: All tests passed
node tests/test-coach.js    # prints: All coach tests passed
```

If Node isn't installed, skip this step. Don't install Node just for the tests; the app doesn't need it.

## 4. Check the server

```sh
python3 serve.py --no-browser --port 8971 --idle-exit 30 &
sleep 2
curl -sI http://127.0.0.1:8971/engine/stockfish-19-lite.wasm | head -5
kill %1
```

The reply must be `200` with `Content-Type: application/wasm`. If port 8971 is busy, use another one between 8972 and
8990.

## 5. Open it

```sh
open MyChess.app
```

It starts the server and opens MyChess in a Chrome app window if Chrome is installed, otherwise in the default browser.
If the folder is inside Desktop, Documents or Downloads, macOS asks whether MyChess may access it the first time: tell
the user to click **Allow**.

## 6. Hand over

Tell the user, briefly:

- Double-click `MyChess.app` to start it, and keep it inside this folder. Drag it onto the Dock to keep it there.
- The server stops by itself about 15 minutes after the window is closed.
- **Play** against the computer at any rating from 400 to 3190, with the coach grading each move. **Puzzles**,
  **Endgames** and **Theory** are the training modes.
- Everything runs on their Mac; nothing goes online.

The README has the rest, including the credits and licences.
