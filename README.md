# Beyond — Batata Warriors

A browser space-mission game for the NASA Space Apps 2026 **Space Mission Design Game** challenge. Plan a mission, fly to the ISS or Moon, perform science work, manage a fault, and return to Earth. Original project code is MIT licensed; downloaded assets retain their separate credits and rights.

This checkout is the web implementation. It uses **TypeScript, React, Vite, and Babylon.js**, with WebGPU when available and WebGL fallback. NASA, Smithsonian and USGS resources support the simulation and visual context. Guidance is authored; no Azure AI or LLM service runs during gameplay.

## Run

With Node.js 22 or newer and npm installed:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, preferably in a current desktop Chrome or Edge with hardware acceleration. Large 3D assets load on first use. WebGPU requires a supported browser/device and HTTPS or localhost. `?renderer=webgl` explicitly selects the compatibility renderer; `?renderer=webgpu` requires WebGPU and reports failure if it is unavailable.

```sh
npm test
npm run build
npm run preview
```

`dist/` is the static web build. Node.js 22+ and `npm ci` restore dependencies from the checked-in lockfile. Browser review also requires Playwright Chromium and its operating-system dependencies.

For a desktop browser review:

```sh
./scripts/review-browser.sh
```

To reproduce the full-Chromium headless software-rendering review:

```sh
BEYOND_REVIEW_HEADLESS=1 BEYOND_REVIEW_FULL_CHROMIUM=1 BEYOND_REVIEW_SOFTWARE=1 ./scripts/review-browser.sh
```

The script builds the game, starts a local preview and runs interface, capture, journey and failure checks. Reports and screenshots go to `review-results/`. This Linux helper uses installed dependencies; it does not install Chromium. Software rendering verifies browser behavior, not hardware performance.

## Reuse the source archive

Release packaging creates `/source.zip` for the published game. It contains the original source, tests, scripts, configuration, lockfile, documentation and license. Large runtime assets are listed in `asset-manifest.json` with their paths, sizes and SHA-256 hashes; asset credits are included. This is a source archive, not a public repository.

Extract the ZIP, enter its `beyond` directory, and use Node.js 22 or newer. Replace the example URL with the published game's HTTPS base URL:

```sh
node scripts/fetch-assets.mjs https://published-game.example/
npm ci
npm run dev
```

The downloader restores assets into `public/assets`, checks every size and hash, and skips matching files on reruns. It refuses redirects, paths outside that directory, symlink destinations and modified existing assets. Original code is MIT licensed; downloaded assets retain the rights listed in `public/assets/credits.json`.

Release maintainers run `python3 scripts/package-public-source.py` only after the source and assets are final, then rebuild the site so `public/source.zip` is included. `--dry-run` validates inputs without creating the release ZIP; `--output /tmp/beyond-source.zip` creates a review archive elsewhere. Hosting identity, environment files, dependencies, build outputs and review results are excluded.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look around; sensitivity is adjustable |
| E / left click | Operate the highlighted physical control |
| F | Release/secure restraints when safe |
| W/S, A/D | Flight throttle/translation or astronaut movement, depending on mode |
| R/Z | Vertical spacecraft translation on ISS approach |
| Space | Brake spacecraft; lunar jump / float upward when unrestrained |
| Ctrl | Float downward |
| X | Stop station drift using a handrail |
| Shift | Faster astronaut movement |
| N | Toggle approach assistance |
| C | Cockpit/external view |
| M | Trajectory map |
| V | Recenter head position |
| I | Inspect the focused instrument / physics explanation |
| H | Flight guidance |
| [ / ] | Change simulation speed |
| Tab | Release/capture cursor |
| Esc | Pause |

The launch begins at 1× real time. Time acceleration advances the same numerical state and is limited near critical maneuvers. The full lunar route represents days of simulated travel; use time acceleration during safe coasts. A fixed five-to-eight-minute total playtime is not claimed.

