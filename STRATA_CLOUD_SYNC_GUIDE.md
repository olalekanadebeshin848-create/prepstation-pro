# ☁️ PrepStation Pro — Strata Cloud Sync & Auto-Detection System

> **Cross-Platform**: Fully compatible with both **Expo Mobile (Android/iOS)** and **Electron Desktop (Windows/Mac/Linux)**.

---

## 1. Will Google Drive Be a Good Idea?

### ❌ Short Answer: **No, Google Drive is NOT recommended for automated app downloads.**

Here is why Google Drive creates major issues for apps:

| Issue | What Happens on Google Drive | What Happens on GitHub / Supabase / CDN |
| :--- | :--- | :--- |
| **Direct File Downloads** | Google Drive does **not** give direct raw file URLs. A link like `drive.google.com/file/d/ID/view` returns an **HTML web page**, not raw JSON or `.psz` bytes. | Direct raw URLs (e.g. `raw.githubusercontent.com/...`) return the exact raw file bytes immediately. |
| **Virus Scan Warning Page** | For files over ~25MB or binary `.psz` files, Google triggers an interstitial HTML prompt: *"Google Drive cannot scan this file for viruses. Download anyway?"*. Your app's automated `fetch()` cannot click this button and downloads corrupted HTML instead. | Direct download stream without warning pages. |
| **CORS Policy (Desktop & Web)** | Google Drive blocks Cross-Origin Resource Sharing (CORS). Requests from React Native Web (Electron desktop) will fail with CORS security errors. | Full CORS enabled. Electron and mobile download smoothly. |
| **Rate Limits & Bandwidth Quotas** | When 20–50 students download at the same time in a class, Google Drive returns `HTTP 403 / 429: Download quota exceeded for this file`. | Unlimited public downloads via high-speed global CDN. |
| **Automated New File Detection** | Detecting "new files in a Drive folder" requires setting up a Google Cloud Project, Google Drive API v3, and embedding private service account keys inside the app (security vulnerability). | A single public `strata_catalog.json` manifest allows instant detection with zero secret keys needed. |

---

## 2. What Is The Recommended Platform?

### 🌟 Option A (Top Recommendation — 100% Free & Zero Server Setup): **GitHub Repository / GitHub Releases**
- **Cost**: 100% Free forever.
- **CDN**: Backed by Fastly global CDN.
- **Raw URL**: `https://raw.githubusercontent.com/<YOUR_USERNAME>/<YOUR_REPO>/main/strata/<FILE_NAME>`
- **Workflow**: 
  1. Create a repository on GitHub (e.g., `prepstation-strata`).
  2. Put your `.json` or `.psz` files into a `strata/` folder.
  3. Whenever you have a new strata file, upload it and add one entry to `strata_catalog.json`.
  4. Done! Every mobile phone and desktop computer detects it immediately.

### 🌟 Option B (Top Recommendation for Beautiful Web Admin UI): **Supabase Storage**
- **Cost**: Free tier gives 1GB storage + 50,000 monthly active users.
- **Workflow**:
  1. Open the Supabase web dashboard in your browser.
  2. Drag and drop `.psz` or `.json` files into a public bucket named `strata-files`.
  3. Copy the public URL into your catalog.
  4. Instant real-time detection via REST API.

---

## 3. How the Auto-Detection System Works

The app uses a **Catalog Manifest** (`strata_catalog.json`).

Whenever the student opens the app or navigates to the **Strata Cloud Hub**, the app:
1. Fetches `strata_catalog.json` from the cloud.
2. Compares each online item with what is currently installed in `AsyncStorage` (`examStrataMap`).
3. Automatically marks each strata with a status:
   - **✨ NEW**: Strata is online but not yet installed on this student's device.
   - **🔄 UPDATE**: A newer version or revised question set has been released.
   - **✓ INSTALLED**: Already installed and up to date.
4. Shows badge counters per class/category: e.g. `SS 1 (1 NEW)`, `WAEC (2 NEW)`.

---

## 4. The Manifest Schema (`strata_catalog.json`)

Here is the exact schema used by the system (a template is already placed at the root of your project: `strata_catalog.json`):

