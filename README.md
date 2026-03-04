# 📈 MutualFund Research App

> 🚀 **Live Demo:** Access the fully functional, zero-setup dashboard instantly:
> **[https://amank27.github.io/MutualFund-Research-App/](https://amank27.github.io/MutualFund-Research-App/)**

---

A bespoke, zero-backend financial tool for tracking stable hybrid and equity mutual funds — with advanced metrics like CAGR, Volatility, and Sharpe Ratios, running directly in your browser.

[![License](https://img.shields.io/badge/license-Private-red.svg)]()
[![Status](https://img.shields.io/badge/status-MVP-blue.svg)]()
[![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JS-yellow.svg)]()

---

## 🎯 Project Vision

This application is designed to be a **personal mutual fund research workbench** — a powerful, fast, and privacy-first tool that lets you:

- 🔍 **Search** any Indian mutual fund using a natural language name-based search with real-time autocomplete.
- 📊 **Analyse** performance with CAGR (1Y/3Y/5Y/Max), Volatility (σ), and real-time Sharpe Ratios.
- 📈 **Visualise** NAV history with interactive, zoomable Chart.js instances.
- 📋 **Compare** funds side-by-side using the built-in dynamic comparison module.
- 💼 **Track Portfolio** with secure, Firebase Auth & Firestore-backed personal persistence.
- 📱 **Mobile Handoff** seamlessly transfer your session to your mobile device via QR integration.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Browser (Client)                     │
│                                                        │
│  ┌────────────┐  ┌───────────┐  ┌─────────────────┐    │
│  │ index.html │  │ Chart.js  │  │ Firebase SDK    │    │
│  │ (JS/CSS)   │  │ (Visuals) │  │ (Auth & Store)  │    │
│  └──────┬─────┘  └─────┬─────┘  └───────┬─────────┘    │
│         │              │                │              │
└─────────┼──────────────┼────────────────┼──────────────┘
          │              │                │
          ▼              │                ▼
 ┌────────────────┐      │       ┌────────────────┐
 │ CORS Proxy     │◄─────┘       │ Google servers │
 │ (Cloudflare/   │              │ (Firestore)    │
 │  CORS.sh)      │              └────────────────┘
 └───────┬────────┘
         │
         ▼
┌──────────────────┐
│ mfapi.in / AMFI  │
│ (Live Data API)  │
└──────────────────┘
```

### Key Technologies
- **Structure**: HTML5, Semantic DOM architecture.
- **Styling**: Vanilla CSS, extensive CSS Variables, deep glassmorphism aesthetics.
- **Logic**: Vanilla ES6+ JavaScript.
- **Charts**: Chart.js v4.4.1 paired with the `date-fns` time adapter.
- **Data Sourcery**:
  - Live NAVs dynamically requested from `mfapi.in` (without generic scheme codes).
  - Categorized categorization parsing fetched directly from **AMFI** through a robust CORS proxy (fully replacing legacy mock data structures).
- **Client-Side Math Engine**: XIRR, rolling compound calculations, active SIP interpolations running offline.
- **State & Identity**: Firebase Authentication for login handling and Cloud Firestore to store long-term user portfolio data securely.
- **CI/CD Pipeline**: fully automated synchronization pipeline bridging the private development repository cleanly directly to public GitHub Pages deployment.

---

## 🚀 Access (Zero-Setup Dashboard)

The MutualFund Research App is designed entirely around a **cloud-hosted, zero-friction experience**. There are **no servers to start**, **no Node.js packages to install**, and **no local build steps required**.

Simply open the live URL on any modern desktop or mobile browser.

👉 **[https://amank27.github.io/MutualFund-Research-App/](https://amank27.github.io/MutualFund-Research-App/)**

*(Note: Attempting to run this app locally via `file://` or standard `localhost` servers may result in immediate CORS policy restrictions specifically regarding the live AMFI data endpoints. The GitHub Pages deployment securely handles proxy domains.)*

---

## 📂 Project Structure

```
MutualFund Research App/
├── index.html          # Main HTML entrypoint
├── css/
│   └── styles.css      # Extracted styling and glassmorphism UI variables
├── js/
│   ├── app.js          # Core logic, state management, and orchestration
│   ├── api.js          # Network requests (AMFI, Groww, etc.)
│   └── utils.js        # Math and formatting helper functions
├── README.md           # This architecture summary
├── package.json        # Dependencies tracking (Metadata mapping)
└── changelog/          # Iterative version notes and history
```

---

## 📄 License & Restrictions

This is a private repository structure linked defensively to outward public hosting.
All intellectual and structural rights are reserved. Do not clone, distribute, or run standalone without explicit authorization.
