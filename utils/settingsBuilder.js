const Settings = [];

/**
 * Creates a self-contained checkbox setting.
 *
 * @param {string} elementId      - The DOM id of the checkbox element.
 * @param {string} settingsKey    - The key for the setting in the settings object.
 * @param {*}      defaultValue   - Value to use when the saved setting is undefined.
 * @param {Function} [onChange]   - Optional extra callback when the checkbox is clicked.
 * @returns {{ load: (savedValue: any) => void, save: () => boolean, value: () => boolean }}
 */
function createCheckboxSetting(elementId, settingsKey, defaultValue = false, onChange = null) {
  const el = document.getElementById(elementId);
  let _value = !!defaultValue;

  el.addEventListener("change", () => {
    _value = el.checked;
    if (onChange) onChange(_value);
  });

  const setting = {
    key: settingsKey,
    control: el,
    load(settings) {
      _value = settings?.[settingsKey] === undefined ? !!defaultValue : !!settings[settingsKey];
      el.checked = _value;
    },
    save(settings) {
      settings[settingsKey] = !!el.checked;
    },
    value() {
      return _value;
    }
  };

  Settings.push(setting);
  return setting;
}

/**
 * Creates a self-contained checkbox setting.
 *
 * @param {string} elementId      - The DOM id of the checkbox element.
 * @param {string} settingsKey    - The key for the setting in the settings object.
 * @param {*}      defaultValue   - Value to use when the saved setting is undefined.
 * @param {Function} [onChange]   - Optional extra callback when the checkbox is clicked.
 * @returns {{ load: (savedValue: any) => void, save: () => boolean, value: () => boolean }}
 */
function createTextSetting(elementId, settingsKey, defaultValue = "", onChange = null) {
  const el = document.getElementById(elementId);

  el.addEventListener("input", () => {
    if (onChange) onChange(el.value);
  });

  const setting = {
    key: settingsKey,
    control: el,
    load(settings) {
      el.value = settings?.[settingsKey] ?? defaultValue;
    },
    save(settings) {
      settings[settingsKey] = el.value;
    },
    value() {
      return el.value;
    }
  };

  Settings.push(setting);
  return setting;
}

function createNumberSetting(elementId, settingsKey, defaultValue = 0, onChange = null) {
  const el = document.getElementById(elementId);

  el.addEventListener("input", () => {
    if (onChange) onChange(parseInt(el.value, 10));
  });

  const setting = {
    key: settingsKey,
    control: el,
    load(settings) {
      el.value = settings?.[settingsKey] ?? defaultValue;
    },
    save(settings) {
      settings[settingsKey] = parseInt(el.value, 10);
    },
    value() {
      return parseInt(el.value, 10);
    }
  };

  Settings.push(setting);
  return setting;
}

const createColorSetting = (elementId, settingsKey, defaultValue, onChange) =>
  createTextSetting(elementId, settingsKey, defaultValue, onChange);

function createDropdownSetting(buttonId, menuId, settingsKey, defaultValue = "", onChange = null) {
  const button = document.getElementById(buttonId);
  const menu = document.getElementById(menuId);
  const options = menu.querySelectorAll("a");
  let _value = defaultValue;

  button.addEventListener("click", () => {
    menu.classList.toggle("hidden");
  });

  window.addEventListener("click", (e) => {
    if (!button.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add("hidden");
    }
  });

  options.forEach(option => {
    option.addEventListener("click", (e) => {
      _value = e.target.getAttribute("data-value");
      button.querySelector("span").textContent = e.target.textContent;
      menu.classList.add("hidden");
      if (onChange) onChange(_value);
    });
  });

  const setting = {
    key: settingsKey,
    control: { button, menu },
    load(settings) {
      _value = settings?.[settingsKey] ?? defaultValue;
      const match = [...options].find(o => o.getAttribute("data-value") === _value);
      if (match) button.querySelector("span").textContent = match.textContent;
    },
    save(settings) {
      settings[settingsKey] = _value;
    },
    value() {
      return _value;
    }
  };

  Settings.push(setting);
  return setting;
}

function createGpsSetting(latId, lngId, settingsKey, defaultLat = 0, defaultLng = 0) {
  const latEl = document.getElementById(latId);
  const lngEl = document.getElementById(lngId);

  const setting = {
    key: settingsKey,
    el: { lat: latEl, lng: lngEl },
    load(settings) {
      latEl.value = settings?.[settingsKey]?.lat ?? defaultLat;
      lngEl.value = settings?.[settingsKey]?.lng ?? defaultLng;
    },
    save(settings) {
      settings[settingsKey] = {
        lat: parseFloat(latEl.value),
        lng: parseFloat(lngEl.value)
      };
    },
    value() {
      return { lat: parseFloat(latEl.value), lng: parseFloat(lngEl.value) };
    }
  };

  Settings.push(setting);
  return setting;
}