At the destination, unstrap and use the hatch. If you abort while outside the spacecraft, guidance and the objective marker direct you back through the hatch before securing the restraints. Complete the ordered physical science tasks, isolate any equipment fault, secure the results, return through the hatch and strap in before departure. Science does not accumulate merely by waiting. Help is authored and deterministic. Optional system speech reads captions; voices and availability depend on the browser. The Navigator, Engineer and Science officer panels provide authored support; they are not LLMs or multiplayer crewmates.

## How the simulation works

The orbital core integrates double-precision position and velocity with bounded RK4 steps. It includes Earth and lunar gravity, finite engine thrust and propellant consumption, atmospheric drag, staging and a rotating atmosphere. Guidance requests forces; phase changes do not generally teleport the vehicle into a new orbit. Landing/docking constrain contact state.

The lunar route includes parking orbit, transfer, capture, descent, surface work, ascent, rendezvous, Earth return, atmospheric entry and recovery. The ISS route includes rendezvous, docking, station work, deorbit and recovery. Equipment and reserve choices change mass and resources; difficulty changes assistance and challenges rather than gravity. Readiness checks enforce launcher/destination compatibility, mass, budget and an authored 1,100 W base power-bus rating; the backup battery adds 150 W of output capacity and additional stored energy. These ratings are game values, not actual spacecraft specifications.

The trajectory map marks the moving ISS and its analytic orbit, or the lunar landing site, and reports direct geometric target separation. Earth/Moon occultation reduces direct sunlight during modeled eclipses; this is an approximate lighting calculation.

This remains a simplified educational simulation: circular analytic ephemerides, reduced orbital-plane geometry, prescribed atmosphere/wind, averaged vehicle performance, simplified heating and guidance. It is not certified mission software. Modern training vehicles and reconstructed cockpits are fictional; historical reference assets do not imply an exact operational replica. Scores, resource percentages and budget credits are game values.

## Evidence, sources, and presentation

Validation on November 15, 2026 established:

- **92 source/model checks passed**, covering flight dynamics, resources, planner constraints, astronaut motion, scene geometry, physical-control reach, navigation, authored guidance and audio API behavior.
- **Both complete browser journeys passed**: launchpad → destination → physical science and fault recovery → Earth recovery → exported report → fresh restart. ISS recovered 48 MB and Moon recovered 32 MB, each with 100% science.
- **Two failure/restart cases passed**: ISS prelaunch abort and an Expert lunar descent impact.
- **21 distinct interface regressions passed across the final core run and a targeted rerun**. Three WebGPU-specific fault-injection cases were skipped because the required adapter was unavailable.
- Production build and TypeScript checks passed. Real weather API and browser-origin CORS requests succeeded. Actual launchpad, ISS approach and lunar descent captures are included in the presentation.

The journeys used scripted UI inputs, low graphics, Playwright clock advancement and visible game time acceleration in full Chromium with SwiftShader WebGL 2. Telemetry and target geometry were read for verification; mission state was not injected. The user separately reported correct cockpit rendering and audible sound. These results do not establish unaided beginner usability, hardware WebGPU behavior, frame rate or detailed audible-output quality. Review both missions manually on the target hardware.

- [Validation scope and reproduction](docs/VALIDATION.md)
- [NASA source → mechanic → learning ledger](docs/SOURCES.md)
- [Challenge alignment and retrieval limits](docs/CHALLENGE-ALIGNMENT.md)
- [Assets and development AI disclosure](docs/ASSETS-AND-AI.md)
- [Machine-readable asset credits](public/assets/credits.json)
- [Requirements and verification audit](docs/REQUIREMENTS-AUDIT.md)
- [Seven-slide presentation](docs/presentation.html), served at `/presentation.html`; printable PDF at `/presentation.pdf`

Original code and documentation are MIT licensed. Asset-specific rights and AI-development assistance are disclosed separately. The project does not claim NASA endorsement, certified mission accuracy, photorealism, live orbital telemetry or measured hardware performance. Competition submission is a separate action; no judging confirmation is represented here.
