# Meridian Heat

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/yiyirosilah0/gta6-game-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/yiyirosilah0/gta6-game-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original top-down open-world crime game in the sun-soaked city of Meridian Bay, built for make.fun's [Make GTA 6](https://make.fun/bounty/gta6-01) bounty. You are Rook, a driver for hire: steal cars, lose the cops, run the jobs, and own the streets — all in a desktop browser, offline, from static files.

## The game

Meridian Bay is a seeded open world: an 8×6 street grid with ~100 buildings, parks, the Docks container yard, a beach and the sea, a safehouse, a warehouse, a hospital and Police HQ. Explore it on foot and by car, with traffic that keeps to its lanes, pedestrians who flee trouble, and police who respond to your wanted level.

- **Driving and stealing** — arcade car handling with a following camera; press E next to a parked or traffic car to steal it (the driver bails), cop cars can't be stolen.
- **Wanted level** — 0 to 5 stars. Stealing, punching and running over pedestrians raise it; it decays once the police lose sight of you. Cop cars chase and ram; foot cops chase, punch and arrest.
- **Missions and story** — a three-mission arc (Hot Wheels, The Package, Lose the Heat), then repeatable courier jobs across the city, all paying cash.
- **Combat** — punch on foot (F), ram with your car; player and car health, wrecked cars, health regen when clean.
- **HUD and minimap** — cash, health, the in-game clock, wanted stars, an objective bar, a live minimap with roads, cops and the mission marker, and a speedometer with car health while driving.
- **Save and sound** — cash and mission progress save to localStorage (New Game / Continue on the title screen); every sound is synthesized with WebAudio — engine hum, a two-tone siren, pickup blips, punch and crash noise, mission jingles (M mutes).

## How to run

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network requests, no libraries — the game is plain static files under `game/`.

## Controls

- **WASD / arrows** — walk and drive (Shift to run on foot)
- **E** — enter / exit a car
- **F** — punch
- **P** — pause
- **M** — mute
- **Enter** — start / continue

## About this entry

Built for the [Make GTA 6](https://make.fun/bounty/gta6-01) bounty on [make.fun](https://make.fun). The city, characters, vehicles, story, art, sounds and music are all original — nothing from Rockstar Games or any other commercial game.

*Built with [make.fun](https://make.fun) — referral code `ss8k9qwc`.*
