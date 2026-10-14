export const APP_VERSION = '1.0.0';
export const GITHUB_REPOSITORY = 'https://github.com/akeit0/nurupuru';
export const REPOSITORY_PUBLISHED = true;

export function initAppInfo(t) {
  const version = document.getElementById('appVersion');
  const link = document.getElementById('repositoryLink');
  const status = link.querySelector('small');
  version.textContent = `v${APP_VERSION}`;
  link.href = GITHUB_REPOSITORY;
  function syncLanguage() {
    link.title = t(REPOSITORY_PUBLISHED ? 'GitHubリポジトリ' : 'GitHubリポジトリ（公開準備中）');
    status.textContent = t('準備中');
    status.hidden = REPOSITORY_PUBLISHED;
  }
  syncLanguage();
  return { syncLanguage };
}
