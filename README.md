# MyChess

A chess app that runs on your Mac. It has a 3D board and pieces modelled on the Mac's Chess app, a computer opponent you can set to any rating, a **Stockfish-powered coach** that grades every move and explains it in plain words, and four ways to train:

- **Puzzles:** 28 themed lessons and over 14,000 Lichess puzzles, every one checked with Stockfish.
- **Endgames:** drills against Stockfish for the endings every player must know.
- **Theory:** a study plan for your level, all 3,865 Lichess opening lines to learn and practise, and coached games.
- **Play:** games against the computer with the coach watching.

Everything runs locally. The only network use was the one-time download of Stockfish and the opening list, which are now inside this folder.

## Set it up with Claude Code

Open Claude Code in the folder where you keep your projects and paste:

```
Clone https://github.com/automatorsplus/my-chess and set it up on my Mac by following its CLAUDE.md.
```

Claude Code builds the small `MyChess.app` launcher, runs the tests and opens the app. It needs macOS 11 or later and
Apple's Command Line Tools. Everything is built on your own Mac, so macOS doesn't block it as a download from an unknown
developer. To build the launcher by hand instead: `bash tools/launcher/build.sh`.

## Start it

**Double-click `MyChess.app`** (keep it inside this folder). It:

1. starts a small local server on this Mac only (`127.0.0.1`) if one isn't already running, and
2. opens MyChess in its own window. That's a Chrome app window if Chrome is installed, otherwise your default browser.

The server stops by itself about 15 minutes after you close the window. To keep it in your Dock, drag `MyChess.app` onto the Dock. In Chrome you can also choose **Install MyChess** from the address-bar menu.

**The first time** (and after the launcher is rebuilt), if the MyChess folder is inside your Desktop, Documents or Downloads folder, macOS asks whether MyChess may access files there. Choose **Allow**: the server has to read the folder. If you said no, turn MyChess on in System Settings → Privacy & Security → Files and Folders. If the server can't start, MyChess says so; details are in `~/Library/Logs/MyChess.log`. The launcher's source and build script are in `tools/launcher/` (`bash tools/launcher/build.sh`).

Other ways to start it:

```bash
cd MyChess
python3 serve.py          # opens your browser; Ctrl+C to stop
python3 serve.py --app    # opens a Chrome app window
```

If you open `index.html` directly from Finder instead, the game works but Stockfish can't load from a plain file. The coach then uses the weaker built-in engine and tells you so.

## The coach

- **Engine:** Stockfish 19 Lite (WebAssembly). Through the launcher it runs on up to 4 CPU threads. The chip at the top of the panel shows which engine is active.
- **Move grades:** each move is graded from how much of your winning chances it gives away, using the win-chance formula Lichess publishes:

  | Grade | Loss of winning chances |
  |---|---|
  | Best | Matches Stockfish's top choice |
  | Excellent | Under 2 points |
  | Good | Under 5 points |
  | Inaccuracy (?!) | 5 points or more |
  | Mistake (?) | 10 points or more |
  | Blunder (??) | 15 points or more |
  | Book | A known opening move that doesn't lose much |

  Allowing a forced mate always counts as a blunder.
- **Explanations:** built-in rules turn Stockfish's lines into plain sentences. They spot pieces left unprotected, forks, material won or lost, missed or allowed mates, development and castling. Then they tell you the better move and the line that follows.
- **Opening-principle tips:** in the first moves you get tips on things like bringing the queen out early, moving the same piece twice, or delaying castling.
- **Opening names:** all 3,865 named openings from the Lichess opening list, matched by position so different move orders still find the name. Each family comes with a short "main ideas" note.
- **Try again / Show me:** after an inaccuracy, mistake or blunder, take the move back and find a better one. "Show me" also draws the better move as a green arrow.
- **Evaluation bar:** shows who's better, from White's side.
- **Accuracy:** a game percentage for each side.
- **Reviewing earlier moves:** click any move in the move list to read its review again.
- **Hint:** asks Stockfish and draws a blue arrow with a reason.

## Puzzles and lessons

Click **Puzzles** at the top of the panel. Your game in progress is set aside and comes back exactly as it was when you click **Play**.

- **Lessons:** 28 lessons, grouped Beginner → Intermediate → Advanced → Endgame, plus Mixed practice. Each lesson explains the idea and what to look for on the board:
  - **Beginner:** mate in 1, hanging pieces, forks, pins, skewers, back-rank mates, mate in 2, and attacking f7/f2
  - **Intermediate:** discovered attacks, double check, trapped pieces, promotion, removing the defender, sacrifices, deflection, attraction, and smothered mate
  - **Advanced:** in-between moves, quiet moves, clearance, X-ray attacks, interference, mate in 3, and defence
  - **Endgame:** pawn and rook endgames, advanced pawns, and zugzwang
