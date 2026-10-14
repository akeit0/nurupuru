// Runs before CSS is loaded, avoiding a flash of the wrong theme.
(() => {
  try {
    const theme = localStorage.getItem('nurupuru-theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch {}
})();
