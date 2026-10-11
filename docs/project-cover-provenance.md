# Project cover provenance

Generated 7 October 2026 using the built-in `image_gen` tool in generation mode: one distinct prompt per project. The aerial cover received one targeted native edit to remove keyboard legends. No external stock photographs or project evidence were used as generation inputs.

These are **AI-generated concept illustrations**, not photographs of the built systems, measured results, validated schematics or certifications. They are intended for homepage and project-list cards; the real photographs, diagrams and reviewed videos remain unchanged in the project evidence. Keep a visible “Concept illustration” label when presenting these covers.

## Shared direction and delivery

Graphite studio scenes, matte charcoal objects, restrained mint/cyan accents, an elevated three-quarter view and a consistent 3:2 composition. The ten concepts represent the current projects in [content/cms/projects](../content/cms/projects/). Generic hardware and abstract interfaces communicate the engineering idea without claiming to reproduce the historical enclosure or screen exactly. No words, identifiable records, logos or numerical measurements are intentionally embedded.

[project-covers.json](../src/data/project-covers.json) maps every project slug to its main image, responsive source set, dimensions, descriptive alternative text and `concept: true`. Each cover has a 960×640 and 480×320 WebP in [the cover directory](../public/assets/project-covers/). Native 1536×1024 PNG sources are retained privately and excluded from Git/deployment. The original tool outputs were left intact.

Only resizing and metadata-free WebP encoding used Sharp 0.35.5: quality 82 for 960px, quality 80 for 480px, effort 6. No Python image editing, compositing or programmatic illustration drawing was used. All ten native outputs were visually inspected; dimensions, format, source coverage and derivative metadata were validated. All ten final 480px versions were visually inspected after encoding; the concepts remain legible and the selected aerial keyboard is unlabelled.

## Concepts and fit

| Project | Visual concept | Why it fits | 960px / 480px |
| --- | --- | --- | --- |
| Industrial Alarm Monitoring | Input board, controller, operator status display and physical controls | Represents the documented alarm-input and operator-interface integration; the enclosure and abstract status display are illustrative. | 42.8 / 14.2 KiB |
| Fire & Smoke Vision Prototype | Camera, controller and contained flame/smoke region | Reflects the camera-to-processing-to-interface prototype without implying certified fire detection or measured accuracy. | 18.8 / 6.4 KiB |
| Embedded QR Scanning Appliance | Camera-equipped terminal, abstract code tag and local server | Represents scanning a product document and retrieving or updating its manufacturing record. | 29.3 / 9.9 KiB |
| Offline RFID Attendance | Blank card, reader, local time display and USB storage | Reflects local card events, clock handling and offline record export without personal information. | 21.6 / 6.5 KiB |
| Networked Polling Terminals | Five terminals, central reporting and local buffer block | Reflects the documented five-terminal client/server system, local buffering and later synchronization. | 21.4 / 7.2 KiB |
| Object Detection & Tracking on Zynq | Camera, generic programmable-logic board and processing stages | Represents the undergraduate image-processing and hardware-integration workflow without board-accurate or performance claims. | 31.4 / 9.5 KiB |
| Aerial Object Tracking | Desktop display, ordinary road traffic and consecutive frame panes | Keeps the project grounded in prerecorded civilian traffic analysis; it does not imply an aircraft or live flight-control system. | 46.8 / 14.8 KiB |
| Industrial DataGraph | Sensor modules, controller, physical controls and graph | Represents sensor acquisition and graphical display; the trace has no units or numerical values and is not experimental data. | 26.2 / 8.5 KiB |
| RFID Food Reservation Terminal | Blank card, reader, four status panels and local server | Reflects the reserved, unreserved, delivered and completed workflow without identifying cardholders or meal records. | 22.9 / 8.5 KiB |
| Two-Line Caller ID | Two input lines, serial adapter, event display and file symbol | Represents serial caller events, customer lookup and call logging with abstract placeholders rather than real contacts. | 23.8 / 8.6 KiB |

Combined payload of all 20 derivatives: 379.0 KiB. Browsers should select one responsive size per card rather than requesting both.

