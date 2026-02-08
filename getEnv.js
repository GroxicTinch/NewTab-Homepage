const ENV_TYPES = {
    FIREFOX: "firefox-extension",
    CHROME: "chrome-extension",
    STATIC: "static-web"
};

const RUNTIME_ENV = getRuntimeEnvironment();

function getRuntimeEnvironment() {
    // Firefox extension
    if (typeof browser !== "undefined" && browser.runtime?.id) {
        return ENV_TYPES.FIREFOX;
    }

    // Chrome extension
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
        return ENV_TYPES.CHROME;
    }

    // Plain website
    return ENV_TYPES.STATIC;
}