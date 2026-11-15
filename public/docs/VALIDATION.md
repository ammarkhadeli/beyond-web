# Validation record

Evidence recorded November 15, 2026. These checks cover the implemented browser game; their limits are stated below.

## Results

| Check | Result |
| --- | --- |
| Source/model tests | **92 passed, 0 failed**: 36 simulation, 5 astronaut, 16 environment/design, 6 planner/settings, 14 scene, 8 audio, 2 navigation, 2 abort guidance, 2 lunar-cabin reach and 1 modern-hatch reach |
| Complete browser journeys | **2 passed**: ISS and Moon, each from launchpad through physical science, fault recovery, Earth recovery, report export and restart |
| Failure and restart | **2 passed**: ISS prelaunch abort and Expert lunar descent impact; clear failure reason, exported report and fresh restart |
| Interface regressions | **21 distinct cases passed** across the final core run and targeted camera rerun; **3 skipped** WebGPU-specific fault-injection cases required an unavailable native adapter |
| Production checks | TypeScript, browser-test TypeScript and Vite production build passed |
| Rendering artifacts | Actual launchpad, ISS practice-approach and lunar practice-descent captures; journey milestone captures also completed |
| Weather access | Real LC39A Open-Meteo HTTP 200 response and separate browser-origin CORS fetch succeeded |

The ISS journey completed 100% science and recovered 48 MB; the Moon journey completed 100% science and recovered 32 MB. Both returned through their normal recovery sequence, exported matching reports, and restarted with cleared mission state. The journey reports contain no captured application/rendering errors, failed runtime resources or screenshot limitations.

Interface checks cover camera controls, real-time launch and pause, contextual instruments, guidance, settings, renderer selection/fallback, planner tabs and readiness gates, cabin selection, weather fallback/races, crew support and the seven-slide presentation. The passing targeted camera rerun used the corrected test-clock synchronization. Results are combined by distinct scenario; this is not a claim that all 24 passed in a single uninterrupted run.

## Scope of the evidence

Browser journeys used full Chromium in headless mode, SwiftShader WebGL 2, low graphics and an 800 × 600 viewport. Scripts operated public UI controls, keyboard and pointer inputs. They read telemetry and target geometry without assigning mission, physics, resource, camera or avatar state. Playwright advanced its clock in 200 ms steps alongside the game's visible time acceleration. Focus-loss pauses were resumed through the normal Resume button. Separate presentation captures used high graphics and label their practice starts.

This verifies assisted scripted routes, not unaided human usability, real-time frame pacing or hardware acceleration. Audio was disabled in the journey checks. The user separately reported a successful browser launch, correct cockpit rendering and audible sound; their browser, renderer and exact settings were not supplied. Detailed voice/effect quality and hardware WebGPU behavior still require target-device review.

Source tests cover numerical invariants, full mission routes, equipment choices, power/budget/launcher constraints, fault and abort behavior, resource use and restart. Scene tests use Babylon NullEngine for geometry and raycasts, including actual shipped lunar-cabin triangles and the repaired modern hatch latch. They do not render pixels or compile GPU shaders. Planner checks use server-rendered markup; audio checks use browser API doubles.

Weather unit tests control fresh, stale, invalid, cancelled and failed responses. The real LC39A service check returned data timestamp `2026-11-15T19:00`; an independent Chromium request returned `{ok:true,status:200,observed:"2026-11-15T19:00",type:"cors"}` without a mocked route. This confirms service and CORS access. It does not validate a meteorological observation or every visual cloud condition.

## Reproduce

Install Node.js 22+, dependencies with `npm ci`, and Playwright Chromium with its required operating-system libraries. Then run:

```sh
npm test
npm run build
./scripts/review-browser.sh
```

The review helper requires Linux and a graphical session by default. The recorded full-Chromium headless run used:

```sh
BEYOND_REVIEW_HEADLESS=1 BEYOND_REVIEW_FULL_CHROMIUM=1 ./scripts/review-browser.sh
```

The helper builds the game, serves a local preview and writes reports/captures to `review-results/`. Its configuration contains 24 interface definitions, three capture cases, two full journeys and two failure cases. The helper uses installed dependencies and retains Chromium's sandbox. Chromium selected SwiftShader in this environment; `BEYOND_REVIEW_SOFTWARE=1` can request it explicitly. Renderer selection and a successful report do not guarantee hardware acceleration.

Maintainer evidence is retained in `.local/final-tests-hatch.log`, `.local/journeys-complete/results.json`, `.local/regressions-final/results.json`, `.local/camera-regression-final/results.json` and `.local/failure-regressions-final/results.json`. Raw review output is excluded from the reusable source archive.

## Remaining acceptance

Play both missions without scripted assistance on the target desktop hardware. Review physical controls, worksite visibility, voice/effects, both cabins, both launch sites and reduced graphics. Measure frame pacing before making performance claims. Native WebGPU fault recovery, touch/mobile usability and scientific visual fidelity remain outside the verified scope. Verify anonymous access to the final game, presentation and source archive after publication. Competition submission requires its own confirmation.