## Exact prompt set

The industrial-alarm prompt is reproduced in full. Every other initial prompt is the shared prefix, followed by its project subject block, followed by the shared suffix, with no additional reference image.

### Industrial alarm: full prompt

```text
Use case: stylized-concept.
Asset type: professional engineering portfolio project cover, landscape 3:2 composition.
Create one polished semi-real 3D editorial technical concept illustration, one coherent scene, not a collage. Shared family art direction: graphite dark studio backdrop, matte charcoal technical objects, restrained mint signal accents, very subtle cyan secondary rim light, orthographic three-quarter elevated viewpoint, elegant soft studio lighting, grounded contact shadows, clear primary silhouette readable on a small portfolio card. Sophisticated engineering design, minimal visual clutter, balanced negative margins. Do not add a floor grid or decorative particles.
Subject: an industrial alarm monitoring system. A compact unbranded embedded controller with a custom input board and orderly rows of input connector terminals sits beside a modest desktop operator display. Several discreet mint-lit signal paths lead from the input connectors through the controller toward the screen. The screen shows only a clean abstract matrix of status cells and one gently accented alarm cell, with no labels. Include two small physical acknowledge/reset push buttons. Suggest local record storage with a small simple storage module, not a cloud.
Composition: controller and input board foreground, operator screen slightly behind, all at the same restrained three-quarter angle; system fills about 70 percent of frame, generous dark clear edges.
Evidence boundary: this is a conceptual illustration of an existing portfolio project, not a product photograph, measured result, circuit schematic, or certification.
Absolutely no embedded text, words, letters, numerals, logos, branding, watermark, faces, personal records or performance statistics. No giant futuristic holograms.
```

### Shared prefix for the other nine

```text
Use case: stylized-concept.
Asset type: professional engineering portfolio project cover, landscape 3:2 composition.
Create one polished semi-real 3D editorial technical concept illustration, one coherent scene, not a collage. Shared family art direction: graphite dark studio backdrop, matte charcoal technical objects, restrained mint signal accents, very subtle cyan secondary rim light, orthographic three-quarter elevated viewpoint, elegant soft studio lighting, grounded contact shadows, clear primary silhouette readable on a small portfolio card. Sophisticated engineering design, minimal visual clutter, balanced negative margins. Do not add a floor grid or decorative particles.
```

### Shared suffix for the other nine

```text

Composition: one coherent system scene at the same restrained three-quarter angle; system fills about 70 percent of frame, generous dark clear edges. Match an elegant charcoal embedded-engineering product concept series.
Evidence boundary: this is a conceptual illustration of an existing portfolio project, not a product photograph, measured result, circuit schematic, or certification.
Absolutely no embedded text, words, letters, numerals, labels, logos, branding, watermark, faces, personal records or performance statistics. No giant futuristic holograms.
```

### Fire & Smoke Vision Prototype: subject block

```text
Subject: a fire and smoke computer-vision prototype. A small unbranded camera module on the left faces a very small contained flame with a wisp of smoke, presented as a restrained amber input scene. Beside it sit a compact embedded controller and a small desktop display. On the display, one abstract camera image of the tiny flame is surrounded by a subtle mint rectangular candidate-region outline, alongside a few clean unlabelled status blocks. A discreet connection routes camera to controller to display; a tiny antenna on controller suggests device messaging. The warm flame is a small secondary accent within the otherwise graphite-and-mint palette. Do not depict a building fire, emergency rescue, people, dramatic danger, safety certification, or claimed detection accuracy.
```

### Embedded QR Scanning Appliance: subject block

```text
Subject: an embedded QR scanning appliance for a manufacturing workflow. A compact unbranded angled touchscreen terminal has a small camera scanner below it, facing a plain manufactured-part tag printed with a small abstract square geometric code pattern. The touchscreen shows only neat unlabelled record blocks, a single highlighted mint block and simple completion shapes. A small minimal server module beside the terminal suggests local record lookup, linked by a subtle mint signal path. Keep the geometric code decorative and nonfunctional; do not add words or numbers to tag, screen or device. It must look like a practical engineering appliance concept, not a retail cashier.
```

