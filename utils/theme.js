THEMES = {
  NONE: 0,
  DEMO: 1,
  PRIVATE: 2,
}

function checkAndApplyWindowTheme() {
  setCssVariable('--header-bg-color-override', 'var(--header-bg-color-user)');
  setCssVariable('--header-text-color-override', 'var(--header-text-color-user)');

  setCssVariable("--left-bg-color-override", "var(--left-bg-color-user)");
  setCssVariable("--left-text-color-override", "var(--left-text-color-user)");

  setCssVariable("--center-bg-color-override", "var(--center-bg-color-user)");
  setCssVariable("--center-text-color-override", "var(--center-text-color-user)");

  setCssVariable("--right-bg-color-override", "var(--right-bg-color-user)");
  setCssVariable("--right-text-color-override", "var(--right-text-color-user)");
  setCssVariable("--right-text-color-secondary-override", "var(--right-text-color-secondary-user)");

  if (DEMO_MODE) {
    setCssVariable('--header-bg-color-override', '#e17100');
    setCssVariable('--header-text-color-override', '#2a2a2a');
    globalThis.appliedTheme = THEMES.DEMO;
    globalThis.defaultHeaderTitle = "🧪 Demo Mode";
  } else if (isPrivateWindow) {
    setCssVariable('--header-bg-color-override', '#3c0366');
    setCssVariable('--header-text-color-override', '#ffffff');
    globalThis.appliedTheme = THEMES.PRIVATE;
    globalThis.defaultHeaderTitle = "😏 Sneaky Mode";
  } else {
    globalThis.appliedTheme = THEMES.NONE;
    globalThis.defaultHeaderTitle = "🏠 Home"
  }

  return 
}

function setCssVariable(variable, value) {
  document.documentElement.style.setProperty(variable, value);
}