# Skylark Archipelago — Island Bush-Plane Flying

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/melatim80186/makefun-best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/melatim80186/makefun-best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**[▶ Play the entry — make.fun bounty page](https://make.fun/bounty/best-flight-game-20261126-0057)**

An original bush-plane flight game for the make.fun contest **"Make the best flight game"** ($500 pot, top 50 share it). Built in one session, from scratch, in plain HTML/JS on a 2D canvas — no libraries, no network requests, no copied art, names, or music. The sky, the sea, the islands, the aircraft and every sound are drawn and synthesised by this code.

## How to play

Open `game/index.html` in desktop Chrome (or serve `game/` with any static server) and pick a mission.

**Fly:** `↑` `↓` pitch · `←` `→` bank · `W` / `S` throttle · `G` gear · `P` pause · `M` mute · `R` restart

1. **Ring Run** — take off from Merpati Field, climb to the coast, and thread eight golden rings over the islands. A pass through the middle pays a bonus. Full throttle drinks the fuel; a flat-out run can run dry.
2. **Island Hop** — three strips, three landings: Gagak Strip, Koral Beach, then home. Land gently — under 110 knots, gear down, sink under 7 m/s — or it counts as a crash.
3. **Storm Cargo** — medicine for Koral, straight through the storm cells. The cells shake the airframe apart, so thread between them or climb over them.

The HUD is the cockpit: airspeed and altitude tapes, a compass strip, an attitude ball, throttle / fuel / damage bars, a live minimap, and a flight-path marker. The attitude ball, the tapes and the minimap are lit instruments, not decoration — fly by them on a cloudy final.

## What is in the box

- `game/index.html` — the page; everything else is a file under `game/`
- `game/src/config.js` — every tuning number the flight model, world and renderer agree on
- `game/src/random.js` — the seeded RNG and the smooth value noise the terrain is built from
- `game/src/world.js` — the islands, the terrain height, the airstrips, the clouds
- `game/src/flight.js` — the flight model: speed, climb, stall, fuel, damage, landings, crashes
- `game/src/render.js` — the renderer: golden-hour sky, sea, terrain, strips, rings, aircraft
- `game/src/hud.js` — the HUD: tapes, compass, attitude ball, fuel, minimap, warnings
- `game/src/audio.js` — the sound: engine, wind and chimes, all synthesised in WebAudio
- `game/src/missions.js` — the missions: goals, progress, scoring
- `game/src/input.js` — keyboard and mouse input
- `game/src/shots.js` — the deterministic `?shot=` poses the four hand-in screenshots were taken from
- `game/src/main.js` — the game itself: loop, menu, pause, crash, results
- `screenshots/` — four real renders of the game's own code: cover, ring, landing, results

## Verified in this session

Played end-to-end in headless Chrome: takeoff from Merpati Field (roll, rotate, climb), a ring pass (+100), a full landing on the strip (+50 touchdown, rollout), a terrain crash into Gagak Ridge, and the storm-cell damage path. Zero console errors, zero network requests.

## License

MIT — see `LICENSE`.
