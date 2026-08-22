## ADDED Requirements

### Requirement: Consistent dark appearance
All renderer views, including the first-run Setup view, SHALL render on the app's dark background (`neutral-950`). The document body SHALL carry the dark background as a fallback, and the main BrowserWindow SHALL set a matching `backgroundColor` so no white frame is painted before the first render. The app is dark-only; following OS light/dark mode is explicitly out of scope.

#### Scenario: Setup view is dark on first launch
- **WHEN** the app launches for the first time (setup not complete)
- **THEN** the Setup view renders with the dark background and legible light text

#### Scenario: No white flash on window creation
- **WHEN** the main window is created and shown
- **THEN** no white background is visible at any point before the React app paints

#### Scenario: Appearance consistent across setup completion
- **WHEN** the user completes setup and the app transitions to the transcript view
- **THEN** the background color does not visibly change
