# Presentation

The public demo is [the seven-slide PDF](https://beyond-batata-warriors.khadeliabdullah.chatgpt.site/presentation.pdf). The separate final-project link is [the playable game](https://beyond-batata-warriors.khadeliabdullah.chatgpt.site/). Source code is published in [ammarkhadeli/beyond-web](https://github.com/ammarkhadeli/beyond-web).

The deck follows the [official Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), dated November 13, 2026 and read on November 16. It contains exactly seven English slides, including the title. Team names were checked against the public team's Members tab: Ammar Khadeli and Abdullah Khadeli. The selected challenge is Space Mission Design Game.

| Slide | Content |
| --- | --- |
| 1 | Project, team name, both members, selected challenge and real cockpit image |
| 2 | Learning problem, intended audience and actual mission planner |
| 3 | Implemented engineering trade-off: power readiness versus battery mass and cost |
| 4 | ISS and Moon gameplay images, science tasks and return requirement |
| 5 | Specific NASA resources connected to their use in the game |
| 6 | Implementation, recorded validation and development-time AI disclosure |
| 7 | Public game, GitHub source, PDF link, current scope and next steps |

The numeric example on slide 3 was checked by calling `evaluatePlan` with an ISS imaging payload, extra fuel, standard communications, no shielding, and the orbital launcher. Without the backup battery: 2,420 kg, 1,140 W demand, 1,100 W capacity, 75 credits, not ready. With it: 2,550 kg, 1,250 W capacity, 84 credits, ready. These are authored game values, not NASA spacecraft specifications.

Validation figures describe the recorded runs in [VALIDATION.md](VALIDATION.md); they do not claim measured learning outcomes or hardware performance. Screenshots are actual simulation captures with [asset credits](../public/presentation-assets/CREDITS.md). No presentation slogan is used. Full source attribution and AI-development acknowledgements remain in the project documentation and metadata.

## Edit and export

Edit `public/presentation.html`. With dependencies installed and Playwright Chromium available, run:

```sh
npx playwright install chromium
node scripts/export-presentation.mjs
```

The script checks seven slides, image loading and text bounds, synchronizes the editable `docs/presentation.html` copy, and exports `public/presentation.pdf`. Review images and a layout report are written to `.local/presentation-review/`. Rebuild the site after export. The HTML and PDF contain absolute public links so downloads do not depend on local file paths.

The presentation is a project demo. It does not submit the team's NASA project page or establish judging eligibility.
