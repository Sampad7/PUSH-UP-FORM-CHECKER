# Push-Up Form Checker

A browser-based pushup form coach that uses real-time pose tracking to count reps and flag form breakdowns — no app install, no account, and no video ever leaves your browser.

**Live demo:** [push-up-form-checker-two.vercel.app](https://push-up-form-checker-two.vercel.app)

## What it does

Upload a video of your pushup set and the app will:

- **Track your pose** frame-by-frame using on-device pose landmark detection
- **Count reps** by watching your elbow angle move through a full range of motion
- **Flag form breakdowns** — sagging hips, piking hips, and reps that don't reach full depth or full lockout — right on the video as they happen
- **Log every issue with a timestamp**, so you can click straight to the moment it happened instead of scrubbing through the whole clip
- **Summarize the set** at the end: total reps, good reps, and reps that need work

Everything runs client-side in the browser. Your video is processed locally and is never uploaded to a server.

## Form checklist

Each rep is scored against three checks:

| Check | Threshold |
|---|---|
| Full range of motion | Elbow angle drops below ~95° |
| Straight body line | Hips stay in line with the shoulder–ankle line (no sag or pike) |
| Full lockout | Elbow angle extends past ~155° at the top |

## Getting started

This is a static site with no build step or dependencies to install.

```bash
git clone https://github.com/Sampad7/PUSH-UP-FORM-CHECKER.git
cd PUSH-UP-FORM-CHECKER
```

Then serve the folder with any static file server, for example:

```bash
npx serve .
```

or the VS Code "Live Server" extension, and open the printed local URL. Opening `index.html` directly via `file://` may block the pose model from loading in some browsers, so a local server is recommended.

## How to use it

1. Open the app and click **Choose Video**
2. Select a pushup video, ideally filmed from the side so your shoulder, elbow, wrist, hip, and ankle are all visible in frame
3. Press **Play / Pause** to run the analysis
4. Watch the rep counter, checklist, and on-screen callouts update live
5. Click any entry in the **Issues Log** to jump straight to that moment in the video
6. Use **Reset Session** to clear stats and **New Video** to analyze a different clip

## Tech stack

- Vanilla **HTML / CSS / JavaScript** — no framework, no build tooling
- **Pose landmark detection** running fully in-browser for real-time body tracking
- Deployed on **Vercel**

## Project structure

```
.
├── index.html      # App markup and layout
├── index.css       # Styling
├── index.js        # Pose detection, rep-counting logic, and UI updates
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── LICENSE
```

## Limitations

- This is a heuristic form coach, not a physio or certified trainer — use your own judgment and stop if anything hurts.
- Accuracy depends on camera angle, lighting, and how much of your body is visible in frame; side-on framing works best.
- Angle thresholds are tuned for a general case and may need adjusting for different camera setups.

## Contributing

Issues and pull requests are welcome. Please see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing, and [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## License

Released under the [MIT License](LICENSE).
