# Assets, licensing, and AI assistance

The mission-game concept and requested design come from the user and Batata Warriors. AI coding assistance helped implement, revise, test, and document the software, modeling scripts, interface, and authored guidance. This disclosure covers development assistance; no Azure AI or LLM service is required or intended in gameplay.

The browser's optional speech synthesis reads authored captions. It does not generate mission advice, change the simulation, impersonate an astronaut, or clone a NASA voice. It prefers an installed English voice when available; a browser-selected voice may be provided over a network by the browser/operating system. This is not an application LLM request. Available voices and audibility must be tested on the target browser. Engine and cabin effects are synthesized sound effects; historical audio is identified separately in the asset manifest.

Original project code and original documentation use the repository's MIT license. That license does not relicense downloaded assets, third-party packages, NASA identifiers, or protected marks. `public/assets/credits.json` retains source URLs, credits, adaptation notes, hashes where available, and separate software notices.

| Material | Attribution / rights record |
| --- | --- |
| NASA spacecraft models, Earth/Lunar imagery, historical audio | Per-asset NASA and contributor credits in `credits.json`; [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) |
| Columbia scanned interior/exterior | Smithsonian Institution, National Air and Space Museum, Digitization Program Office; CC0 records in manifest |
| ISS Destiny interior | NASA Astrobee / IGOAL, source repository links in manifest |
| Astronaut mesh | DigitalSpace Corporation, distributed by NASA 3D Resources; adapted first-person mesh with source attribution |
| Grass, concrete and regolith material maps | Poly Haven, CC0; individual asset URLs in manifest |
| Kennedy orthophoto and elevation | USGS / USDA National Map; dataset records in manifest |
| Babylon environment texture | `environmentSpecular.env`, Babylon.js project / BabylonJS Assets, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); stored locally as `studio-light.env` |
| Babylon.js and shader compilers | Apache-2.0 notices retained in `public/assets/shaders/` and dependency packages |
| Modern cockpit geometry, equipment and procedural effects | Original project code; AI-assisted implementation; fictional training reconstruction |

NASA generally permits educational/informational use of its media subject to its guidelines, attribution, and third-party restrictions. NASA identifiers have separate protections; use of a NASA-hosted asset does not imply endorsement or transfer third-party rights. Refer to the linked guidelines and individual asset notices before redistributing or adapting them.

Historical cloud composites remain historical even when a local weather API supplies current conditions. Source imagery, original authored geometry, procedural texture detail and simulated telemetry must not be labeled as live scientific observations. No generated promotional imagery is needed for this build. Actual gameplay screenshots should be labeled as simulation imagery and credited to Batata Warriors; visibly retained source assets keep their own attribution.

The Babylon environment attribution is based on the [BabylonJS Assets repository license statement](https://github.com/BabylonJS/Assets/blob/master/README.md), which applies CC BY 4.0 unless an asset folder specifies otherwise. The [environment file](https://github.com/BabylonJS/Assets/blob/master/core/environments/environmentSpecular.env) is listed in `core/environments`; no separate license override was listed there or in its `core` parent on review, November 15, 2026. The manifest records that source, license, local filename and SHA-256. This is an attribution record for the retained download, not an independent comparison of its bytes against upstream.

Known source-record limits: some manifest entries refer to original downloads and preparation artifacts retained in the earlier project, not included in this runtime checkout. Their provenance records do not establish a complete independent audit of every upstream file.

Runtime visual changes are recorded in `credits.json.runtimeVisualAdaptations`: the modern cabin is original geometry with live displays; the body uses procedural deformation on the credited suit mesh; terrain uses bilinear source heights and reconstructed grass. Cabin selection does not change the propulsion system. Source-era hardware and the optional modernized training cabin must not be represented as a real modern spacecraft configuration.
