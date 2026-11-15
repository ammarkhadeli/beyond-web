# Requirements and verification

This audit distinguishes implemented behavior, observed results and remaining acceptance. It covers the project summary and subsequent clarifications, including the removal of Azure AI/LLM gameplay. Evidence is dated November 15, 2026; see [VALIDATION.md](VALIDATION.md) for reproduction and scope.

| Requirement | Implementation and evidence | Remaining limit |
| --- | --- | --- |
| Browser delivery and GPU engine | TypeScript/React/Vite with Babylon WebGPU and WebGL fallback; production build and real Chromium rendering verified | Measured hardware performance and native WebGPU fault recovery need target-device review |
| Menu and mission planning | Mission/Vehicle/Launch tabs, saved settings, ISS/Moon choices and readiness feedback; interface checks passed | Beginner usability requires unaided playtesting |
| Both complete mission routes | Browser journeys passed from launchpad through physical science, fault recovery, Earth recovery, report export and fresh restart | Scripted assistance, low graphics and accelerated clocks were used |
| Difficulty levels | Cadet/Commander/Expert adjust guidance and margins; beginner guidance/pause interface cases and numerical variants passed | Human difficulty balance is not established |
| Modern vehicle and cockpit | Original training cabin with live displays and fictional trainer exterior; modern/heritage selection checks passed | Cabin choice does not create a new propulsion system; historical/modern configurations are simplified |
| Launch sites | LC39A/LC39B coordinates affect terrain origin, solar direction and weather queries | Infrastructure is reconstructed and reused; not a surveyed current digital twin |
| Consequential payload/resources | Mass, budget, power, equipment and reserves affect readiness and flight; six destination/payload numerical routes passed | Ratings, credits and some thresholds are authored game values |
| Power and launch compatibility | 1,100 W base bus plus optional 150 W backup output; incompatible launcher and overloaded imaging configurations blocked in numerical and interface tests | These are game constraints, not certified vehicle specifications |
| Communications and data choices | Redundant radio changes mass, cost, power and fault cost; science payload changes energy and archived data | No full communications link-budget simulation |
| Continuous launch and orbital motion | Numerical SI integration with finite thrust, fuel, staging, atmosphere and visible time acceleration; route/invariant tests and browser flights passed | Simplified ephemerides, planes, thermal model and guidance |
| Earth, terrain and source assets | NASA imagery/models, USGS terrain and credited material maps; actual browser captures available | Photorealism and scientific visual fidelity are not claimed; vegetation/structures are reconstructed |
| Weather and clouds | Open-Meteo site queries with timeout, freshness checks and labeled fallback; mocked interface/failure tests passed; real API/CORS requests returned HTTP 200 | Model output is not a local observation; visual cloud mapping needs further review |
| Day/night, Sun, Moon and stars | NOAA approximate solar direction and Earth/Moon eclipse calculation; math/scene tests passed | Visual exposure, terminator and eclipse fidelity need human review |
| First-person movement and body | Mouse sensitivity, restraint release, cabin/station/EVA modes and procedural suit deformation; rig checks and browser worksite routes passed | No mocap/finger IK or guaranteed hand contact; animation quality and comfort need review |
| Operable instruments and hatches | Named controls with contextual help and occlusion-aware picking; CPU triangle-ray checks plus full browser science interactions passed | Human aim/click feel remains to be reviewed |
| Audio and captions | Independent voice/effect settings, authored browser speech, synthesized effects and credited historical clips; API-double tests passed and user reported audible sound | Detailed voice/effect output was not verified by muted journey runs |
| HUD, camera and trajectory map | Live instruments, external view, ISS/lunar targets and geometric range; camera/interface checks, map scene tests and captures available | Mobile layout, hardware frame pacing and map usability need review |
| ISS docking and science | Full browser route docked, entered station, completed ordered science/fault tasks and recovered 48 MB with 100% science | Assisted scripted route rather than unaided playtest |
| Lunar landing and science | Full browser route landed, entered EVA, completed science/fault tasks, boarded, ascended and recovered 32 MB with 100% science | Assisted scripted route rather than unaided playtest |
| Failure, abort and restart | Browser ISS prelaunch abort and Expert lunar impact passed with clear reasons, exports and reset; model abort/guidance tests passed | This does not cover every physical failure scenario |
| Repeatable events and crew support | Payload-dependent power/communications/radiation faults; authored Navigator, Engineer and Science officer guidance | Deterministic variation and scripted support; no multiplayer or LLM crewmates |
| Physics education and NASA grounding | Contextual explanations, [source-to-mechanic ledger](SOURCES.md) and asset credits | Simplified calculations and invented balance values remain distinct from NASA facts |
| No Azure AI/LLM gameplay | Deterministic game logic and authored guidance; browser route checks found no model requests | Browser speech providers may independently use network voices |
| AI disclosure and reusable source | Original MIT license, per-asset rights, AI-development record, source-archive packaging and hash-checked asset restoration | Third-party assets retain their own licenses |
| Seven-slide presentation, no video | Exactly seven HTML sections with actual practice captures, source links and scoped validation; printable PDF release path | Captures do not establish performance or human usability |
| Public demo and final submission | Game, seven-slide presentation and source archive published; anonymous browser access and matching downloads verified; submission copy prepared | The separate NASA judging-submission confirmation is still required |
| Mars, multiplayer and unrestricted construction | Longer-term scope | Deferred; not represented as implemented |

## Verified results

- **92 source/model checks passed**: simulation 36, astronaut 5, environment/design 16, planner/settings 6, scene 14, audio 8, navigation 2, guidance 2, lunar-cabin reach 2 and modern-hatch reach 1.
- **Two full browser journeys and two failure/restart cases passed**. Full journeys recorded no application/rendering errors, failed resources or screenshot limitations.
- **21 distinct interface cases passed across final core and targeted runs**. Three native-WebGPU-dependent cases were skipped. This is combined scenario evidence, not a single 24/24 passing report.
- TypeScript and production build checks passed. Actual gameplay captures and real weather API/CORS responses are available. The user separately reported correct cockpit rendering and audible sound.

The full journeys ran in headless full Chromium with SwiftShader WebGL 2, low graphics, scripted UI actions and clock acceleration. They read telemetry/target geometry without injecting mission state. NullEngine tests inspect geometry and raycasts without GPU rendering; audio tests use API doubles. Human usability, hardware acceleration, detailed sound, touch/mobile behavior and measured performance still need independent review. Raw reports and reproduction commands are listed in the validation record.
