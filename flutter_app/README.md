# HRMS Pro - Flutter Mobile App

## Setup Instructions

### Prerequisites
- Flutter SDK 3.10+ installed on your machine
- Android Studio or VS Code with Flutter extension
- A physical Android/iOS device for testing camera and GPS features

### Getting Started

1. **Clone/Download** this project to your local machine

2. **Install dependencies:**
   ```bash
   cd flutter_app
   flutter pub get
   ```

3. **Update API URL:**
   Open `lib/core/api_client.dart` and update the `baseUrl` to your backend server URL.

4. **Run the app:**
   ```bash
   flutter run
   ```

### Features
- JWT Authentication (Login/Signup)
- Employee Dashboard
- Attendance Marking with GPS Location & Face Verification
- Leave Management (Apply, View Status)
- Profile Management with Previous Experience
- Job Board (Browse & Apply for Positions)

### Android Permissions
The app requires:
- Camera (for face verification)
- Location (for GPS attendance)
- Internet

These are configured in `android/app/src/main/AndroidManifest.xml`.

### Folder Structure
```
lib/
├── core/
│   ├── api_client.dart      # Dio HTTP client with JWT interceptor
│   ├── auth_provider.dart   # Authentication state management
│   └── theme.dart           # App theme and colors
├── features/
│   ├── auth/
│   │   ├── login_screen.dart
│   │   └── signup_screen.dart
│   ├── dashboard/
│   │   ├── home_screen.dart      # Bottom navigation wrapper
│   │   └── dashboard_screen.dart # Employee dashboard
│   ├── attendance/
│   │   └── attendance_screen.dart # Clock in/out with GPS + face
│   ├── leave/
│   │   └── leave_screen.dart      # Leave management
│   ├── profile/
│   │   └── profile_screen.dart    # Profile with experience
│   └── jobs/
│       └── jobs_screen.dart       # Job board and applications
└── main.dart
```
