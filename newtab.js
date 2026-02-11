const VERSION = "0.3.2";

const CACHE = {
  EMAIL: "email",
  EMAIL_MSG: "email_msg",
  TASKS: "tasks",
  CALENDAR: "calendar",
  GOOGLE_TOKEN: "google_token",
  BIN_INFO: "bins",
  WEATHER: "weather"
};

const ICONS = {
  DELETE: "❌",
  TRASH: "🗑️",
  UP: "🡅",
  DOWN: "🡇"
}

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
].join(' ');

const DEMO_MODE = (RUNTIME_ENV === ENV_TYPES.STATIC);
const CLIENT_ID = (RUNTIME_ENV === ENV_TYPES.FIREFOX ? FIREFOX_CLIENT_ID : CHROME_CLIENT_ID)
let isPrivateWindow = false;

let pkce_verifier = generateCodeVerifier();

if (DEMO_MODE) {
  browser.storage.local.set({ "pkce_verifier": pkce_verifier });
}

// PKCE doesn't even work currently due to Google Cloud Credentials still requiring a client_secret even when we try use PKCE
function generateCodeVerifier() {
  const array = new Uint32Array(28);
  window.crypto.getRandomValues(array);
  return array.join('');
}

async function generateCodeChallenge(verifier) {
  return btoa(String.fromCharCode(...new Uint8Array(crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))));
}

// Compatibility shim: provide a promise-based `browser` API when running in Chrome
// so the rest of the code (which uses `browser.*`) works in both Firefox and Chrome.
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  window.browser = (function (chrome) {
    function promisify(fn, ctx) {
      return function (...args) {
        return new Promise((resolve, reject) => {
          try {
            fn.apply(ctx, [...args, (res) => {
              if (chrome.runtime && chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(res);
              }
            }]);
          } catch (e) {
            reject(e);
          }
        });
      };
    }

    const storageSync = chrome.storage && chrome.storage.sync ? {
      get: promisify(chrome.storage.sync.get, chrome.storage.sync),
      set: promisify(chrome.storage.sync.set, chrome.storage.sync),
      remove: promisify(chrome.storage.sync.remove, chrome.storage.sync),
      getBytesInUse: promisify(chrome.storage.sync.getBytesInUse, chrome.storage.sync)
    } : {};

    return {
      storage: { sync: storageSync },
      identity: {
        getRedirectURL: () => chrome.identity && chrome.identity.getRedirectURL ? chrome.identity.getRedirectURL() : '',
        launchWebAuthFlow: (opts) => new Promise((resolve, reject) => {
          if (!chrome.identity || !chrome.identity.launchWebAuthFlow) return reject(new Error('chrome.identity.launchWebAuthFlow not available'));
          chrome.identity.launchWebAuthFlow(opts, (redirectUrl) => {
            if (chrome.runtime && chrome.runtime.lastError) return reject(chrome.runtime.lastError);
            resolve(redirectUrl);
          });
        })
      },
      runtime: {
        sendMessage: (message) => new Promise((resolve, reject) => {
          try {
            chrome.runtime.sendMessage(message, (resp) => {
              if (chrome.runtime && chrome.runtime.lastError) return reject(chrome.runtime.lastError);
              resolve(resp);
            });
          } catch (e) {
            reject(e);
          }
        })
      },
      windows: {
        getCurrent: () => new Promise((resolve, reject) => {
          try {
            chrome.windows.getCurrent((win) => {
              if (chrome.runtime && chrome.runtime.lastError) return reject(chrome.runtime.lastError);
              resolve(win);
            });
          } catch (e) {
            reject(e);
          }
        })
      }
    };
  })(chrome);
}

let userConfirmation = null;

function wmoInterpretation(color, description, icon) {
  color = color || '#9E9200';
  icon = `icons/airy/${icon}@4x.png`;

  return {
    description,
    color,
    icon
  };
}

// Credit to https://github.com/Leftium/weather-sense for the WMO codes and icons
const WMO_CODES = {
	0: wmoInterpretation('#F1F1F1', 'Clear', 'clear'),

	1: wmoInterpretation('#E2E2E2', 'Mostly Clear', 'mostly-clear'),
	2: wmoInterpretation('#C6C6C6', 'Partly Cloudy', 'partly-cloudy'),
	3: wmoInterpretation('#ABABAB', 'Overcast', 'overcast'),

	45: wmoInterpretation('#A4ACBA', 'Fog', 'fog'),
	48: wmoInterpretation('#8891A4', 'Icy Fog', 'rime-fog'),

	51: wmoInterpretation('#3DECEB', 'Light Drizzle', 'light-drizzle'),
	53: wmoInterpretation('#0CCECE', 'Drizzle', 'moderate-drizzle'),
	55: wmoInterpretation('#0AB1B1', 'Heavy Drizzle', 'dense-drizzle'),

	80: wmoInterpretation('#9BCCFD', 'Light Showers', 'light-rain'),
	81: wmoInterpretation('#51B4FF', 'Showers', 'moderate-rain'),
	82: wmoInterpretation('#029AE8', 'Heavy Showers', 'heavy-rain'),

	61: wmoInterpretation('#BFC3FA', 'Light Rain', 'light-rain'),
	63: wmoInterpretation('#9CA7FA', 'Rain', 'moderate-rain'),
	65: wmoInterpretation('#748BF8', 'Heavy Rain', 'heavy-rain'),

	56: wmoInterpretation('#D3BFE8', 'Light Freezing Drizzle', 'light-freezing-drizzle'),
	57: wmoInterpretation('#A780D4', 'Freezing Drizzle', 'dense-freezing-drizzle'),

	66: wmoInterpretation('#CAC1EE', 'Light Freezing Rain', 'light-freezing-rain'),
	67: wmoInterpretation('#9486E1', 'Freezing Rain', 'heavy-freezing-rain'),

	71: wmoInterpretation('#F9B1D8', 'Light Snow', 'slight-snowfall'),
	73: wmoInterpretation('#F983C7', 'Snow', 'moderate-snowfall'),
	75: wmoInterpretation('#F748B7', 'Heavy Snow', 'heavy-snowfall'),

	77: wmoInterpretation('#E7B6EE', 'Snow Grains', 'snowflake'),

	85: wmoInterpretation('#E7B6EE', 'Light Snow Showers', 'slight-snowfall'),
	86: wmoInterpretation('#CD68E0', 'Snow Showers', 'heavy-snowfall'),

	95: wmoInterpretation('#525F7A', 'Thunderstorm', 'thunderstorm'),

	96: wmoInterpretation('#3D475C', 'Light T-storm w/ Hail', 'thunderstorm-with-hail'),
	99: wmoInterpretation('#2A3140', 'T-storm w/ Hail', 'thunderstorm-with-hail')
};

// https://open-meteo.com/en/docs?current=weather_code&daily=weather_code#weather_variable_documentation
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast' +
                    '?daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max' +
                    '&current=weather_code,temperature_2m&timezone=auto&timeformat=unixtime';