### Offline RFID Attendance: subject block

```text
Subject: an offline RFID attendance system. A plain unmarked card hovers slightly above a compact card reader connected to a modest embedded terminal. A small mint light on the reader suggests the card event. The terminal's screen has a simple unlabelled clock face with hands but absolutely no numbers, plus a few clean abstract local event rows. A modest USB flash drive beside the terminal suggests local record export. A short discreet signal connection between reader and terminal, no network cloud. No human figures, fingerprints, facial recognition, names, card identifiers or numbers. The focus is card event, local time and local storage.
```

### Networked Polling Terminals: subject block

```text
Subject: networked polling terminals with local buffering and server synchronization. Show five compact unbranded tabletop input terminals arranged in a gentle foreground arc, each with a small clean unlabelled screen and simple physical choice buttons. Discreet orderly mint connection paths lead toward a single central server-and-desktop pair slightly behind them. Near one terminal a very small stack of plain data blocks suggests local buffering before reconnection. Server display contains only an abstract bar summary without labels, numbers or percentages. This is a practical client/server engineering concept, with no election flags, ballot boxes, people, voting certifications, or security claims. Keep precisely five foreground input terminals visually distinct from the rear server and desktop display.
```

### Object Detection & Tracking on Zynq: subject block

```text
Subject: FPGA-based object detection and tracking in an undergraduate embedded-vision project. A compact unbranded programmable-logic development board with one prominent square chip is foreground, connected to a small camera module and modest desktop display. The display shows a simple mint-colored geometric object against a charcoal camera scene, with a thin mint rectangular region around it and a few subtle abstract processing blocks along one edge. A restrained layered path of three small translucent data-plane shapes suggests image processing through the board, kept low and close to the hardware rather than giant holograms. The board must be generic: no brand text, chip markings, labels or actual circuit diagram. No speed, accuracy or performance readouts.
```

### Aerial Object Tracking: subject block

```text
Subject: desktop computer vision processing prerecorded overhead road traffic footage. A single polished charcoal desktop workstation display is the main object, showing a stylized top-down civilian road junction with a few simple ordinary passenger cars. A thin mint rectangular tracking outline surrounds one car, with two restrained offset frame panes behind the main image to suggest recorded video sequence analysis. A small neutral storage module and tidy input device sit beside the screen. The perspective is three-quarter elevated view of the desktop display, not a real aerial photograph. This is a benign offline software prototype concept, no live flight-control system. Absolutely no drones, aircraft, military equipment, weapons, soldiers, targeting reticles, crosshairs, surveillance faces, license-plate text or accuracy numbers. Keep the ordinary traffic scene abstract, sparse and calm.
```

### Industrial DataGraph: subject block

```text
Subject: industrial sensor acquisition and graphical display. Two small unbranded sensor circuit modules feed into a compact master controller through tidy physical connections with very subtle mint accents. The master has a modest wide monochrome graphical LCD and a small row of physical buttons. On the screen show a simple restrained mint line trace on an otherwise blank dark display, no axes, scale, labels, units or numerical readings; it is a visual shorthand for a graph, not measured data. One probe cable and subtle circuit components communicate acquisition hardware. Compact practical electronics, no factory background, no wireless cloud or invented distance claims.
```

### RFID Food Reservation Terminal: subject block

```text
Subject: an RFID food-reservation terminal. A blank unmarked card is presented above a compact reader beside an angled unbranded embedded touchscreen, connected discreetly to a small local server module. The screen clearly shows exactly four large simple unlabelled rectangular state blocks in a two-by-two arrangement, one mint-accented and the other three subdued, suggesting reserved, unreserved, delivered and completed states without any words. A very small plain meal tray with a covered dish in the background hints at the meal-service context without becoming the main object. No people, names, photographs, card identifiers, numbers, payment amounts or personal meal-account records. This is a reservation workflow concept, not a restaurant marketing scene.
```

### Two-Line Caller ID: subject block