```json
{
  "catalogVersion": 1,
  "appName": "PrepStation Pro",
  "lastUpdated": "2026-10-12T12:00:00Z",
  "strataList": [
    {
      "id": "ss1_elephant_stg1",
      "strataId": "strata_1",
      "examCategory": "SS 1",
      "displayName": "SS 1 Literature: Once Upon an Elephant — Stage 1",
      "description": "Dramatic text mastery covering Acts 1-3. Background, characters, and structural questions.",
      "tier": "basic",
      "version": "1.0.0",
      "fileType": "json",
      "fileUrl": "https://raw.githubusercontent.com/delmama/prepstation-strata/main/strata/SS%201%20ONCE%20UPON%20AN%20ELEPHANT%20stg%201.json",
      "size": "142 KB",
      "totalBundles": 10,
      "totalQuestions": 200,
      "updatedAt": "2026-10-10T10:00:00Z"
    },
    {
      "id": "ss1_elephant_stg2",
      "strataId": "strata_2",
      "examCategory": "SS 1",
      "displayName": "SS 1 Literature: Once Upon an Elephant — Stage 2",
      "description": "Stage 2 analytical bundles: climax, falling action, themes, and WAEC/NECO questions.",
      "tier": "basic",
      "version": "1.0.0",
      "fileType": "json",
      "fileUrl": "https://raw.githubusercontent.com/delmama/prepstation-strata/main/strata/SS%201%20ONCE%20UPON%20AN%20ELEPHANT%20stg%202.json",
      "size": "144 KB",
      "totalBundles": 10,
      "totalQuestions": 200,
      "updatedAt": "2026-10-12T12:00:00Z"
    }
  ]
}
```

---

---

## 6. How Filtering Works: Premium vs Basic Users

You asked:
> *"How do I filter users to Premium and Basic so only Premium users are able to download and sync Premium strata even though all users see the available new update or release?"*

### 👁️ Visibility: Visible to Everyone (Generates Excitement & Urgency)
- **All users** (both Basic and Premium) see the complete catalog of strata releases.
- Each strata card displays clear visual tags:
  - `⭐ BASIC FREE`: Free curriculum, visible & downloadable by all students.
  - `👑 PREMIUM`: Exclusive, gold-badged mock exams, past papers, and advanced bundles.
- This ensures Basic users always see what new releases exist, creating desire to upgrade!

### 🔒 Access Gate: Basic Free vs Premium Locked
1. **For Basic Strata (`"tier": "basic"` in catalog)**:
   - Any user on any device can tap **"Download & Install ⚡"** without restrictions.
   - Files download and import directly into the app state in seconds.

2. **For Premium Strata (`"tier": "premium"` in catalog)**:
   - If the user is **Activated / Premium**:
     - The download button is active: **"Download & Install ⚡"**.
     - Downloads and installs immediately.
   - If the user is **Basic (Not Activated)**:
     - The download button displays **"Unlock Premium Strata 🔒"**.
     - Tapping this button **instantly opens the Premium Unlock Modal** with:
       1. **Hardware Credentials Display**: Shows their unique `Device ID` (`SP-XXXX-XXXX-XXXX`) and `Device License Code` with a 1-tap **"📋 Copy Credentials"** button.
       2. **In-Place Activation Key Input**: If the user was given a PIN/key by their vendor, they can paste it right into the modal and tap **"Activate & Unlock Strata ⚡"** — the app immediately verifies the key, upgrades them to Premium, and downloads the strata automatically!
       3. **WhatsApp Vendor Contact Button**: Tapping **"💬 Request Key via WhatsApp"** opens WhatsApp directly to `+2349135912668` with their Device ID and requested strata pre-filled!

3. **In Batch Sync ("⚡ Sync All New Strata")**:
   - If a Basic user taps "Sync All", the app automatically downloads all new **Basic** strata, while safely skipping Premium packages.
   - The app gives feedback: *"Synced X Basic Strata! Y Premium packages were skipped (Activation required). Tap any Premium card to unlock."*

---

## 7. Easy Navigation Throughout the App

The app has been wired with frictionless, multi-point navigation:
1. **Top Header Toolbar**: Tap the **☁️** icon next to the dark-mode button from anywhere on the home screen.
2. **Main Dashboard**: Prominent **"☁️ Strata Download & Sync Hub"** action card with animated `AUTO-DETECT` badge.
3. **Category-Linked Quick Navigation**:
   - When on any category tab on Home (e.g. `SS 1` or `WAEC`), a quick link appears:
     *"☁️ Looking for more SS 1 Strata files? Browse Cloud Hub →"*
   - Tapping this opens the Cloud Hub **already filtered to SS 1**!
4. **Inside the Strata Cloud Hub**:
   - **← Home Button**: Takes you right back to practice, automatically reloading newly installed strata.
   - **Tier Filter Tabs**: One-tap toggle between `ALL TIERS`, `⭐ BASIC FREE`, and `👑 PREMIUM`.
   - **Category Filter Chips**: Scrollable chips for `ALL`, `WAEC`, `JAMB`, `NECO`, `SS 1`, `SS 2`, `SS 3`, etc. with badge counters showing how many new files exist in each category.
   - **Search Bar**: Instant keyword filtering across titles, novel names, and topics.