- **How a puzzle works:** your opponent's last move is played first, then it's your turn. The opponent's replies are played automatically. In a mate puzzle, any move that gives checkmate counts.
- **Wrong moves:** the coach asks Stockfish what your move allows and explains it, for example "Rb1 doesn't work: it leaves your queen on b7 attacked by a cheaper piece…". If your move was nearly as good, it says so and lets you try again without a penalty.
- **Hint:** the first press highlights the piece to move; the second shows the move.
- **Show solution:** plays the solution out.
- **Explanations:** when a puzzle ends, the coach walks through the solution move by move (what each move does, what you win) and connects it to the lesson.
- **Puzzle rating:** starts at 1200 and goes up or down after each puzzle. Puzzles are picked near your rating; **Easier**/**Harder** shift the level by 300 points. Using a hint gives half credit.
- **Stats:** solved count, streak, and per-lesson progress are saved in the browser.

The puzzle set was picked from the 6.1 million puzzles in the Lichess database (file of 2026-10-05). It keeps only well-liked, often-played, reliably rated puzzles, balanced across lessons and ratings 400–2900, and each one was replayed to check that every move is legal. To rebuild it from a newer download:

```bash
zstd -dc lichess_db_puzzle.csv.zst | node tools/build-puzzles.js
```

## Endgames

Click **Endgames** for six drills, played against Stockfish: mate with king and queen, mate with king and rook, the Lucena position (winning with rook and pawn), the Philidor position (drawing with rook against rook and pawn), and pawn opposition, to win and to hold. Every move gets a verdict, a comment on technique (the box around the enemy king, the opposition, key squares, the "bridge") and the next step of the plan. The coach never criticises a move that Stockfish rates as best.

## Theory

Click **Theory**. The switcher at the top has three sections: **Plan**, **Openings** (Learn, Practice and Coach) and **Middlegame**.

- **Plan ("Road to 1000")**: a study plan for players around 800–1200. It sets you up with a small repertoire, which you can swap: the Italian Game or London System as White, 1…e5 or the Caro-Kann against 1.e4, and the Queen's Gambit Declined or Slav against 1.d4. Each comes with the traps that come up most at this level, a daily routine (10 puzzles, your due lines, 3 middlegame exercises, one coached game) and a "before every move" checklist. Each part of the repertoire shows a progress bar and the one line to work on next; "All lines and traps" unfolds the full list, with coloured dots for each line: not started, learning, mastered.
- **Learn**: step through any line with ▶ / ◀ (or the arrow keys), or play the moves on the board. For each move the coach says what it does: develops, pins, puts pressure on a defender, offers a pawn, prepares d4, and so on. It also names the opening as it appears, shows Stockfish's evaluation, and says when Stockfish disagrees with the theory. It lists the other moves played at that point, and you can click one to follow it.
- **Practice**: play your side of a line from memory. A different theory move is accepted without penalty, and a wrong move is explained by Stockfish. Lines come back for review on a spaced-repetition schedule: tomorrow after a clean run, then 3, 7, 16 and 35 days; a mistake brings the line back within minutes. A line counts as mastered after four clean runs.
- **Coach**: a coached game. Your opponent plays theory moves from the opening you picked, then Stockfish takes over at the strength you choose. On your turn you see:
  - **Best move** (green arrows): Stockfish's three best moves, with a reason;
  - **Theory** (blue arrows): the book moves and where they lead;
  - **Watch out** (red): your opponent's threat, and any of your pieces left loose;
  - **Chance** (gold): enemy pieces you might win;
  - **Remember**: development, castling and the centre.

  Every move you make is graded. After a mistake the game pauses, so you can take it back.

- **Middlegame**: 15 strategy lessons in three groups.
  - Pieces: improve your worst piece, outposts, centralised knights, open files, doubled rooks, the 7th rank.
  - Pawns: passed pawns, pawn breaks, space, blockade, weak pawns, the minority attack.
  - Kings and trades: luft, attacking on opposite sides, trading when ahead.

  Each lesson explains the idea and gives its rules of thumb, then shows a worked example and gives you exercises: find the move. There are 561 exercises. Every one is a real position, reached from an opening in the library, in which Stockfish's best move is exactly the lesson's idea; see `STRATEGY-AUDIT.md`. A different move that Stockfish rates just as good also counts. Any other move is explained, and you try again. In a coached game, the coach names the middlegame idea when Stockfish's best move is one of them.

The course covers 29 main openings with an overview, plans for both sides and a "good to know" trap. Every other opening family in the Lichess list is there too. Use **Find an opening by name** to search all 3,865 lines.

### How the theory is checked

`THEORY-AUDIT.md` is a report produced by running everything through Stockfish 19 (`node tools/audit-theory.js`):

- every move of the 29 course main lines;
- every move you play in the study plan;
- every trap and claim in the course text;
- all 8,191 theory moves in the library.

`PUZZLE-AUDIT.md` does the same for the puzzles (`node tools/audit-puzzles.js`). Puzzles that Stockfish can't confirm even at depth 22 are left out of the app automatically. `STRATEGY-AUDIT.md` explains how the middlegame exercises were chosen and checked (`node tools/build-strategy.js`).

## The computer opponent

Easy, Medium and Hard follow the Mac Chess strength slider, which limits how many moves ahead the engine looks:

| Level | Search depth | Notes |
|---|---|---|
| Easy | 1 move | Picks at random among near-best moves |
| Medium | 4 moves | — |
| Hard | Up to 10 moves | Stops after 6 seconds |

**Rating** plays Stockfish at the strength you set, from 400 to 3190. From 1320 up, that's Stockfish's own calibrated strength limit. Below 1320 (Stockfish's lowest setting) MyChess shortens the search and mixes in random moves, so those ratings are rough estimates. **Use my puzzle rating** sets the opponent to your puzzle rating. **Adjust after each game** moves it up or down 50 points after a win or a loss.

## Appearance

Under **Appearance & options**:

- **Board** and **Pieces**: wood (like the Mac), walnut, ebony and maple, marble, metal, or a green tournament set.
- **3D pieces**: real 3D Staunton pieces, modelled with three.js and lit like a studio photo.
- **3D view**: tilts the board.
- **Text size**: Normal, Large (the default) or Extra large.

Arrows are colour-coded the same way everywhere: green for Stockfish's moves, blue for theory and hints, red for threats, amber for the last move played.

## Files

| Path | What it does |
|---|---|
| `MyChess.app` | Launcher (starts `serve.py`, opens the window), built by `tools/launcher/build.sh` |
| `serve.py` | Local server. Python standard library only; listens on 127.0.0.1 |
| `index.html`, `css/style.css` | Page and styling |
| `js/core.js` | Chess rules and the built-in opponent engine |
| `js/engine-host.js` | Runs the built-in engine in a background Worker |
| `js/analyzer.js` | Talks to Stockfish (UCI) for the coach, with the built-in fallback |
| `js/coach.js` | Grades, explanations, tips and opening names |
| `js/openings-data.js` | Opening lookup, generated by `tools/build-openings.js` |
| `js/puzzles.js` | Puzzles mode: lessons, puzzle play, rating, and coach explanations |
| `js/puzzles-data.js` | The 14,483 puzzles, generated by `tools/build-puzzles.js` (loaded only when you open Puzzles) |
| `js/puzzles-exclude.js` | Puzzles Stockfish could not confirm, written by `tools/audit-puzzles.js`; Puzzles skips them |
| `js/endgames.js` | Endgames mode: the drills and their coaching |
| `js/theory.js` | Theory mode: the course, the study plan, the move explainer, Learn, Practice and Coach |
| `js/strategy-rules.js`, `js/strategy.js`, `js/strategy-data.js` | Middlegame lessons: the exact rules for each idea, the trainer, and the exercises (built by `tools/build-strategy.js`) |
| `js/theory-data.js` | The 3,865 opening lines as moves, generated by `tools/build-theory.js` (loaded only when you open Theory) |
| `js/textures.js` | Paints the board and piece textures |
| `js/pieces3d.js`, `vendor/three/` | The 3D pieces (three.js, MIT licence) |
| `js/app.js` | Board, input, game flow and the coach panel |
| `engine/` | Stockfish 19 Lite builds plus its licence (`Copying.txt`) |
| `icons/`, `manifest.webmanifest` | App icon and install information |
| `tests/` | `node tests/test-core.js` (rules and engine), `test-coach.js` (coach, using the real Stockfish), `test-puzzles.js` (puzzle set), `test-endgames.js` (drills) and `test-theory.js` (opening lines, explanations, plan, spaced repetition and every trap in the course text) |
| `tools/audit-theory.js`, `tools/audit-puzzles.js` | The Stockfish audits behind `THEORY-AUDIT.md` and `PUZZLE-AUDIT.md` |
| `research/` | Raw results of the two Stockfish audits |

## Credits and licences

- **Stockfish 19** (Stockfish.js by Nathan Rugg / Chess.com, based on the Stockfish team's engine) is GPL-3.0; see `engine/Copying.txt`. Its source code is at [github.com/nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js). If you pass this app on to other people, the GPL applies: share the source and licence along with it.
- **Opening names and lines** come from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), released under CC0 (public domain). The course texts, plans and the study plan are MyChess's own, checked as described above.
- **three.js** (the 3D pieces) is MIT-licensed; see `vendor/three/LICENSE`.
- **Puzzles** come from the [Lichess puzzle database](https://database.lichess.org/#puzzles), released under CC0 (public domain). Each solved puzzle links back to it on Lichess. The lesson texts and explanations are MyChess's own.
- **Board and piece textures** are painted by `js/textures.js`; no images from Apple's Chess app are included.
