if (RUNTIME_ENV === ENV_TYPES.STATIC) {
  console.error("This script should only be run in an extension environment.");
  throw new Error("Invalid environment");
}

const API = RUNTIME_ENV === ENV_TYPES.FIREFOX ? browser : chrome;

const IS_FIREFOX = RUNTIME_ENV === ENV_TYPES.FIREFOX;

console.log("The current environment is", RUNTIME_ENV);

API.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'exchangeAuthCode') {
    (async () => {
      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: message.code,
            client_id: IS_FIREFOX ? FIREFOX_CLIENT_ID : CHROME_CLIENT_ID,
            code_verifier: storedVerifier,
            redirect_uri: API.identity.getRedirectURL(),
            grant_type: 'authorization_code'
          })
        });

        if (!response.ok) {
          const errorData = await response.text(); // Get the response as text
          console.error(`Error data: ${errorData}`); // Log to see details
          throw new Error(`Token exchange failed: ${response.status}`);
        }

        const data = await response.json();
        sendResponse({
          token: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in
        });
      } catch (error) {
        console.error(error);
        sendResponse({ error: error.message });  // Send back the error
      }
    })();

    return true; // This keeps the message channel open for sendResponse
  }

  if (message.type === 'refreshToken') {
    (async () => {
      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: IS_FIREFOX ? FIREFOX_CLIENT_ID : CHROME_CLIENT_ID,
            refresh_token: message.refreshToken,
            grant_type: 'refresh_token'
          })
        });

        if (!response.ok) {
          throw new Error(`Refresh failed: ${response.status}`);
        }

        const data = await response.json();
        sendResponse({
          token: data.access_token,
          expiresIn: data.expires_in
        });
      } catch (error) {
        console.error(error);
        sendResponse({ error: error.message });  // Send back the error
      }
    })();

    return true; // This keeps the message channel open for sendResponse
  }
});