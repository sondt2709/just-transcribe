## ADDED Requirements

### Requirement: Python source bundled in DMG
The electron-builder config SHALL include the Python application source (`src/` and `pyproject.toml`) as extraResources so they are available inside the app bundle at `Contents/Resources/python/`.

#### Scenario: DMG contains python source
- **WHEN** the app is built with `npx electron-builder --mac`
- **THEN** the resulting `.app` bundle contains `Contents/Resources/python/src/` and `Contents/Resources/python/pyproject.toml`

#### Scenario: Excluded files not bundled
- **WHEN** the app is built
- **THEN** the `.app` bundle SHALL NOT contain `.venv`, `uv.lock`, `__pycache__`, or `.omc` inside the python resource directory

### Requirement: App icon
The app SHALL use a custom icon (`electron/build/icon.icns`) generated from the source SVG at `.tmp/icon.svg`. The icon SHALL render correctly in Dock, Finder, and DMG installer.

#### Scenario: Icon visible in Dock
- **WHEN** the user launches Just Transcribe from Applications
- **THEN** the Dock displays the custom app icon, not the default Electron icon

#### Scenario: Icon visible in Finder
- **WHEN** the user views Just Transcribe.app in Finder
- **THEN** the file icon shows the custom app icon at all sizes (16x16 through 512x512@2x)

### Requirement: DMG build produces installable artifact
Running `npm run build && npx electron-builder --mac` in the `electron/` directory SHALL produce a `.dmg` file that a user can open and drag to Applications.

#### Scenario: Successful DMG build
- **WHEN** a developer runs the build command
- **THEN** a `.dmg` file is created in `electron/dist/`

#### Scenario: DMG install flow
- **WHEN** a user opens the `.dmg` and drags the app to Applications
- **THEN** the app launches and shows the setup screen on first run
