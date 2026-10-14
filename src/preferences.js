export function readPreference(name) {
  try {
    return localStorage.getItem(`nurupuru-${name}`);
  } catch {
    return null;
  }
}

export function writePreference(name, value) {
  try {
    localStorage.setItem(`nurupuru-${name}`, value);
  } catch {
    // The app also works when storage is unavailable (e.g. a local HTML file).
  }
}
