# Space Mission Design Game alignment

Checked November 15, 2026. The exact [2026 challenge URL](https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/) returned HTTP 502 through the research tool; it was tried with and without the trailing slash. The challenge summary was available in the official site's [About the Challenge text](https://www.spaceappschallenge.org/2026/find-a-team/missionforge/). Detailed objectives and resource links were available on the [HackAthlone local organizer's copy](https://hackathlone.com/challenges/space-mission-design-game). This is not a claim that the complete official page was retrieved.

The core task is an interactive game covering mission design, management, simulation, limited resources, consequential engineering choices and evaluation. The organizer's detailed copy emphasizes visible trade-offs and learning why choices change outcomes. Its suggestions include configuration, mission scenarios, resource displays, difficulty, mission reports, and optional collaboration for up to four people. The considerations are explicitly optional. AI/LLM integration and photorealistic graphics are not stated requirements in the retrieved text.

Our implementation priorities derived from that task are:

1. A chosen science objective determines work to perform, not just a destination label.
2. The planner exposes mass, budget, power and fuel effects before flight.
3. Readiness checks prevent launching incompatible configurations.
4. Launch, destination operations and Earth recovery form one mission.
5. Manual work, faults and resource use change the result.
6. A debrief explains the outcome and makes another design worth trying.
7. Controls, short guidance and optional physics explanations support learning.

These priorities are our interpretation of the challenge, not additional competition rules. The user's visual, cockpit, audio, weather and full-mission requirements remain part of the project scope.

The retrieved resource list names NASA's mission-design webinar, GMAT, JPL Concept Maturity Levels, Goddard Mission Design Lab, NASA Mission Viz, a telescope-design learning game, CubeSat 101, the 2023 VR visualization challenge, and CSA digital activities. The game does not embed GMAT or NASA Mission Viz; do not claim it does. Actual source-to-mechanic use is recorded in [SOURCES.md](SOURCES.md).

Latest user direction excludes Azure AI and all LLM gameplay integration. Use deterministic guidance and authored explanations. Development-time AI assistance remains disclosed in [ASSETS-AND-AI.md](ASSETS-AND-AI.md).
