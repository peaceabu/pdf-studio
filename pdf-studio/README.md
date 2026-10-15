# PDF Studio — React Native PDF reader & editor for Android

A fully offline Android app built with **React Native (Expo SDK 54, RN 0.81)** that lets you read, annotate, sign and organize PDF files.

## Features

| Area | What you can do |
|---|---|
| **Read** | Smooth native rendering (PDFium), pinch-zoom, vertical or horizontal (book) mode, page badge + "go to page", password-protected PDFs, remembers last page |
| **Annotate / Edit page** | Freehand draw & **sign**, highlight, add text (4 sizes, 8 colours, multi-line), rectangles, **whiteout** (cover existing text, then type new text over it), place images (signature/stamp/logo) |
| **Organize pages** | Select pages, rotate left/right, move, duplicate, insert blank page, delete, extract to new PDF |
| **Document tools** | Merge PDFs, append PDF, images → PDF, append images as pages, page numbers, diagonal watermark, edit title/author/subject/keywords, rename |
| **Files** | Open from the file picker or "Open with → PDF Studio" from any app, library of recent documents, **Undo** (15 steps, versions stored on disk), share, save to any folder (Downloads, Drive…) |

All editing is done on-device with [`pdf-lib`](https://pdf-lib.js.org); annotations are flattened into the page content, so they show up in every PDF reader.

## Project structure

```
App.tsx                      navigation stack, back button, "Open with" intents
src/
  screens/HomeScreen.tsx     library + Open / Merge / Images→PDF / Blank
  screens/ViewerScreen.tsx   reader, toolbar, tools sheet, share/save/undo
  screens/EditPageScreen.tsx drawing canvas (PanResponder + SVG overlay)
  screens/PagesScreen.tsx    page organizer
  pdf/ops.ts                 every PDF operation (pdf-lib)
  pdf/coords.ts              screen ↔ PDF coordinate mapping (handles rotated pages & crop boxes)
  storage/library.ts         on-device library, versions/undo, export
  components/ui.tsx          header, buttons, prompt modal, action sheet
  pickers.ts                 PDF / image pickers
```

## Get the APK — option A: GitHub Actions (no local setup)

1. Create a new GitHub repository and push this folder to it (`main` branch).
2. Open the repo's **Actions** tab → **Build Android APK** runs automatically (or press *Run workflow*).
3. After ~10–15 minutes, download **PDF-Studio-apk** from the run's *Artifacts* section, unzip it and install `app-release.apk` on your phone (allow "Install unknown apps").

## Option B: Expo EAS cloud build

```bash
npm install
npx expo install --fix
npm install -g eas-cli
eas login
eas build -p android --profile preview      # gives you a download link to an .apk
```

## Option C: Build locally

Requirements: Node 20+, JDK 17, Android Studio (SDK 35/36 + NDK installed by Gradle automatically).

```bash
npm install
npx expo install --fix           # makes all native module versions match the SDK
npx expo run:android             # debug build on a connected phone / emulator
# or a standalone release APK:
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

> **Note:** this app uses native modules (`react-native-pdf`), so it does **not** run inside the Expo Go app — use one of the builds above. During development, `npx expo run:android` then `npm start` gives you fast refresh.

### Signing for Play Store

The release APK above is signed with the default debug key (fine for sideloading). For Google Play, create a keystore and either use `eas build -p android --profile production` (EAS manages the key) or configure `signingConfigs.release` in `android/app/build.gradle`.

## Known limitations

- Added text uses Helvetica (built-in PDF font), which supports Latin characters only. To add Hindi/Arabic/etc., embed a TTF with `@pdf-lib/fontkit` in `applyAnnotations`.
- "Edit text" works the way most mobile editors do: whiteout the old text and type new text on top. Reflowing existing text in place isn't possible with PDF in general.
- Encrypted PDFs can be viewed (with password) but not modified.
- Page organizer shows page shapes/orientation rather than rendered thumbnails.
