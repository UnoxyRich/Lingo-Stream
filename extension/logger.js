const DEBUG_KEY = 'debug';
const LOGS_KEY = 'debugLogs';
const MAX_LOG_ENTRIES = 200;

function hasStorageApi() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function getLocalStorage(keys) {
  return new Promise((resolve) => {
    if (!hasStorageApi()) {
      resolve({});
      return;
    }

    chrome.storage.local.get(keys, (items) => {
      resolve(items ?? {});
    });
  });
}

function setLocalStorage(items) {
  return new Promise((resolve) => {
    if (!hasStorageApi()) {
      resolve();
      return;
    }

    chrome.storage.local.set(items, () => {
      resolve();
    });
  });
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export async function log(message) {
  if (!hasStorageApi()) {
    return;
  }

  const { [DEBUG_KEY]: debugEnabled = false } = await getLocalStorage([DEBUG_KEY]);
  if (!debugEnabled) {
    return;
  }

  const { [LOGS_KEY]: existingLogs = [] } = await getLocalStorage([LOGS_KEY]);
  const nextLogs = [...existingLogs, `[${formatTimestamp()}] ${message}`].slice(-MAX_LOG_ENTRIES);
  await setLocalStorage({ [LOGS_KEY]: nextLogs });
}

