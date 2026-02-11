if (RUNTIME_ENV === ENV_TYPES.STATIC) {
  console.error("This script should only be run in an extension environment.");
  throw new Error("Invalid environment");
}

const API = (RUNTIME_ENV === ENV_TYPES.FIREFOX ? browser : chrome);

const IS_FIREFOX = RUNTIME_ENV === ENV_TYPES.FIREFOX;

console.log("The current environment is", RUNTIME_ENV);

API.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "exchangeAuthCode") {
    (async () => {
      try {
        const { pkce_verifier } = await API.storage.local.get("pkce_verifier");

        if (!pkce_verifier) {
          throw new Error("PKCE verifier missing");
        }

        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: message.code,
            client_id: IS_FIREFOX ? FIREFOX_CLIENT_ID : CHROME_CLIENT_ID,
            client_secret: IS_FIREFOX ? FIREFOX_CLIENT_SECRET : CHROME_CLIENT_SECRET,
            // code_verifier: pkce_verifier, // Doesnt work
            redirect_uri: API.identity.getRedirectURL(),
            grant_type: "authorization_code"
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text);
        }

        const data = await response.json();

        sendResponse({
          token: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in
        });
      } catch (err) {
        console.error(err);
        sendResponse({ error: err.message });
      }
    })();

    return true; // 🔑 keep channel open
  }

  if (message.type === "refreshToken") {
    (async () => {
      try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: IS_FIREFOX ? FIREFOX_CLIENT_ID : CHROME_CLIENT_ID,
            client_secret: IS_FIREFOX ? FIREFOX_CLIENT_SECRET : CHROME_CLIENT_SECRET,
            refresh_token: message.refreshToken,
            grant_type: "refresh_token"
          })
        });

        if (!response.ok) throw new Error("Refresh failed");

        const data = await response.json();

        sendResponse({
          token: data.access_token,
          expiresIn: data.expires_in
        });

      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();

    return true;
  }
});