document.addEventListener("DOMContentLoaded", () => {
  const loadscreen = document.getElementById("loadscreen");

  const leftColumn = document.getElementById("left-column");
  const rightColumn = document.getElementById("right-column");

  const collapseHandleLeft = document.getElementById("collapse-handle-left");
  const collapseHandleRight = document.getElementById("collapse-handle-right");

  const settingsButton = document.getElementById("settings-button");

  const loginButton = document.getElementById("login-button");
  const authDropdown = document.getElementById("auth-dropdown");

  const settingsModal = document.getElementById("settings-modal");
  const openBackupManager = document.getElementById("open-backup-manager");
  const clearSettingsToDefault = document.getElementById("clear-settings");
  const importSettings = document.getElementById("import-settings");
  const exportSettings = document.getElementById("export-settings");
  const closeSettings = document.getElementById("close-settings");

  const backupModal = document.getElementById("backup-modal");
  const backupNameInput = document.getElementById("new-backup-name");
  const backupDeleteBtn = document.getElementById("delete-backup");
  const backupLoadBtn = document.getElementById("load-backup");
  const backupSaveBtn = document.getElementById("save-backup");
  const closeBackupModal = document.getElementById("close-backup-modal");

  const lastUpdatedDisplay = document.getElementById("last-updated");
  const headerWeather = document.getElementById("weather");
  const headerDate = document.getElementById("date");

  // Get color pickers
  const headerBgColorPicker = document.getElementById("header-bg-color");
  const headerTextColorPicker = document.getElementById("header-text-color");
  const leftBgColorPicker = document.getElementById("left-bg-color");
  const leftTextColorPicker = document.getElementById("left-text-color");
  const centerBgColorPicker = document.getElementById("center-bg-color");
  const centerTextColorPicker = document.getElementById("center-text-color");
  const rightBgColorPicker = document.getElementById("right-bg-color");
  const rightTextColorPicker = document.getElementById("right-text-color");

  // Get Shortcut Appearance controls
  const shortcutIconSizeControl = document.getElementById('shortcut-icon-size');
  const shortcutTextSizeControl = document.getElementById('shortcut-text-size');
  const shortcutPadXControl = document.getElementById('shortcut-padding-x');
  const shortcutPadYControl = document.getElementById('shortcut-padding-y');
  const shortcutMarginXControl = document.getElementById('shortcut-margin-x');
  const shortcutMarginYControl = document.getElementById('shortcut-margin-y');
  const shortcutTextColorControl = document.getElementById('shortcut-text-color');
  const shortcutIconRadiusControl = document.getElementById('shortcut-radius');

  // Get Group Appearance controls
  const groupTextSizeControl = document.getElementById('group-text-size');
  const groupDividerColorControl = document.getElementById('group-divider-color');

  // Get google response cache setting
  const useThemeOverridesCheckbox = document.getElementById("use-theme-overrides");
  const useTwoEmailsCheckbox = document.getElementById("use-two-emails");
  const cacheDurationInput = document.getElementById("cache-duration"); // New input for cache duration

  const btnUseGPS = document.getElementById("btn-use-gps");
  const gpsLatInput = document.getElementById("gps-lat");
  const gpsLngInput = document.getElementById("gps-lng");

  const shortcutsContainer = document.getElementById("shortcuts");

  const versionDisplay = document.getElementById("version-text");

  // Event listeners for color pickers
  headerBgColorPicker.addEventListener("input", updateColors);
  headerTextColorPicker.addEventListener("input", updateColors);
  leftBgColorPicker.addEventListener("input", updateColors);
  leftTextColorPicker.addEventListener("input", updateColors);
  centerBgColorPicker.addEventListener("input", updateColors);
  centerTextColorPicker.addEventListener("input", updateColors);
  rightBgColorPicker.addEventListener("input", updateColors);
  rightTextColorPicker.addEventListener("input", updateColors);

  collapseHandleLeft.addEventListener("click", () => {
    leftCollapsed = !leftCollapsed;

    localStorage.setItem("leftColumnCollapsed", leftCollapsed);
    updateCollapseStates();
  });
  collapseHandleRight.addEventListener("click", () => {
    rightCollapsed = !rightCollapsed;

    localStorage.setItem("rightColumnCollapsed", rightCollapsed);
    updateCollapseStates();
  });

  useThemeOverridesCheckbox.addEventListener("change", () => {
    useThemeOverrides = useThemeOverridesCheckbox.checked;
    updateColors();
  });

  btnUseGPS.addEventListener("click", () => {
    // [FIXME] Freezes up when clicked a few times
    btnUseGPS.disabled = true;
    btnUseGPS.innerText = "Getting GPS...";
    btnUseGPS.classList.add("disabled");
    getGPS().then(coords => {
      gps = [coords.latitude, coords.longitude];
      gpsLatInput.value = coords.latitude;
      gpsLngInput.value = coords.longitude;
      btnUseGPS.innerText = "Use GPS";
      btnUseGPS.disabled = false;
    }).catch(error => {
      console.error("Error obtaining GPS coordinates: ", error);
    });
  });
  
  settingsButton.addEventListener("click", () => {
    settingsModal.classList.toggle("hidden");
  });
  
  openBackupManager.addEventListener("click", () => {
    backupModal.classList.remove("hidden");
    renderBackupList();
  });

  clearSettingsToDefault.addEventListener("click", () => {
    getUserConfirmation(
      "Are you sure you want to clear all settings? This cannot be undone.",
      [{ "Yes Clear All": "#b91c1c" },{ "Yes, but preserve shortcuts": "#b9361cff" },  "Cancel" ]
    ).then(async (choice) => {
      if (choice === 0 || choice === 1) {
        const timestamp = Date.now();
        const backupName = "Before Reset - " + new Date(timestamp).toLocaleDateString('en-GB');
      
        backupList.unshift({ name: backupName, timestamp });
        await saveSettingsToBackup(backupName);
      }

      if(choice === 0) {
        await storageRemove(["settings", "themeColors", "shortcutsData"]);
        location.reload(); // Reload to apply default settings
      } else if (choice === 1) {
        await storageRemove(["settings", "themeColors"]);
        location.reload(); // Reload to apply default settings
      }
    });
  });

  backupSaveBtn.addEventListener("click", async () => {
    const timestamp = Date.now();
  
    if (selectedBackupIndex === null) {
      // Add new
      backupNameInput.value = `Backup - ${new Date(timestamp).toLocaleDateString('en-GB')}`;
      backupNameInput.classList.remove("hidden");
      backupNameInput.focus();
      backupNameInput.select();
  
      backupNameInput.onkeydown = async (e) => {
        if (e.key === "Enter") {
          const backupName = backupNameInput.value.trim();
          if (!backupName) return;
  
          backupList.unshift({ name: backupName, timestamp });
          await saveSettingsToBackup(backupName);
          backupNameInput.classList.add("hidden");
          renderBackupList();
        }
      };
    } else {
      const backup = backupList.find(b => b.index === selectedBackupIndex);;
      const confirm = await getUserConfirmation(
        `Are you sure you want to override <strong>${backup.name}</strong>?`,
        [{ "Yes": "#b91c1c" }, "No"]
      );
  
      if (confirm === 0) {
        await deleteSettingsBackupAt(selectedBackupIndex);
        await saveSettingsToBackup(backup.name);
      }
    }
  });

  // Load Button
  backupLoadBtn.addEventListener("click", async() => {
    if (selectedBackupIndex !== null) {
      const choice = await getUserConfirmation(
        `You are about to lose your current unsaved settings<br>Do you want to save a backup before you load?`,
        ["Yes", "No", { Cancel: "#b91c1c" }]
      );

      if (choice === 0) {
        const timestamp = Date.now();
        const backupName = `Quicksave before load - ${new Date(timestamp).toLocaleDateString('en-GB')}`;
        backupList.unshift({ name: backupName, timestamp });
        await saveSettingsToBackup(backupName);
        loadSettingsFromBackup(selectedBackupIndex);
      } else if (choice === 1) {
        loadSettingsFromBackup(selectedBackupIndex);
      } else {
        return;
      }
    }
    backupModal.classList.add("hidden");
    selectedBackupIndex = null;
    backupNameInput.classList.add("hidden");
    backupLoadBtn.disabled = true;
  });

  backupDeleteBtn.addEventListener("click", async () => {
    if (selectedBackupIndex === null) return;
  
    const selected = backupList.find(b => b.index === selectedBackupIndex);
    if (!selected) return;
  
    const confirm = await getUserConfirmation(
      `Delete <strong>${selected.name}</strong>?`,
      [{ "Yes": "#b91c1c" }, "Cancel"]
    );
  
    if (confirm === 0) {
      await deleteSettingsBackupAt(selectedBackupIndex);
      selectedBackupIndex = null;
      backupLoadBtn.disabled = true;
      await loadAllBackups(); // this will refresh backupList and UI
    }
  });

  closeBackupModal.addEventListener("click", () => {
    backupModal.classList.add("hidden");
    selectedBackupIndex = null;
    backupNameInput.classList.add("hidden");
    backupLoadBtn.disabled = true;
  });

  loginButton.addEventListener("click", async () => {
    authDropdown.classList.toggle("hidden");
  });

  importSettings.addEventListener("click", () => {
    document.getElementById('settingsLoader').click();
  });

  document.getElementById("settingsLoader").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (file) {
      loadSettingsFromFile(file);
    }
  });

  exportSettings.addEventListener("click", () => {
    saveSettingsToFile();
  });

  closeSettings.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
    saveSettingsToStorage(); // Save colors on change
  });

  document.querySelectorAll('#shortcuts-settings input').forEach(input => {
    input.addEventListener('input', applyShortcutStyles);
  });

  document.querySelectorAll('#group-settings input').forEach(input => {
    input.addEventListener('input', applyShortcutStyles);
  });

  let leftCollapsed = false;
  let rightCollapsed = false;

  let backupList = [];
  let selectedBackupIndex = null;
  let shortcutsData = [];
  let preEditShortcutsData = [];
  let shortcutsEditMode = false;
  let editingGroupIndex = null;
  let editingShortcutIndex = null;
  let useThemeOverrides = false;
  let useTwoEmails = false;

  let gps = null;

  async function checkPrivateWindow() {
    const window = await browser.windows.getCurrent();
    const isPrivateWindow = window.incognito;
    return isPrivateWindow;
  }

  function renderBackupList() {
    const list = document.getElementById("backup-list");
    list.innerHTML = "";
  
    // Sort newest first
    const sortedList = [...backupList].sort((a, b) => b.timestamp - a.timestamp);
  
    sortedList.forEach((backup) => {
      const div = document.createElement("div");
      div.className = `flex justify-between items-center p-2 rounded cursor-pointer transition-colors ${
        selectedBackupIndex === backup.index ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
      }`;
  
      // Format date + time
      const date = new Date(Number(backup.timestamp));
      const timeStr = date.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
  
      // Name (left) and time (right)
      div.innerHTML = `
        <span class="truncate mr-2">${backup.name}</span>
        <span class="text-sm text-gray-300 whitespace-nowrap">${timeStr}</span>
      `;
  
      div.onclick = () => {
        if (selectedBackupIndex === backup.index) {
          selectedBackupIndex = null;
          document.getElementById("load-backup").disabled = true;
        } else {
          selectedBackupIndex = backup.index;
          document.getElementById("new-backup-name").classList.add("hidden");
          document.getElementById("load-backup").disabled = false;
        }
        renderBackupList();
      };
  
      list.appendChild(div);
    });
  }

  function applyShortcutStyles() {
    const root = document.documentElement;

    root.style.setProperty('--shortcut-icon-size', `${shortcutIconSizeControl.value}px`);
    root.style.setProperty('--shortcut-text-size', `${shortcutTextSizeControl.value}px`);
    root.style.setProperty('--shortcut-padding-x', `${shortcutPadXControl.value}px`);
    root.style.setProperty('--shortcut-padding-y', `${shortcutPadYControl.value}px`);
    root.style.setProperty('--shortcut-margin-x', `${shortcutMarginXControl.value}px`);
    root.style.setProperty('--shortcut-margin-y', `${shortcutMarginYControl.value}px`);
    root.style.setProperty('--shortcut-text-color', shortcutTextColorControl.value);
    root.style.setProperty('--shortcut-radius', `${shortcutIconRadiusControl.value}px`);

    root.style.setProperty('--group-text-size', `${groupTextSizeControl.value}px`);
    root.style.setProperty('--group-divider-color', groupDividerColorControl.value);
  }

  function showShortcutModal(groupIndex, shortcutIndex = null) {  
    const shortcutEditModal = document.getElementById("shortcut-edit-modal");
    const titleInput = document.getElementById("shortcut-edit-title");
    const linkInput = document.getElementById("shortcut-edit-link");
    const colorInput = document.getElementById("shortcut-edit-color");
    const iconInput = document.getElementById("shortcut-edit-icon");
    const iconSearch = document.getElementById("icon-search");
    const iconGrid = document.getElementById("icon-grid");
    const preview = document.getElementById("shortcut-icon-preview");
    const saveBtn = document.getElementById("shortcut-edit-save");
    const cancelBtn = document.getElementById("shortcut-edit-cancel");

    editingGroupIndex = groupIndex;
    editingShortcutIndex = shortcutIndex;

    const shortcut = shortcutIndex !== null
      ? shortcutsData[groupIndex].shortcuts[shortcutIndex]
      : { title: "", icon: "", color: "#374151", link: "" };

    if(shortcut.color == null || shortcut.color == undefined || shortcut.color == "") {
      shortcut.color = "#FFFFFF"; // Default color if not set
    }

    titleInput.value = shortcut.title;
    linkInput.value = shortcut.link;
    colorInput.value = shortcut.color;
    iconInput.value = shortcut.icon;
    preview.innerHTML = getIconHTML(shortcut.icon);
    preview.style.color = colorInput.value;

    // Populate icon grid
    iconGrid.innerHTML = '';
    FONTAWESOME_ICONS.forEach(icon => {
      const iconDiv = document.createElement("div");
      iconDiv.className = "p-2 text-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 rounded";
      iconDiv.innerHTML = `<i class="fa-${icon.name} fa${icon.styles[0].substring(0,1)} text-2xl"></i>`;
      iconDiv.title = icon.name;
      iconDiv.onclick = () => {
        iconInput.value = `fa-${icon.name} fa${icon.styles[0].substring(0,1)}`;
        preview.innerHTML = getIconHTML(`fa-${icon.name} fa${icon.styles[0].substring(0,1)}`);
      };
      iconGrid.appendChild(iconDiv);
    });

    colorInput.oninput = () => {
      preview.style.color = colorInput.value;
    }

    // Filter icons on search
    iconSearch.oninput = () => {
      const searchTerm = iconSearch.value.toLowerCase();
      iconGrid.innerHTML = '';
    
      FONTAWESOME_ICONS.filter(icon => {
        const labelMatch = icon.label.toLowerCase().includes(searchTerm);
        const searchMatch = icon.search.some(term => term.toLowerCase().includes(searchTerm));
        return labelMatch || searchMatch;
      }).forEach(icon => {
        const iconDiv = document.createElement("div");
        iconDiv.className = "p-2 text-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 rounded";
        iconDiv.innerHTML = `<i class="fa-${icon.name} fa${icon.styles[0].substring(0,1)} text-2xl"></i>`;
        iconDiv.title = icon.label || icon.name;
        iconDiv.onclick = () => {
          iconInput.value = `fa-${icon.name} fa${icon.styles[0].substring(0,1)}`;
          preview.innerHTML = getIconHTML(`fa-${icon.name} fa${icon.styles[0].substring(0,1)}`);
        };
        iconGrid.appendChild(iconDiv);
      });
    };

    iconInput.oninput = () => {
      preview.innerHTML = getIconHTML(iconInput.value);
    };

    saveBtn.onclick = () => {
      const updated = {
        title: titleInput.value,
        icon: iconInput.value,
        color: colorInput.value,
        link: linkInput.value
      };

      if (editingShortcutIndex !== null) {
        shortcutsData[editingGroupIndex].shortcuts[editingShortcutIndex] = updated;
      } else {
        shortcutsData[editingGroupIndex].shortcuts.push(updated);
      }

      renderShortcuts();
      shortcutEditModal.classList.add("hidden");
    };

    cancelBtn.onclick = () => {
      shortcutEditModal.classList.add("hidden");
    };

    shortcutEditModal.classList.remove("hidden");
  }
  
  function getIconHTML(icon) {
    if (!icon) return "";
    if (icon.startsWith("fa-")) {
      return `<i class="${icon}"></i>`;
    }
    if (icon.startsWith("http") || icon.startsWith("data:image")) {
      return `<img src="${icon}" alt="icon" style="width: var(--shortcut-icon-size); height: var(--shortcut-icon-size); object-fit: cover;">`;
    }
    return `<span style="font-size: var(--shortcut-icon-size);">${icon}</span>`;
  }

  function saveShortcuts() {
    if(shortcutsData) {
      console.log("Storage Saved");
      storageSet("shortcutsData", shortcutsData).catch(error => {
        console.error("Error saving shortcuts:", error);
      });
    } else {
      console.log("Storage Not Saved - shortcutsData is empty");
    }
  }

  function renderShortcuts() {
    shortcutsContainer.innerHTML = "";

    const editToggle = document.createElement("button");
    editToggle.innerHTML = shortcutsEditMode ? "💾" : "✏️";
    editToggle.className = "absolute top-2 right-2 hover:text-blue-400 focus:outline-none";
    editToggle.title = shortcutsEditMode ? "Save and exit edit mode" : "Enter edit mode";
    editToggle.onclick = () => {
      if(shortcutsEditMode) {
        saveShortcuts();
        preEditShortcutsData = null;
      } else {
        preEditShortcutsData = JSON.parse(JSON.stringify(shortcutsData));
      }
      shortcutsEditMode = !shortcutsEditMode;
      renderShortcuts();
    };
    shortcutsContainer.appendChild(editToggle);

    if(shortcutsEditMode) {
      const editCancel = document.createElement("button");
      editCancel.innerHTML = ICONS.TRASH;
      editCancel.className = "absolute top-2 right-10 hover:text-blue-400 focus:outline-none";
      editCancel.title = "Discard and exit edit mode";
      editCancel.onclick = async() => {
        const choice = await getUserConfirmation('Are you sure you want to discard changes?', ['Yes', 'No']);
        if (choice == 0) {
          shortcutsEditMode = false;
          if(preEditShortcutsData) {
            shortcutsData = JSON.parse(JSON.stringify(preEditShortcutsData));
            preEditShortcutsData = null;
            console.log("Changes discarded");
          }
          renderShortcuts();
        }
      };
      shortcutsContainer.appendChild(editCancel);
    }
    
    shortcutsData?.forEach((group, groupIndex) => {
      const groupDiv = document.createElement("div");
      groupDiv.className = "my-4";
      groupDiv.setAttribute("draggable", shortcutsEditMode ? "true" : "false");
      groupDiv.dataset.groupIndex = groupIndex;

      groupDiv.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("groupIndex", groupIndex);
        e.target.classList.add("opacity-50");
      });

      groupDiv.addEventListener("dragend", (e) => {
        e.target.classList.remove("opacity-50");
      });

      groupDiv.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.target.closest(".group-div")?.classList.add("border-blue-400");
      });

      groupDiv.addEventListener("dragleave", (e) => {
        e.target.closest(".group-div")?.classList.remove("border-blue-400");
      });

      groupDiv.addEventListener("drop", (e) => {
        e.preventDefault();
        e.target.closest(".group-div")?.classList.remove("border-blue-400");
        const fromGroupIndex = parseInt(e.dataTransfer.getData("groupIndex"));
        const fromShortcutIndex = e.dataTransfer.getData("shortcutIndex");
        const toGroupIndex = parseInt(groupDiv.dataset.groupIndex);

        if (fromShortcutIndex !== "") {
          const fromShortcut = parseInt(fromShortcutIndex);
          const [moved] = shortcutsData[fromGroupIndex].shortcuts.splice(fromShortcut, 1);
          shortcutsData[toGroupIndex].shortcuts.push(moved);
        } else {
          if (fromGroupIndex !== toGroupIndex) {
            const [moved] = shortcutsData.splice(fromGroupIndex, 1);
            shortcutsData.splice(toGroupIndex, 0, moved);
          }
        }
        renderShortcuts();
      });

      const groupHeader = document.createElement("div");
      groupHeader.className = "flex items-center select-none";
      const collapseKey = `group_collapsed_${groupIndex}`;
      let isCollapsed = localStorage.getItem(collapseKey) === "true";

      const groupName = document.createElement("span");
      groupName.textContent = group.name;
      groupName.className = "font-bold cursor-pointer whitespace-nowrap";
      groupName.style.fontSize = "var(--group-text-size, 16px)";
      if (shortcutsEditMode) {
        groupName.contentEditable = "true";
        groupName.style.outline = "none";
        groupName.addEventListener("input", () => {
          shortcutsData[groupIndex].name = groupName.textContent.trim() || "Unnamed Group";
        });
      }

      groupHeader.appendChild(groupName);

      const collapseIcon = document.createElement("div");
      collapseIcon.innerHTML = "▼";
      collapseIcon.className = "font-bold cursor-pointer whitespace-nowrap pl-2";
      collapseIcon.style.transition = "transform 0.3s ease"; // Add a transition for smoothness
      collapseIcon.style.transformOrigin = "75% 50%";
      collapseIcon.classList.toggle("collapsed-icon", isCollapsed);

      groupHeader.appendChild(collapseIcon);

      const divider = document.createElement("hr");
      divider.className = "flex-grow border-t mx-3";
      divider.style.borderColor = "var(--group-divider-color, #666666)";

      groupHeader.appendChild(divider);

      if (shortcutsEditMode) {
        const groupActions = document.createElement("div");
        groupActions.className = "flex gap-2";

        const delBtn = document.createElement("button");
        delBtn.innerHTML = ICONS.DELETE;
        delBtn.className = "text-red-400 hover:text-red-600";
        delBtn.title = "Delete group";
        delBtn.onclick = async() => {
          const confirm = await getUserConfirmation(
            `Delete group <strong>"${group.name}"</strong>?`,
            [{ "Yes": "#b91c1c" }, "No"]
          );

          if (confirm === 0) {
            shortcutsData.splice(groupIndex, 1);
            localStorage.removeItem(collapseKey);
            renderShortcuts();
          }
        };

        const upBtn = document.createElement("button");
        upBtn.innerHTML = ICONS.UP;
        upBtn.className = "hover:text-blue-400";
        upBtn.title = "Move group up";
        upBtn.onclick = () => moveGroup(groupIndex, -1);

        const downBtn = document.createElement("button");
        downBtn.innerHTML = ICONS.DOWN;
        downBtn.className = "hover:text-blue-400";
        downBtn.title = "Move group down";
        downBtn.onclick = () => moveGroup(groupIndex, 1);

        groupActions.appendChild(upBtn);
        groupActions.appendChild(downBtn);
        groupActions.appendChild(delBtn);
        groupHeader.appendChild(groupActions);
      }

      groupDiv.appendChild(groupHeader);

      const shortcutsList = document.createElement("div");
      shortcutsList.className = "flex flex-start transition-[max-height] duration-300 ease-in-out overflow-hidden";
      shortcutsList.classList.toggle("roll-up", (isCollapsed && !shortcutsEditMode));
      const numCols = parseInt(document.getElementById("shortcut-columns")?.value || "4");
      shortcutsList.dataset.groupIndex = groupIndex;

      group.shortcuts.forEach((shortcut, shortcutIndex) => {
        const item = document.createElement("a");
        if (shortcutsEditMode) {
          item.onclick = (e) => {
            e.stopPropagation();
            showShortcutModal(groupIndex, shortcutIndex);
          };
        } else {
          item.href = shortcut.link.startsWith("http") ? shortcut.link : `https://${shortcut.link}`;
          item.target = "_self"; // keeps left-click in same tab
        }
        
        item.className = "shortcut-icon shortcut-icon-rounded relative";
        item.style = `color: ${shortcut.color}; border-bottom-color: ${shortcut.color}`;
        item.setAttribute("draggable", shortcutsEditMode ? "true" : "false");
        item.dataset.shortcutIndex = shortcutIndex;

        item.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("groupIndex", groupIndex);
          e.dataTransfer.setData("shortcutIndex", shortcutIndex);
          e.target.classList.add("opacity-50");
        });

        item.addEventListener("dragend", (e) => {
          e.target.classList.remove("opacity-50");
        });

        item.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.target.classList.add("bg-gray-600");
        });

        item.addEventListener("dragleave", (e) => {
          e.target.classList.remove("bg-gray-600");
        });

        item.addEventListener("drop", (e) => {
          e.preventDefault();
          e.target.classList.remove("bg-gray-600");
          const fromGroupIndex = parseInt(e.dataTransfer.getData("groupIndex"));
          const fromShortcutIndex = parseInt(e.dataTransfer.getData("shortcutIndex"));
          const toShortcutIndex = parseInt(item.dataset.shortcutIndex);

          if (fromGroupIndex === groupIndex) {
            const [moved] = shortcutsData[groupIndex].shortcuts.splice(fromShortcutIndex, 1);
            shortcutsData[groupIndex].shortcuts.splice(toShortcutIndex, 0, moved);
          } else {
            const [moved] = shortcutsData[fromGroupIndex].shortcuts.splice(fromShortcutIndex, 1);
            shortcutsData[groupIndex].shortcuts.splice(toShortcutIndex, 0, moved);
          }
          renderShortcuts();
        });

        const iconSpan = document.createElement("span");
        iconSpan.className = "icon";
        iconSpan.innerHTML = getIconHTML(shortcut.icon);

        const titleSpan = document.createElement("span");
        titleSpan.className = "title";
        titleSpan.textContent = shortcut.title;

        item.appendChild(iconSpan);
        item.appendChild(titleSpan);

        if (shortcutsEditMode) {
          const actions = document.createElement("div");
          actions.className = "absolute top-1 right-1 flex gap-1";

          const editBtn = document.createElement("button");
          editBtn.innerHTML = "✏️";
          editBtn.className = "hover:text-blue-400";
          editBtn.title = "Edit shortcut";
          editBtn.onclick = (e) => {
            e.stopPropagation();
            showShortcutModal(groupIndex, shortcutIndex);
          };

          const delBtn = document.createElement("button");
          delBtn.innerHTML = ICONS.DELETE;
          delBtn.className = "text-red-400 hover:text-red-600";
          delBtn.title = "Delete shortcut";
          delBtn.onclick =  async (e) => {
            e.stopPropagation();
            const confirm = await getUserConfirmation(
              `Delete shortcut "${shortcut.title}"?`,
              [{ "Yes": "#b91c1c" }, "No"]
            );

            if (confirm === 0) {
              shortcutsData[groupIndex].shortcuts.splice(shortcutIndex, 1);
              renderShortcuts();
            }
          };

          actions.appendChild(editBtn);
          actions.appendChild(delBtn);
          item.appendChild(actions);
        }

        const clickFunction = (e) => {
          if (!shortcutsEditMode) {
            isCollapsed = !isCollapsed;
            localStorage.setItem(collapseKey, isCollapsed);
            shortcutsList.classList.toggle("roll-up", isCollapsed);
            collapseIcon.classList.toggle("collapsed-icon", isCollapsed);
          }
        }

        groupName.onclick = clickFunction;

        collapseIcon.onclick = clickFunction;

        // Handle both left-click and middle-click
        const openLink = (url, newTab = false) => {
          if (shortcutsEditMode) return;
        
          if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            url = `https://${url}`;
          }
        
          if (newTab) {
            window.open(url, '_blank');
          } else {
            window.location.href = url;
          }
        };
        
        // item.onclick = (e) => {
        //   if (e.button === 0) {
        //     openLink(shortcut.link, false); // Open in same tab
        //   }
        // };
        
        // item.addEventListener("auxclick", (e) => {
        //   if (e.button === 1) {
        //     openLink(shortcut.link, true); // Open in new tab
        //   }
        // });

        shortcutsList.appendChild(item);
      });

      if (shortcutsEditMode) {
        const addBtn = document.createElement("div");
        addBtn.className = "shortcut-icon shortcut-icon-rounded flex items-center justify-center cursor-pointer opacity-20 hover:opacity-100";
        addBtn.innerHTML = `<span class="icon text-2xl">+</span>`;
        addBtn.onclick = () => showShortcutModal(groupIndex);
        shortcutsList.appendChild(addBtn);
      }

      groupDiv.appendChild(shortcutsList);

      shortcutsContainer.appendChild(groupDiv);
    });

    if (shortcutsEditMode) {
      const createGroupDiv = document.createElement("div");
      createGroupDiv.className = "my-4 text-center";
      const createGroupBtn = document.createElement("span");
      createGroupBtn.className = "text-blue-400 cursor-pointer hover:text-blue-600";
      createGroupBtn.textContent = "Create Group";
      createGroupBtn.onclick = () => {
        shortcutsData.push({ name: "New Group", shortcuts: [] });
        renderShortcuts();
      };
      createGroupDiv.appendChild(createGroupBtn);
      shortcutsContainer.appendChild(createGroupDiv);
    }

    applyShortcutStyles();
  }

  function generateDefaultShortcutsData() {
    return [
      {
        name: "Social Media",
        shortcuts: [
          { title: "Gmail", icon: "fa-envelope fas", color: "#EA4335", link: "gmail.com" },
          { title: "Twitter", icon: "fa-twitter fab", color: "#1DA1F2", link: "twitter.com" },
          { title: "Reddit", icon: "fa-reddit fab", color: "#FF4500", link: "reddit.com" }
        ]
      },
      {
        name: "Dev Tools",
        shortcuts: [
          { title: "GitHub", icon: "fa-github fab", color: "#333", link: "github.com" },
          { title: "Stack Overflow", icon: "fa-stack-overflow fab", color: "#F48024", link: "stackoverflow.com" },
          { title: "MDN", icon: "fa-book fas", color: "#0C7792", link: "developer.mozilla.org" }
        ]
      },
      {
        name: "Productivity",
        shortcuts: [
          { title: "Google Drive", icon: "fa-google fab", color: "#4285F4", link: "drive.google.com" },
          { title: "Trello", icon: "fa-rectangle-list fas", color: "#0079BF", link: "trello.com" },
          { title: "Notion", icon: "fa-database fas", color: "#000", link: "notion.so" }
        ]
      }
    ];
  }
  
  function moveGroup(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= shortcutsData.length) return;
    const [moved] = shortcutsData.splice(index, 1);
    shortcutsData.splice(newIndex, 0, moved);
    renderShortcuts();
  }
  
  async function loadSettingsFromStorage() {
    if(await storageEmpty()) {
      console.warn("storage is empty");
      loadSettingsFromVars();
    } else {
      try {
        const colors = await storageGet("themeColors");
        const loadSettings = await storageGet("settings");
        const data = await storageGet("shortcutsData");

        console.log("Loaded settings from storage:", { colors, loadSettings, data });
        
        loadSettingsFromVars(colors.themeColors, loadSettings.settings, data.shortcutsData);
  
        loadAllBackups();
      } catch (error) {
        console.error("Error loading sync settings:", error);
      }
    }
  }

  // Load stored colors if available
  async function loadSettingsFromFile(file) {
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);

      loadSettingsFromVars(parsed.themeColors, parsed.settings, parsed.shortcutsData);
      saveSettingsToStorage();
    } catch (error) {
      console.error("Error loading settings:", error);
      getUserConfirmation("Failed to load settings. Make sure it's a valid GroxicHomepage.json file.");
    }
  }

  // Load stored colors if available
  async function loadSettingsFromVars(themeColors, settings, inShortcutData) {
    headerBgColorPicker.value = themeColors?.headerBg || "#1F2937";
    headerTextColorPicker.value = themeColors?.headerText || "#FFFFFF";
    leftBgColorPicker.value = themeColors?.leftBg || "#1F2937";
    leftTextColorPicker.value = themeColors?.leftText || "#FFFFFF";
    centerBgColorPicker.value = themeColors?.centerBg || "#1F2937";
    centerTextColorPicker.value = themeColors?.centerText || "#FFFFFF";
    rightBgColorPicker.value = themeColors?.rightBg || "#1F2937";
    rightTextColorPicker.value = themeColors?.rightText || "#FFFFFF";

    shortcutIconSizeControl.value = settings?.shortcutIconSize ?? 32;
    shortcutTextSizeControl.value = settings?.shortcutTextSize ?? 14;
    shortcutPadXControl.value = settings?.shortcutPadX ?? 40;
    shortcutPadYControl.value = settings?.shortcutPadY ?? 12;
    shortcutMarginXControl.value = settings?.shortcutMarginX ?? 12;
    shortcutMarginYControl.value = settings?.shortcutMarginY ?? 12;
    shortcutTextColorControl.value = settings?.shortcutTextColor || '#ffffff';
    shortcutIconRadiusControl.value = settings?.shortcutIconRadius ?? 12;

    groupTextSizeControl.value = settings?.groupTextSize ?? 16;
    groupDividerColorControl.value = settings?.groupDividerColor || '#666666';

    cacheDurationInput.value = settings?.cacheDuration ?? 10; // Default to 5 minutes

    if (settings?.useThemeOverrides === undefined) {
      useThemeOverrides = true;
    } else {
      useThemeOverrides = !!settings.useThemeOverrides;
    }
    useThemeOverridesCheckbox.checked = useThemeOverrides;

    useTwoEmails = !!settings?.useTwoEmails;
    useTwoEmailsCheckbox.checked = useTwoEmails;

    gps = [settings?.gps?.lat ?? -31.9522, settings?.gps?.lng ?? 115.8614];

    gpsLatInput.value = gps[0];
    gpsLngInput.value = gps[1];
  
    if(inShortcutData) {
      shortcutsData = inShortcutData;
    } else {
      // If shortcuts cannot be loaded, populate with fake entries
      shortcutsData = generateDefaultShortcutsData();
    }

    shortcutsEditMode = false;
    preEditShortcutsData = null;

    renderShortcuts();

    updateLastRefreshedDisplay();
    applyShortcutStyles();
    updateColors(); // Apply loaded colors
  }

  async function saveSettingsToStorage() {
    const tempSaveData = getSaveSettingsData();
    let shouldSave = true;
    if(tempSaveData.themeColors == null || tempSaveData.themeColors == undefined || tempSaveData.themeColors == {}) {
      shouldSave = false;
      console.error("Theme colors are invalid");
    }
    if(tempSaveData.settings == null || tempSaveData.settings == undefined || tempSaveData.settings == {}) {
      shouldSave = false;
      console.error("Settings are invalid");
    }
    if(tempSaveData.shortcutsData == null || tempSaveData.shortcutsData == undefined || tempSaveData.shortcutsData == {}) {
      shouldSave = false;
      console.error("Shortcuts Data is invalid");
    }

    if (!shouldSave) {
      const confirm = await getUserConfirmation(
        'One or more settings are invalid. Do you want to save anyway?',
        ["Yes", "No"]
      );

      if (confirm === 0) {
        shouldSave = true;
      } else {
        // Do nothing!
        console.log('Thing was not saved to the database.');
      }
    }
    
    if(shouldSave) {    
      storageSetNoKey(tempSaveData);
    }
  }

  // Save colors to browser storage sync
  function saveSettingsToFile() {
    const tempSaveData = getSaveSettingsData();
    const blob = new Blob([JSON.stringify(tempSaveData, null, 2)] , {
      type: "application/json"
    });
  
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "GroxicHomepage.json";
    link.click();
  
    URL.revokeObjectURL(link.href);
  }

  async function loadAllBackups() {
    const result = await storageGet("backup");
    backupList = Object.entries(result.backup || {}).map(([key, val]) => ({ ...val, index: key }));
    
    renderBackupList();
  }

  async function saveSettingsToBackup(name) {
    const timestamp = Date.now();
    const key = Date.now().toString();
    const newBackup = { name, timestamp, data : getSaveSettingsData() };
    const result = await storageGet("backup");
    const backup = result.backup || {};

    backup[key] = newBackup;
    await storageSet("backup", backup);
    await loadAllBackups(); // Refresh list
  }

  async function deleteSettingsBackupAt(index) {
    const result = await storageGet("backup");
    const backup = result.backup || {};
    delete backup[index];
    await storageSet("backup", backup);
    await loadAllBackups();
  }

  async function loadSettingsFromBackup(index) {
    const result = await storageGet("backup");
    const backup = result.backup?.[index].data;
    if (!backup) return;

    loadSettingsFromVars(backup.themeColors, backup.settings, backup.shortcutsData);
  }

  // Save colors to browser storage sync
  function getSaveSettingsData() {
    const themeColors = {
      headerBg: headerBgColorPicker.value,
      headerText: headerTextColorPicker.value,
      leftBg: leftBgColorPicker.value,
      leftText: leftTextColorPicker.value,
      centerBg: centerBgColorPicker.value,
      centerText: centerTextColorPicker.value,
      rightBg: rightBgColorPicker.value,
      rightText: rightTextColorPicker.value
    };
    const settings = {
      shortcutIconSize: parseInt(shortcutIconSizeControl.value, 10) ?? 32,
      shortcutTextSize: parseInt(shortcutTextSizeControl.value, 10) ?? 14,
      shortcutPadX: parseInt(shortcutPadXControl.value, 10) ?? 12,
      shortcutPadY: parseInt(shortcutPadYControl.value, 10) ?? 12,
      shortcutMarginX: parseInt(shortcutMarginXControl.value, 10) ?? 12,
      shortcutMarginY: parseInt(shortcutMarginYControl.value, 10) ?? 12,
      shortcutTextColor: shortcutTextColorControl.value || '#ffffff',
      shortcutIconRadius: parseInt(shortcutIconRadiusControl.value, 10) ?? 12,

      groupTextSize: parseInt(groupTextSizeControl.value, 10) ?? 16,
      groupDividerColor: groupDividerColorControl.value || '#666666',

      cacheDuration: parseInt(cacheDurationInput.value, 10) ?? 10,
      useThemeOverrides: !!useThemeOverridesCheckbox.checked,
      useTwoEmails: !!useTwoEmailsCheckbox.checked
    }

    // shortcutsData is already in the correct format and a global variable

    return {themeColors, settings, shortcutsData};
  }

  function updateCollapseStates() {
    if (leftCollapsed) {
      leftColumn.style.marginLeft = `-${leftColumn.offsetWidth + 5}px`; // Apply margin:
      collapseHandleLeft.style.rotate = "180deg";
    } else {
      leftColumn.style.marginLeft = `0`; // Apply margin:
      collapseHandleLeft.style.rotate = "0deg";
    }

    if (rightCollapsed) {
      rightColumn.style.marginRight = `-${rightColumn.offsetWidth + 5}px`; // Apply margin:
      collapseHandleRight.style.rotate = "180deg";
    } else {
      rightColumn.style.marginRight = `0`; // Slide back
      collapseHandleRight.style.rotate = "0deg";
    }
  }

  // Update colors based on user selection
  function updateColors() {
    setCssVariable("--header-bg-color-user", headerBgColorPicker.value);
    setCssVariable("--header-text-color-user", headerTextColorPicker.value);

    setCssVariable("--left-bg-color-user", leftBgColorPicker.value);
    setCssVariable("--left-text-color-user", leftTextColorPicker.value);

    setCssVariable("--center-bg-color-user", centerBgColorPicker.value);
    setCssVariable("--center-text-color-user", centerTextColorPicker.value);

    setCssVariable("--right-bg-color-user", rightBgColorPicker.value);
    setCssVariable("--right-text-color-user", rightTextColorPicker.value);
    setCssVariable("--right-text-color-secondary-user", rightTextColorPicker.value + "80");

    if(useThemeOverrides) {
      setCssVariable("--header-bg-color", "var(--header-bg-color-override)");
      setCssVariable("--header-text-color", "var(--header-text-color-override)");

      setCssVariable("--left-bg-color", "var(--left-bg-color-override)");
      setCssVariable("--left-text-color", "var(--left-text-color-override)");

      setCssVariable("--center-bg-color", "var(--center-bg-color-override)");
      setCssVariable("--center-text-color", "var(--center-text-color-override)");

      setCssVariable("--right-bg-color", "var(--right-bg-color-override)");
      setCssVariable("--right-text-color", "var(--right-text-color-override)");
      setCssVariable("--right-text-color-secondary", "var(--right-text-color-secondary-override)");
    } else {
      setCssVariable("--header-bg-color", "var(--header-bg-color-user)");
      setCssVariable("--header-text-color", "var(--header-text-color-user)");

      setCssVariable("--left-bg-color", "var(--left-bg-color-user)");
      setCssVariable("--left-text-color", "var(--left-text-color-user)");

      setCssVariable("--center-bg-color", "var(--center-bg-color-user)");
      setCssVariable("--center-text-color", "var(--center-text-color-user)");

      setCssVariable("--right-bg-color", "var(--right-bg-color-user)");
      setCssVariable("--right-text-color", "var(--right-text-color-user)");
      setCssVariable("--right-text-color-secondary", "var(--right-text-color-secondary-user)");
    }
  }
  
  // Cache management functions
  async function getCacheDuration() {
    var cacheDuration = 5; // default 5 minutes
    try {
      const loadSettings = await storageGet("settings");
      const settings = loadSettings.settings || {}
      
      cacheDuration = settings.cacheDuration;
    }
    catch (error) {
      console.warn("Error retrieving cache duration from settings:", error);
    }

    return cacheDuration * 60 * 1000; // Convert minutes to milliseconds, default 5 minutes
  }

  async function isCacheValid(cacheKey) {
    const cache = localStorage.getItem(cacheKey);
    if (!cache) return false;
    try {
      const casheDuration = await getCacheDuration()
      if(casheDuration == 0) {
        return false;
      }      
      const { timestamp } = JSON.parse(cache);

      return Date.now() - timestamp < casheDuration;
    } catch (error) {
      console.error(`Error parsing cache for ${cacheKey}:`, error);
      return false;
    }
  }

  async function getCachedData(cacheKey) {
    if (await isCacheValid(cacheKey)) {
      const cache = JSON.parse(localStorage.getItem(cacheKey));
      return cache.data;
    }
    return null;
  }

  async function storageGet(key) {
    try {
      if (!DEMO_MODE) {
        const result = await browser.storage.sync.get(key);
        return result || {};
      } else {
        // Always prefer the centralized `settings` blob in static mode.
        // The modern format stores the data under { saveData: { themeColors, settings, shortcutsData } }
        // Older format stored those keys at the top level of the blob.

        // If somebody stored a per-key item separately, return it (backcompat).
        const perItem = localStorage.getItem(key);
        if (perItem !== null) {
          try {
            return { [key]: JSON.parse(perItem) };
          } catch (e) {
            console.error(`Error parsing localStorage item for ${key}:`, e);
            return { [key]: undefined };
          }
        }

        // Centralized blob is now stored under 'saveData' in localStorage.
        // Keep backward compatibility with older 'settings' blob.
        const settingsBlob = localStorage.getItem('saveData');
        if (settingsBlob !== null) {
          try {
            const parsed = JSON.parse(settingsBlob);
            const top = parsed && parsed.saveData ? parsed.saveData : parsed || {};

            if (Object.prototype.hasOwnProperty.call(top, key)) {
              return { [key]: top[key] };
            }
          } catch (e) {
            console.error('Error parsing settings blob:', e);
          }
        }

        // Not found — mirror browser.storage.get behavior by returning an object
        return { [key]: undefined };
      }
    } catch (error) {
      console.error(`Error getting ${key} from storage:`, error);
      return null;
    }
  }

  async function storageSetNoKey(value) {
    console.log("Attempting to save to storage:", value);
    if (!DEMO_MODE) {
      await browser.storage.sync.set(value);
      return value;
    } else {
      // In static mode, always work with the centralized saveData blob
      try {
        // Read the existing saveData from localStorage
        let saveData = JSON.parse(localStorage.getItem('saveData') || '{}');

        // Merge the new value into saveData
        Object.assign(saveData, value);

        // Write the entire updated saveData back to localStorage
        localStorage.setItem('saveData', JSON.stringify(saveData));
        return saveData;
      } catch (e) {
        console.error('Error setting static storage item:', e);
      }
    }
  }

  async function storageSet(key, value) {
    try {
      if (!DEMO_MODE) {
        const obj = { [key]: value };
        await browser.storage.sync.set(obj);
        return obj;
      } else {
        // In static mode, always work with the centralized saveData blob
        try {
          // Read the existing saveData from localStorage
          const blob = localStorage.getItem('saveData');
          let currentData = {};
          if (blob !== null) {
            try {
              currentData = JSON.parse(blob) || {};
            } catch (e) {
              console.error('Error parsing existing saveData blob:', e);
              currentData = {};
            }
          }

          // Merge the new key-value pair into the existing data
          const updatedData = Object.assign({}, currentData, { [key]: value });

          // Write the entire updated blob back to localStorage
          localStorage.setItem('saveData', JSON.stringify(updatedData));
          return { [key]: value };
        } catch (e) {
          console.error('Error setting static storage item:', e);
          return null;
        }
      }
    } catch (error) {
      console.error(`Error setting ${key} in storage:`, error);
      return null;
    }
  }

  async function storageRemove(keys) {
    try {
      if (!DEMO_MODE) {
        // Mirror browser.storage.sync.remove API
        const keysArray = Array.isArray(keys) ? keys : [keys];
        await browser.storage.sync.remove(keysArray);
        return true;
      } else {
        // In static mode, remove keys from the saveData blob
        try {
          const blob = localStorage.getItem('saveData');
          let currentData = {};
          if (blob !== null) {
            try {
              currentData = JSON.parse(blob) || {};
            } catch (e) {
              console.error('Error parsing existing saveData blob:', e);
              return false;
            }
          }

          // Remove the specified keys
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach(key => {
            delete currentData[key];
          });

          // Write the updated blob back to localStorage
          localStorage.setItem('saveData', JSON.stringify(currentData));
          return true;
        } catch (e) {
          console.error('Error removing from static storage:', e);
          return false;
        }
      }
    } catch (error) {
      console.error(`Error removing keys from storage:`, error);
      return false;
    }
  }

  async function storageEmpty() {
    try {
      if (!DEMO_MODE) {
        const result = await browser.storage.sync.getBytesInUse();
        return (result === 0);
      } else {
        const item = localStorage.getItem('saveData');
        return (item === null);
      }
    } catch (error) {
      console.error("Error checking if storage is empty:", error);
      return true; // Assume empty on error
    }
  }

  async function setCachedData(cacheKey, data, timestamp = Date.now()) {
    const cache = {
      timestamp,
      data
    };

    localStorage.setItem(cacheKey, JSON.stringify(cache));
    localStorage.setItem("lastUpdate", cache.timestamp);
  }

  async function buildGoogleAuthUrl() {
    const redirectUri = browser.identity.getRedirectURL();
    const challenge = await generateCodeChallenge(pkce_verifier);
    
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SCOPES,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  
  function buildMicrosoftAuthUrl() {
    // const redirectUri = browser.identity.getRedirectURL();
    
    // const params = new URLSearchParams({
    //   client_id: CLIENT_ID,
    //   response_type: 'token',
    //   redirect_uri: redirectUri,
    //   scope: SCOPES,
    //   include_granted_scopes: 'true',
    //   width: 600,
    //   height: 400,
    //   include_granted_scopes: 'true',
    //   prompt: 'consent'
    // });
    // return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // 2) Launch the flow and extract the `access_token` from the redirect URL
  async function getAccessToken() {
    const authUrl = await buildGoogleAuthUrl();

    const redirectResponse = await browser.identity.launchWebAuthFlow({
      interactive: true,
      url: authUrl
    });
  
    const urlParams = new URL(redirectResponse).searchParams;

    const code = urlParams.get("code");
    if (!code) throw new Error("No auth code returned");

  
    const tokenData = await browser.runtime.sendMessage({
      type: "exchangeAuthCode",
      code
    });
  
    const newExpiry = Date.now() + tokenData.expiresIn * 1000;
  
    return {
      token: tokenData.token,
      refreshToken: tokenData.refreshToken,
      expiry: newExpiry
    };
  }

  function getStoredToken(which = 1) {
    const tokenString = localStorage.getItem(`google_token_${which}`);
    return JSON.parse(tokenString);
  }

  function setStoredToken(tokenInfo, which = 1) {
    localStorage.setItem(`google_token_${which}`, JSON.stringify(tokenInfo));
  }

  // 3) Fetch and cache a token, or reuse if stored
  async function ensureToken(which = 1, force = false, silentOnly = false) {
    let tokenInfo = getStoredToken(which);
  
    if (!tokenInfo || tokenInfo.expiry <= Date.now() || force) {
      if (tokenInfo?.refreshToken) {
        try {
          const refreshed = await browser.runtime.sendMessage({
            type: "refreshToken",
            refreshToken: tokenInfo.refreshToken
          });
  
          tokenInfo = {
            ...tokenInfo,
            token: refreshed.token,
            expiry: Date.now() + refreshed.expiresIn * 1000
          };
          setStoredToken(tokenInfo, which);
          return tokenInfo;
        } catch (e) {
          console.warn("Failed to refresh token", e);
          localStorage.removeItem(`google_token_${which}`);
        }
      }
  
      if (!silentOnly) {
        try {
          tokenInfo = await getAccessToken();
          setStoredToken(tokenInfo, which);
          return tokenInfo;
        } catch (e) {
          console.warn("User has not logged in yet or declined login.", e);
          return null;
        }
      }
  
      return null; // no refreshToken and silentOnly prevents prompting
    }
  
    return tokenInfo;
  }

  async function getBasicResponse(url) {
    const response = await fetch(url.toString());

    if (response.status === 401) {
      console.warn('Token is still invalid after retry, giving up');
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async function getBasicResponseWithCache(url, cacheType) {
    const cachedData = await getCachedData(cacheType);

    if (cachedData) {
      console.log(`Using cached response for ${cacheType}`);
      return cachedData;
    }

    console.log(`Waiting for a response for ${cacheType}`);
    const result = await getBasicResponse(url);
    setCachedData(cacheType, result);

    return result;
  }

  async function getTokenedResponse(url, which, cacheType, retryAttempted = false) {
    const cachedData = await getCachedData(cacheType);
    
    if (cachedData) {
      console.log("Using cached response");
      return cachedData;
    }

    console.log("Waiting for a response");

    let tokenInfo = await ensureToken(which);
    if (!tokenInfo) {
      console.warn(`No token available for account ${which}`);
      return null;
    }
    
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tokenInfo.token}` }
    });

    if (response.status === 401 && !retryAttempted) {
      console.warn('Token is invalid or expired, attempting to refresh token once');
      localStorage.removeItem(`google_token_${which}`);
      // Retry with force=true to trigger login flow
      token = await ensureToken(which, true);
      if (!token) {
        console.warn(`Failed to obtain new token for ${which}`);
        return null;
      }
      // Recursive call with retryAttempted=true to prevent further retries
      return await getTokenedResponse(url, which, cacheType, true);
    }

    if (response.status === 401) {
      console.warn('Token is still invalid after retry, giving up');
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const respJSON = await response.json();
    
    setCachedData(cacheType, respJSON);
    updateLastRefreshedDisplay();

    return respJSON;
  }

  async function fetchBinData(){
    try {
      // ADDRINFOURL is found in privateVars as it can contain sensetive info
      let binDays;
      if (DEMO_MODE) {
        binDays = generateFakeBinData();
      } else {
        result = await getBasicResponseWithCache(ADDRINFOURL, CACHE.BIN_INFO);

        binDays = {
          FOGO: result.data.BinDayFOGOFormatted,
          General: result.data.BinDayGeneralWasteFormatted,
          Recycling: result.data.BinDayRecyclingFormatted
        };
      }

      if (binDays.FOGO == "0001-01-01T00:00:00" || binDays.General == "0001-01-01T00:00:00"  || binDays.Recycling == "0001-01-01T00:00:00" ) {
        console.warn("Bin days data is corrupted or not available");
      } else {        
        renderBinDays(binDays);
      }
    } catch (error) {
      console.error("Failed to fetch address info:", error);
    }
  }

  function renderBinDays(binDays) {
    const binDaysContainer = document.getElementById(`bin-days`);
    const binImg = document.getElementById(`bin-main-img`);
    const binText = document.getElementById(`bin-days-text`);
    const binTextGeneral = document.getElementById(`bin-days-textlong-general`);
    const binTextRecycling = document.getElementById(`bin-days-textlong-recycling`);
    const binTextFOGO = document.getElementById(`bin-days-textlong-fogo`);
    const binLong = document.getElementById(`bin-long`);

    const fogoDateTime = new Date(binDays.FOGO);
    const genWasteDateTime = new Date(binDays.General);
    const recycleDateTime = new Date(binDays.Recycling);

    const genWasteStr = genWasteDateTime.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    const recyclingStr = recycleDateTime.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })

    binDaysContainer.classList.remove('bins-disabled');

    var today = new Date().setHours(0, 0, 0, 0); // Reset time to midnight for comparison
    var tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1); // Get tomorrow's date

    if (DEMO_MODE) {
      binImg.classList.add('bin-general');
      binText.innerHTML = "Put out the bins! (Not realy, this is just a demo)";
    } else if(genWasteDateTime<recycleDateTime) {
      binImg.classList.add('bin-general');
      if(today == genWasteDateTime.setHours(0, 0, 0, 0)) {
        binText.innerHTML = "Today";
      } else if(tomorrow.getTime() == genWasteDateTime.setHours(0, 0, 0, 0)) {
        binText.innerHTML = "Put out the bins!";
      } else {
        binText.innerHTML = genWasteStr;
      }
    } else {
      binImg.classList.add('bin-recycling');
      binLong.classList.add('flex-row-reverse');

      if (today == recycleDateTime.setHours(0, 0, 0, 0)) {
        binText.innerHTML = "Today";
      } else if (tomorrow.getTime() == recycleDateTime.setHours(0, 0, 0, 0)) {
        binText.innerHTML = "Put out the bins!";
      } else {
        binText.innerHTML = recyclingStr;
      }
    }

    binTextGeneral.innerHTML = genWasteDateTime.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    binTextRecycling.innerHTML = recycleDateTime.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }

  function authGoogleClicked() {
    authDropdown.classList.add("hidden");
    refreshSidebars(true);
  }

  function authMicrosoftClicked() {
    
  }

  function initializeAccountSignInButtons(notLoggedIn) {
    const signInForceContainers = document.querySelectorAll("[data-accountsigninforce]");
    
    signInForceContainers.forEach(container => {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      if (DEMO_MODE) {
        createFakeAccountSignInButtons(container);
      } else {
        createAccountSignInButtons(container);
      }
    });

    if(notLoggedIn) {
      const signInContainers = document.querySelectorAll("[data-accountsignin]");

      signInContainers.forEach(container => {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        if (DEMO_MODE) {
          createFakeAccountSignInButtons(container);
        } else {
          createAccountSignInButtons(container);
        }
      });
    }
  }

  function createAccountSignInButtons(container) {
    const wrapper = document.createElement("div");
    if (isPrivateWindow) {
      wrapper.innerHTML = `👻`;
      wrapper.className = "flex justify-center items-center h-full text-4xl";
    } else {
      wrapper.innerHTML = getGoogleSignInButtonHTML();

      // Optional: Attach event handler here (instead of inline in HTML)
      const button = wrapper.querySelector("button");
      if (button && !isPrivateWindow) {
        button.addEventListener("click", () => {
          authGoogleClicked();
        });
      }
    }

    container.appendChild(wrapper);
  }

  function getGoogleSignInButtonHTML() {
    return `
      <button class="m-auto flex items-center justify-center bg-[#4285F4] text-white rounded shadow gap-3 hover:bg-[#357ae8] transition">
        <div class="gsi-material-button-content-wrapper bg-white p-2 rounded">
          <div class="w-6">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" xmlns:xlink="http://www.w3.org/1999/xlink" style="display: block;">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
          </div>
        </div>
        <span class="text-sm font-medium pl-1 pr-4">Sign in with Google</span>
      </button>
    `;
  }
  
  // 4) Example: fetch unread Gmail snippets for account “which”
  async function fetchEmails(which) {
    const url = new URL('https://www.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.append('labelIds', 'UNREAD');
    url.searchParams.append('labelIds', 'INBOX');
    url.searchParams.append('maxResults', '5');

    let resp;
    if (DEMO_MODE) {
      // Generate fake email data for static page mode
      const fakeEmails = generateFakeEmails();
      resp = {
        messages: fakeEmails.map(email => ({ id: email.id }))
      };
    } else {
      resp = await getTokenedResponse(url, which, `${CACHE.EMAIL}_${which}`);
    }
    
    // render the results
    const emailLoading = document.getElementById(`email-loading`);
    
    if (emailLoading) {
      emailLoading.remove();
    }
    // 2) Grab (or create) the container for this account
    const container = document.getElementById('email-list');
    let section = container.querySelector(`#emails-${which}`);

    if (!section) {
      section = document.createElement('div');
      section.id = `emails-${which}`;
      section.classList.add("sidepanel-container");
      let emailName = which === 1 ? 'Personal' : 'Professional';

      section.innerHTML = `
        <a class="email-name" href="https://mail.google.com/mail/u/${which-1}/#inbox">✉️ ${emailName}</a>
        <ul class="email-msg-list"></ul>
      `;

      if (which === 1) {
        container.insertBefore(section, container.firstChild);
      } else {
        container.appendChild(section);
      }
    }
    const ul = section.querySelector('ul');
    ul.innerHTML = '';  // clear out old items

    // 3) If there are no messages, show a placeholder
    if (!resp.messages || resp.messages.length === 0) {
      ul.innerHTML = '<li class="email-msg-entry email-msg-alert">No unread messages.</li>';
      return;
    }

    // 4) For each message ID, fetch its snippet and append a <li>
    let i = 0;
    for (const msg of resp.messages) {
      const msgUrl = `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?fields=payload`;
      let msgResp;
      let isNew = false;

      if (DEMO_MODE) {
        // Use fake email data for static page mode
        const fakeEmails = generateFakeEmails();
        msgResp = {
          payload: {
            headers: [
              { name: 'From', value: `${fakeEmails[i].from} <${fakeEmails[i].email}>` },
              { name: 'Subject', value: fakeEmails[i].subject },
              { name: 'Date', value: fakeEmails[i].date.toISOString() }
            ]
          }
        };        
      } else {
        msgResp = await getTokenedResponse(msgUrl, which, `${CACHE.EMAIL_MSG}_${which}_${i}`);
      }
      
      const msgFromCombined = msgResp.payload.headers.find(h => h.name === 'From');
      const msgSubject = msgResp.payload.headers.find(h => h.name === 'Subject');
      const today = new Date().setHours(0, 0, 0, 0);
      const msgDate = new Date(msgResp.payload.headers.find(h => h.name === 'Date').value);
      let msgDateDisplay = "";

      msgFromName = msgFromCombined.value.split('<')[0].trim();
      msgFromEmail = msgFromCombined.value.split('<')[1]?.split('>')[0]?.trim();

      if(msgFromName.length === 0) {
        msgFromName = msgFromEmail;
      }

      if(today === new Date(msgDate).setHours(0, 0, 0, 0)) {
        msgDateDisplay = msgDate.toLocaleString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        isNew = true;
      } else {
        msgDateDisplay = msgDate.toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit'
        });
      }

      const li = document.createElement('li');
      li.classList.add('email-msg-entry');
      if(isNew) {
        li.classList.add('email-msg-entry-new');
      }
      li.innerHTML = `
        <div class="email-msg-from">
          <span class="email-msg-from-name" title="${msgFromEmail}">${msgFromName}</span><span class="email-msg-date">${msgDateDisplay}</span>
        </div>
        <span class="email-msg-subject">${msgSubject.value}</span>
      `;
      ul.appendChild(li);
      i++;
    }
  }

  async function fetchTasks() {
    const tasksContainer = document.getElementById('tasks-list');
    tasksContainer.innerHTML = ''; // Clear previous entries
  
    const url = new URL('https://www.googleapis.com/tasks/v1/lists/@default/tasks');
    url.searchParams.append('maxResults', '100');
  
    let rawTasks;
    if (DEMO_MODE) {
      // Use fake task data for static page mode
      rawTasks = generateFakeTasks();
    } else {
      rawTasks = await getTokenedResponse(url, 1, CACHE.TASKS);
    }  
  
    const items = rawTasks.items || [];
  
    // 1. Build a map of tasks by ID
    const taskMap = new Map();
    items.forEach(task => {
      task.children = [];
      taskMap.set(task.id, task);
    });
  
    // 2. Organize into hierarchy
    const rootTasks = [];
    items.forEach(task => {
      if (task.parent) {
        const parent = taskMap.get(task.parent);
        if (parent) {
          parent.children.push(task);
        } else {
          rootTasks.push(task); // orphaned
        }
      } else {
        rootTasks.push(task);
      }
    });
  
    // 3. Sort tasks (and subtasks) by position
    function sortTasks(taskList) {
      taskList.sort((a, b) => a.position.localeCompare(b.position));
      taskList.forEach(task => sortTasks(task.children));
    }
  
    sortTasks(rootTasks);
  
    // 4. Format due date and determine color
    function renderDueDate(due) {
      if (!due) return '';
      const dueDate = new Date(due);
      const now = new Date();
      const diffDays = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
  
      let dueClass = 'later';
      if (diffDays < 0) dueClass = 'now';
      else if (diffDays <= 3) dueClass = 'soon';
      else if (diffDays <= 7) dueClass = 'week';
      else if (diffDays <= 30) dueClass = 'month';
      
      let formatted;
      if(diffDays == 0) {
        formatted = 'Today';
      } else if (diffDays > 0 && diffDays < 6) {
        formatted = `${dueDate.toLocaleDateString('en-US', { weekday: 'short' })}`;
      } else {
        const day = dueDate.getDate().toString().padStart(2, '0');
        const month = (dueDate.getMonth() + 1).toString().padStart(2, '0');
        const year = dueDate.getFullYear().toString().slice(-2);

        const isThisYear = dueDate.getFullYear() === now.getFullYear();
        const passedDue = diffDays < 0 ? ` ${Math.abs(diffDays)} days ago` : '';

        formatted = isThisYear ? `${day}-${month} ${passedDue}` : `${day}-${month}-${year} ${passedDue}`;
      }

      return `<span class="task-due task-due-${dueClass}">${formatted}</span>`;
    }
  
    // 5. Recursive render function
    function renderTask(task) {
      const li = document.createElement('li');
      li.className = `task-entry ${task.status === 'completed' ? 'task-completed' : ''}`;
  
      li.innerHTML = `
        <span class="task-title">${task.title}</span>
        ${task.due ? renderDueDate(task.due) : ''}
        ${task.notes ? `<div class="task-details">${task.notes}</div>` : ''}
      `;
  
      if (task.children.length > 0) {
        const sublist = document.createElement('ul');
        sublist.classList.add('subtask-list');
        task.children.forEach(child => {
          sublist.appendChild(renderTask(child));
        });
        li.appendChild(sublist);
      }
  
      return li;
    }
  
    // 6. Render root tasks
    if (rootTasks.length === 0) {
      tasksContainer.innerHTML = '<li class="task-entry task-empty">No tasks found.</li>';
      return;
    }
  
    rootTasks.forEach(task => {
      tasksContainer.appendChild(renderTask(task));
    });
  }  

  async function fetchCalendar() {
    const eventsContainer = document.getElementById("calendar-events");
    const calendarGrid = document.getElementById("calendar-grid");
    const calendarHeader = document.getElementById("calendar-header");
  
    eventsContainer.innerHTML = "<li>Loading events...</li>";
    calendarGrid.innerHTML = "";
  
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const nextMonth = (thisMonth + 1) % 12;
    const nextMonthYear = thisMonth === 11 ? thisYear + 1 : thisYear;
  
    const startTime = new Date(thisYear, thisMonth, 1).toISOString();
    const endTime = new Date(nextMonthYear, nextMonth + 1, 1).toISOString();
  
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.append("timeMin", startTime);
    url.searchParams.append("timeMax", endTime);
    url.searchParams.append("singleEvents", "true");
    url.searchParams.append("orderBy", "startTime");
    url.searchParams.append("maxResults", "250");

    let resp = null;
    if (DEMO_MODE) {
      // Generate fake calendar data for static page mode
      resp = { items: generateFakeCalendarEvents() };
    } else {
      resp = await getTokenedResponse(url, 1, CACHE.CALENDAR);
    }
  
    // Render top 5 upcoming events
    eventsContainer.innerHTML = "";
  
    // Create expanded event list for calendar grid (spanning multi-day events)
    const allEvents = [];
    let upcomingFound = 0;

    const today = new Date();

    resp.items.forEach(ev => {
      const isAllDay = !!ev.start.date;
      const start = new Date(ev.start.dateTime || ev.start.date);
      const end = new Date(ev.end?.dateTime || ev.end?.date || start);
      const summary = ev.summary || "(No title)";

      if(end > today && upcomingFound < 5) {
        const now = new Date();
        const diffDays = Math.floor((start - now) / (1000 * 60 * 60 * 24));
        
        let dateTime;

        if (diffDays < 6) {
          dateTime = `${start.toLocaleDateString('en-US', { weekday: 'short' })}`;
        } else {
          dateTime = `${start.getDate().toString().padStart(2, "0")}-${(start.getMonth() + 1).toString().padStart(2, "0")}`;
        }

        if(!isAllDay) {
          dateTime += ` ` + start.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
        }
  
        const li = document.createElement("li");
        li.className = "calendar-event-entry p-2 my-1 rounded-xl";
        li.innerHTML = `<span class="calendar-event-time">${dateTime}</span> <span class="calendar-event-title">${
          ev.summary || "(Untitled Event)"
        }</span>`;
        eventsContainer.appendChild(li);
        upcomingFound++;
      }

      allEvents.push({
        startDate: start,
        endDate: end,
        summary,
        isMultiDay: isAllDay && end > start
      });
    });
  
    initInteractiveCalendar(thisMonth, thisYear, allEvents);
  }
  
  // [FIXME] Calendar for next month had indicator on the 10th June when event is 9th June??
  function initInteractiveCalendar(currentMonth, currentYear, events) {
    const calendarGrid = document.getElementById("calendar-grid");
    const calendarHeader = document.getElementById("calendar-header");
  
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
  
    function renderCalendar(month, year) {
      calendarGrid.innerHTML = "";

      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      const labelRow = document.createElement("div");
      labelRow.className = "grid grid-cols-7 text-xs text-center font-semibold opacity-50 px-2 mb-1";

      dayLabels.forEach(day => {
        const label = document.createElement("div");
        label.textContent = day;
        labelRow.appendChild(label);
      });

      // Insert this above the grid
      calendarGrid.appendChild(labelRow);
  
      const today = new Date();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const prevMonthDays = new Date(year, month, 0).getDate();
  
      const isOutsideLoadedMonths =
        month !== today.getMonth() && !(month === (today.getMonth() + 1) % 12 && year === (month === 0 ? today.getFullYear() + 1 : today.getFullYear()));
  
      calendarHeader.innerHTML = `<div id="calendar-top" class="rounded-t-xl flex justify-between items-center py-2">
        <button id="calendar-prev" class="px-10">⮜</button>
        <a href="https://calendar.google.com">${monthNames[month]} ${year}${
          isOutsideLoadedMonths ? '<span title="Events not loaded for this month"> ⚠️</span>' : ''
        }</a>
        <button id="calendar-next" class="px-10">⮞</button>
      </div>`;
  
      const calendarTop = document.getElementById("calendar-top");
      calendarTop.querySelector("#calendar-prev").onclick = () => navigate(-1);
      calendarTop.querySelector("#calendar-next").onclick = () => navigate(1);
  
      const grid = document.createElement("div");
      grid.className = "calendar-grid rounded-b-xl grid grid-cols-7 gap-1 p-2";
  
      // Pad initial empty cells with previous month's dates
      const daysBefore = firstDay;
      for (let i = daysBefore - 1; i >= 0; i--) {
        const pad = document.createElement("div");
        pad.className = "calendar-cell day-outside-month";
        pad.textContent = prevMonthDays - i;
        grid.appendChild(pad);
      }
  
      for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement("div");
        const thisDate = new Date(year, month, day);
        const isToday = thisDate.toDateString() === today.toDateString();
  
        cell.className = `calendar-cell text-center p-2 rounded ${isToday ? 'day-today' : ''}`;
        cell.textContent = day;
  
        const dotContainer = document.createElement("div");
        dotContainer.className = "flex justify-center gap-1 mt-1";
  
        cell.appendChild(dotContainer);
        grid.appendChild(cell);
      }

      const barsRendered = new Set(); // To prevent duplicate bars

      events.forEach(event => {
        const { startDate, endDate, summary } = event;

        // Check if the event overlaps with this calendar view
        const startInMonth = startDate.getFullYear() === year && startDate.getMonth() === month;
        const endInMonth = endDate.getFullYear() === year && endDate.getMonth() === month;

        // Skip if the event is completely outside this month
        if (!startInMonth && !endInMonth) return;

        const startDay = startInMonth ? startDate.getDate() : 1;
        const endDay = endInMonth ? endDate.getDate() : daysInMonth;

        const startCellIndex = daysBefore + startDay - 1;
        const endCellIndex = daysBefore + endDay - 1;

        // Safety check
        if (startCellIndex >= grid.children.length) return;

        const cell = grid.children[startCellIndex];
        if (!cell) return;

        const spanDays = Math.min(endDay - startDay + 1, 7 - (startCellIndex % 7));

        const bar = document.createElement("div");
        bar.className = "absolute h-1 bg-blue-400 rounded";
        bar.title = summary;
        bar.style.left = "2px";
        bar.style.right = "2px";
        bar.style.top = "90%";
        bar.style.width = "100%";
        bar.style.gridColumn = `span ${spanDays}`;

        cell.style.position = "relative";
        cell.appendChild(bar);
      });
  
      const totalCells = daysBefore + daysInMonth;
      const needsTrailing = totalCells % 7 !== 0;
      const trailingDays = needsTrailing ? 7 - (totalCells % 7) : 0;

      for (let i = 1; i <= trailingDays; i++) {
        const pad = document.createElement("div");
        pad.className = "calendar-cell day-outside-month opacity-50";
        pad.textContent = i;
        grid.appendChild(pad);
      }
  
      calendarGrid.appendChild(grid);
    }
  
    function navigate(delta) {
      currentMonth += delta;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderCalendar(currentMonth, currentYear);
    }
  
    renderCalendar(currentMonth, currentYear);
  }
  
  function updateLastRefreshedDisplay() {
    const lastUpdated = localStorage.getItem('lastUpdate');
    
    if(lastUpdated == null || lastUpdated === "Never") {
      lastUpdatedDisplay.textContent = "Never";
    } else {
      const timeDiff = Math.floor((Date.now() - lastUpdated) / (1000 * 60));
      
      if(timeDiff < 1) {
        lastUpdatedDisplay.textContent = "less than 1 min";
      } else if(timeDiff == 1) {
        lastUpdatedDisplay.textContent = `1 min`;
      } else {
        lastUpdatedDisplay.textContent = `${timeDiff} mins`;
      }
    }
  }

  // Initial function to load data when the new tab opens
  async function init() {
    versionDisplay.textContent = `v${VERSION}`;

    leftCollapsed = localStorage.getItem("leftColumnCollapsed") === "true";
    rightCollapsed = localStorage.getItem("rightColumnCollapsed") === "true";
    
    updateCollapseStates();

    if (DEMO_MODE) {
      isPrivateWindow = false;
    } else {
      isPrivateWindow = await checkPrivateWindow();
    }

    checkAndApplyWindowTheme();
    
    // Load colors on startup
    await loadSettingsFromStorage();

    refreshHeader();
    refreshSidebars();

    setTimeout(() => {
      leftColumn.classList.add("duration-300");
      rightColumn.classList.add("duration-300");
      content.classList.remove("opacity-0");
    }, 50);   
    
    if (DEMO_MODE) {
      const settingsObj = await storageGet("settings");
      const shortcutsDataObj = await storageGet("shortcutsData");

      if (settingsObj.settings === undefined && shortcutsDataObj.shortcutsData === undefined) {
        const confirm = await getUserConfirmation(
          'Welcome to the demo mode of my new tab page!\n' +
          'In this mode, emails, tasks, calendar events and bin dates are generated examples and not connected to any real accounts.\n\n' +
          'However the weather, date, settings and shortcuts are all functional so you can get a feel for how the page will work when fully set up.\n\n' + 
          'Settings are stored in your browsers local storage so feel free to customize the page and refresh to see how settings persist but keep in mind it will not work in incognito.\n\n',
          ["I understand, show me the demo!"]
        );
      }
    }
  }

  async function refreshHeader() {
    setInterval(updateLastRefreshedDisplay, 60000);
    const dateDisplay = new Date(Date.now()).toLocaleString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    headerDate.innerHTML = `
      <span class="font-semibold mx-1">
        ${dateDisplay}
      </span>`;

    const weatherInfo = await getBasicResponseWithCache(WEATHER_API + `&latitude=${gps[0]}&longitude=${gps[1]}`, CACHE.WEATHER);

    if (weatherInfo) {
      const weatherToday = todayWeather(weatherInfo);

      headerWeather.innerHTML = 
        `<img class="weather-icon h-6 w-6 mx-1 object-fit" src=${weatherToday.code.icon}>
        <span class="font-semibold mx-1 mr-4">
          ${weatherToday.code.description}
        </span>
        <span class="font-semibold mx-1">
          ${weatherToday.temp}°C
        </span>
        <div class="min-max-display mx-1 text-xs text-(--header-text-override)/80">
          <span class="temp-min border-b border-(--header-text-override)/90">
            ${weatherToday.minTemp}°C
          </span>
          <span class="temp-max">
            ${weatherToday.maxTemp}°C
          </span>
        </div>`;
    }
  }

  function todayWeather(weatherInfo) {
    const code = wmoCode(weatherInfo.current.weather_code);

    const temp = weatherInfo.current.temperature_2m;
    const minTemp = weatherInfo.daily.temperature_2m_min[0];
    const maxTemp = weatherInfo.daily.temperature_2m_max[0];

    const rain = weatherInfo.daily.precipitation_probability_max[0];
    const uv = weatherInfo.daily.uv_index_max[0];

    return {code, temp, minTemp, maxTemp, rain, uv};
  }

  function wmoCode(code) {
    if (code !== undefined) {
      return WMO_CODES[code];
    }
    return {
      description: '',
      icon: ''
    };
  }

  // [FIXME] add mode cachekey types and delete them properly
  async function refreshSidebars(force = false) {
    if (DEMO_MODE) {
      refreshSidebarsDemoMode(force);
      return;
    }

    if(force) {
      for (const cacheKeyType in CACHE) {
        const cacheKey = CACHE[cacheKeyType]
        if(cacheKey === "email_msg") {
          for(let i = 0; i < 5; i++) {
            for(let ii = 1; ii <= 2; ii++) {
              localStorage.removeItem(`${cacheKey}_${ii}_${i}`);
            }
          }
        } else if(cacheKey === "email" || cacheKey === "google_token" ) {
          for(let i = 1; i <= 2; i++) {
            localStorage.removeItem(`${cacheKey}_${i}`);
          }
        } else {
          localStorage.removeItem(cacheKey);
        }
      }
    }

    const token1 = await ensureToken(1, false, !force);
    const token2 = useTwoEmails ? await ensureToken(2, false, !force) : null;

    if (token1) {
      fetchEmails(1);
      fetchTasks();
      fetchCalendar();
    } else {
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      initInteractiveCalendar(thisMonth, thisYear, []);
    }
    if (useTwoEmails && token2) {
      fetchEmails(2);
    }

    const notLoggedIn = !(token1 || token2);
    initializeAccountSignInButtons(notLoggedIn);

    fetchBinData();
  }

  async function refreshSidebarsDemoMode(force = false) {
    fetchEmails(1);
    fetchTasks();
    fetchCalendar();

    initializeAccountSignInButtons(false);

    fetchBinData();
  }

  function getUserConfirmation(promptText, options = ["Ok"]) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "fixed inset-0 bg-black/50 flex items-center justify-center z-50";
  
      const box = document.createElement("div");
      box.className = "bg-gray-800 text-white p-6 rounded-lg shadow-lg max-w-md w-full";
      box.innerHTML = `<div class="mb-4 whitespace-pre-wrap">${promptText}</div>`;
  
      const buttonRow = document.createElement("div");
      buttonRow.className = "flex justify-end gap-2";
  
      options.forEach((opt, i) => {
        const btn = document.createElement("button");
        if (typeof opt === "string") {
          btn.textContent = opt;
          btn.className = "bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded";
        } else {
          const [label, color] = Object.entries(opt)[0];
          btn.textContent = label;
          btn.style.backgroundColor = color;
          btn.className = "px-4 py-2 rounded";
        }
        btn.onclick = () => {
          document.body.removeChild(modal);
          resolve(i);
        };
        buttonRow.appendChild(btn);
      });
  
      box.appendChild(buttonRow);
      modal.appendChild(box);
      document.body.appendChild(modal);
    });
  }

  userConfirmation = getUserConfirmation;

  // function setCssVariable(variable, value) {
  //   document.documentElement.style.setProperty(variable, value);
  // }

  init();
});
