# ForensicaLite

A professional digital forensics analysis platform for comprehensive disk examination, file recovery, and security assessment. Built with React, TypeScript, and Vite.

## How It Works

ForensicaLite follows a two-step workflow:

1. **Download & Run the Analyzer** — Download `checkup.exe` from the web app and run it as Administrator on the target Windows system. It performs a deep forensic scan and outputs a structured JSON report.
2. **Upload & Visualize** — Upload the generated JSON file to the web app to view an interactive forensic report with timelines, file explorer, statistics, and suspicious findings.

## Features

- 🔍 **Deep System Scan** — Comprehensive disk analysis including deleted files and hidden data
- 📊 **Visual Analytics** — Interactive charts and timelines for file activity patterns
- ⚠️ **Threat Detection** — Identifies suspicious files and potential security risks
- 🔒 **Secure & Local** — All analysis is performed locally; no data leaves your machine
- 📁 **File Explorer** — Browse and inspect analyzed files with metadata
- 📋 **Case Dashboard** — Manage and compare multiple forensic cases

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment (GitHub Pages)

This project is configured for automatic deployment to GitHub Pages via GitHub Actions.

1. Push to the `main` branch
2. GitHub Actions will build and deploy automatically
3. Site will be live at: `https://<your-username>.github.io/ForensicaLite/`

To set up GitHub Pages:
- Go to **Settings → Pages**
- Set source to **GitHub Actions**

## Project Structure

```
src/
├── components/
│   ├── common/          # Navbar, Footer, FileUpload
│   └── results/         # CasesDashboard, FileExplorer, Statistics,
│                        # Summary, SuspiciousFindings, Timeline
├── context/             # App-wide state (AppContext)
├── pages/               # LandingPage, ResultsPage, AboutPage
├── types/               # TypeScript type definitions
└── utils/               # Data formatters and normalizers
public/
└── checkup.exe          # Forensic analyzer binary
```

## Tech Stack

| Technology | Purpose |
|---|---|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool & dev server |
| Tailwind CSS | Styling |
| React Router v7 | Client-side routing |
| Chart.js + react-chartjs-2 | Data visualization |
| date-fns | Date formatting |
| Lucide React | Icons |

## Legal Disclaimer

ForensicaLite is intended for **legitimate forensic analysis, security assessment, and educational purposes only**. Users must ensure they have proper legal authorization before analyzing any system, device, or data. Unauthorized access to computer systems may violate local, state, and federal laws. The developers are not responsible for any misuse of this software.
