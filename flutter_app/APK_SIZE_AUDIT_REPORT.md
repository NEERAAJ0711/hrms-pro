# 📦 Flutter App — APK/AAB Size Optimization Audit Report

**Project:** HRMS Pro Mobile (`flutter_app/`)
**Date:** June 26, 2026
**Status:** Audit complete. Optimization code changes were **reverted** at user request — this report lists them as **recommendations** to apply later.
**Distribution model:** Direct `.apk` download from server (`/uploads/downloads/hrms-latest.apk`) + in-app update via `version.json`. **Not** distributed via Google Play Store. *(This constraint matters for AAB — see §6.)*

---

## 1. Why the release build is large

| # | Root cause | Severity |
|---|-----------|----------|
| 1 | **Universal APK** — CI runs `flutter build apk --release` (no ABI split), so native libraries for **arm64-v8a + armeabi-v7a + x86_64** are all bundled into a single APK. | 🔴 Largest factor |
| 2 | **R8 disabled** — `minifyEnabled false` and `shrinkResources false` in the release build type. No Java/Kotlin code shrinking, no resource shrinking. | 🟠 Large |
| 3 | **`google_mlkit_face_detection`** bundles a face-detection ML model + native libs (~16–20 MB across ABIs). Required for face attendance. | ⚪ Required — keep |
| 4 | **Unused packages** still pulled into the dependency tree, adding native/Dart code. | 🟡 Medium |

---

## 2. Findings (full checklist)

| Area | Result |
|------|--------|
| Unused packages | ✅ Found 5 (see §3) |
| Unused dependencies | ✅ Same 5 packages |
| Unused assets | ✅ None — `assets/` is empty (only `.gitkeep`) |
| Duplicate assets | ✅ None |
| Large images | ✅ None bundled |
| Large fonts | ✅ No custom fonts; icon/font tree-shaking is automatic in release |
| Unused icons | ✅ Auto tree-shaken by Flutter in release |
| Dead code | ✅ None significant |
| Duplicate code | ✅ None significant |
| Debug-only code | ✅ Negligible (1 reference) |
| Unused plugins | ✅ Covered by §3 |
| Dev dependencies in release | ✅ Only `flutter_test` + `flutter_lints` — already excluded from release builds |
| Test assets in release | ✅ None |

---

## 3. Unused packages (verified — zero Dart imports)

| Package | Why removable |
|---------|---------------|
| `geocoding` | No `placemarkFromCoordinates` / import anywhere in `lib/` |
| `permission_handler` | No import; `geolocator` & `camera` handle their own permissions natively |
| `shared_preferences` | No import; app uses `flutter_secure_storage` for storage |
| `flutter_svg` | No `SvgPicture` usage anywhere |
| `cupertino_icons` | No `CupertinoIcons` usage; Material icons come from `uses-material-design` |

> **Kept (in use):** `dio`, `flutter_secure_storage`, `geolocator`, `image_picker`, `camera`, `google_mlkit_face_detection`, `provider`, `intl`, `path_provider`, `pdf`, `share_plus`, `package_info_plus`, `url_launcher`.

---

## 4. Estimated size impact

> ⚠️ Estimates only — a Flutter SDK is not available locally to produce exact numbers. Verify with a real CI build.

| Stage | Estimated APK size |
|-------|--------------------|
| Current (universal, no shrink) | ~60–70 MB |
| + R8 minify + resource shrink + remove unused packages (still universal) | ~45–52 MB (**~20–30% smaller**) |
| + arm64-only split APK *(see §6, has device-compat risk)* | ~22–30 MB (**~55–65% smaller total**) |

---

## 5. ✅ Safe optimizations (low risk — recommended)

| # | Change | File | Expected reduction | Risk |
|---|--------|------|--------------------|------|
| S1 | Remove the 5 unused packages | `pubspec.yaml` | ~3–6 MB | 🟢 Low (zero imports) |
| S2 | `minifyEnabled true` + `shrinkResources true` | `android/app/build.gradle` | ~8–15 MB | 🟢 Low–Medium (needs ProGuard keep rules) |
| S3 | ProGuard keep rules for ML Kit / camera / `@Keep` / Kotlin metadata (so R8 doesn't strip needed classes) | `android/app/proguard-rules.pro` | enables S2 safely | 🟢 Low |
| S4 | Add `--tree-shake-icons` + `--split-debug-info` to build | `.github/workflows/build-flutter-apk.yml` | small + strips debug symbols | 🟢 Low |

**Verification after applying:** build via CI, install on a real device, and test **face attendance**, **payslip PDF**, and **login** (these exercise the plugins most affected by R8). Rollback is trivial — flip the two booleans in `build.gradle` back to `false`.

---

## 6. ⚠️ Higher-impact but RISKY optimizations (apply only with explicit decision)

| # | Change | Benefit | Risk / Reason to be careful |
|---|--------|---------|------------------------------|
| R1 | **`--split-per-abi`** and publish the **arm64-v8a** APK as `hrms-latest.apk` | Biggest size drop (~50–65% of native libs) | Drops support for old **32-bit (armeabi-v7a)** and **x86** devices. ~99% of modern phones are arm64, but very old devices won't install. |
| R2 | **AAB (`flutter build appbundle`)** | Play Store delivers per-device optimized splits | **AAB cannot be sideloaded / direct-downloaded.** Useless for this app's current direct-`.apk` distribution. Only worth it **if** you publish to Google Play. |
| R3 | **`--obfuscate`** | Small extra size + code obfuscation | Can break reflection-based code; needs a real test build before trusting. |

---

## 7. Notes / out of scope

- **Release signing uses the debug key** (`signingConfig signingConfigs.debug`). This is a *security/release-correctness* concern (not size). Changing it requires a proper keystore and would affect the in-app update flow — handle separately when ready.
- `android.enableJetifier=true` is legacy; all current deps are AndroidX. Disabling it speeds builds but does **not** reduce app size.

---

## 8. Summary

- **Biggest safe win:** enable R8 (`minifyEnabled` + `shrinkResources`) with proper ProGuard rules → ~8–15 MB.
- **Biggest overall win:** arm64-only split APK → ~55–65% smaller, but excludes 32-bit/x86 devices (your call).
- **No asset/font/image bloat exists** — nothing to optimize there.
- **AAB does not fit** the current direct-download model; only relevant if moving to Google Play.

*All optimization code changes were reverted per request; this document is the actionable plan to apply them when you're ready.*