```text
Subject: a two-line caller identification desktop application. Exactly two incoming telephone cables enter a compact unbranded serial interface adapter in the foreground, then one tidy connection goes to a charcoal desktop monitor. The two input paths have subtle mint and muted cyan accents so the dual-line idea is clear. On the screen, two simple unlabelled incoming-event cards sit above clean abstract table rows, with one neutral generic head-and-shoulders silhouette icon represented only by circles and shapes. A very small plain file block beside the interface suggests spreadsheet call-log storage. Do not show any real person, profile photo, name, phone number, contact data or text. Avoid a keyboard; keep the two cable inputs, adapter and clean desktop interface as the main composition.
```

### Aerial cover: precise edit

The initial aerial result included keyboard legends. The built-in tool edited that viewed local output with this prompt; the resulting blank-key version is the selected source.

```text
Use case: precise-object-edit. Refine this generated concept illustration with exactly one small change: remove every printed symbol, letter, numeral and legend from every keyboard key, leaving clean blank matte charcoal keycaps. Preserve the keyboard geometry, the entire workstation, camera viewpoint, lighting, graphite/mint palette, road traffic image, abstract tracking rectangle, all other objects and the full 3:2 framing unchanged. Do not add text, logos or labels anywhere. This remains a concept illustration of benign prerecorded civilian road-traffic analysis.
```

## Selected native tool outputs

These output basenames and SHA-256 digests identify the selected source artifacts without exposing workstation paths. The private source receipt also records every public derivative digest and size.

| Project slug | Native tool output | SHA-256 |
| --- | --- | --- |
| `industrial-alarm-monitoring` | `exec-ad8f1b9d-df63-41d1-9e86-2a0d33c7721a.png` | `225dd27f036d5cde1b74ef11b9256c8cc6598e877b0204a47bc260dba036cb8a` |
| `fire-smoke-vision` | `exec-70c6aabc-4c9e-46de-95a7-16d92a9ae93f.png` | `d61b4f6b9042cb2cc02dc57644b41b77a0a2baec4b3c99eb052fce380fed7119` |
| `embedded-qr-scanner` | `exec-41d04832-ffcc-4bc1-bdb3-bfcbc4ef9363.png` | `1909a1a9d8724a0a3932dfb961593e04c443b95050c41dc5557d0daf79520781` |
| `rfid-attendance` | `exec-f63a6906-ccde-4c35-8971-47a5ee50a74a.png` | `65bc3aae9548825e07f7d233f7c0a279623481114139eff28f9e5f5e51365617` |
| `networked-polling` | `exec-b68c7ec3-0bee-4da6-b076-1dabac15c312.png` | `e8cafe5241ae5896feaddc104c2a38cc099c4676e9dd47b09275e8b6f29a3d86` |
| `zynq-object-detection` | `exec-c3ec4107-8b39-4ffd-bb40-7719ac1b3cbd.png` | `2d7f2678309d321f239b6bb20b92a05c5d3f06d4440b7aaf609a9ab7dff56e8d` |
| `aerial-object-tracking` | `exec-d1058dc2-16b1-4292-9677-a3613ec632a0.png` | `093410b09ae6c57c5d72ec40348c7fdae57532dfa065e35b74a640b803bb41de` |
| `industrial-data-graph` | `exec-ee4b5fd3-75eb-498f-81e4-05b5c99d6042.png` | `82311be8390570c3eaabbf9d951dc50626adebd9e6538d73a16bfb03539b8f49` |
| `food-reservation-system` | `exec-7fba273e-02d5-4810-89e2-fe14da231f14.png` | `d68f266b8d9070cf906944f28383153c12d38428076207d6008398bf11256f5f` |
| `two-line-caller-id` | `exec-9f5c87f3-70b3-4da0-8c96-f781eb6c1fdb.png` | `f31c483b42c8977b1be2b55f497781f35075c85a943acf0b9616a51ec2321174` |

The earlier aerial candidate was `exec-c15fcfab-b565-4307-9eb4-931a0107b223.png`; it was not used for the public derivatives.
