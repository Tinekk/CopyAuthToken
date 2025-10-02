const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cryptoKey = null;
let sessionSalt = null;

async function initCrypto() {
  if (cryptoKey) return cryptoKey;

  // Check if we already have a salt in session storage
  const result = await chrome.storage.session.get("sessionSalt");
  if (result.sessionSalt) {
    // Restore salt from storage
    sessionSalt = Uint8Array.from(atob(result.sessionSalt), c => c.charCodeAt(0));
  } else {
    // Generate new salt and store it
    sessionSalt = crypto.getRandomValues(new Uint8Array(16));
    await chrome.storage.session.set({
      sessionSalt: btoa(String.fromCharCode(...sessionSalt))
    });
  }

  // Import the key from the salt
  const rawKey = await crypto.subtle.importKey(
    "raw",
    sessionSalt,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );

  cryptoKey = rawKey;
  return cryptoKey;
}

async function encryptHeader(header) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await initCrypto();

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(header)
  );

  return btoa(
    String.fromCharCode(...iv) +
    String.fromCharCode(...new Uint8Array(encrypted))
  );
}

async function decryptHeader(data) {
  try {
    const raw = atob(data);
    const iv = Uint8Array.from(raw.slice(0, 12), c => c.charCodeAt(0));
    const encrypted = Uint8Array.from(raw.slice(12), c => c.charCodeAt(0));
    const key = await initCrypto();

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );

    return decoder.decode(decrypted);
  } catch (e) {
    console.warn("Decryption failed:", e);
    return null;
  }
}

const tabLastHeaders = {};
const tabHostnames = {};

function updateTabHostname(tabId, url) {
  try {
    const hostname = new URL(url).hostname;
    tabHostnames[tabId] = hostname;
  } catch (_) {}
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    updateTabHostname(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab.url) updateTabHostname(tabId, tab.url);
  });
});

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (!details.requestHeaders || typeof details.tabId !== "number" || details.tabId < 0) return;

    const authHeader = details.requestHeaders.find(
      (h) => h.name && h.name.toLowerCase() === "authorization"
    );
    if (!authHeader) return;

    const reqHost = new URL(details.url).hostname;
    const tabHost = tabHostnames[details.tabId];
    if (!tabHost || reqHost !== tabHost) return;

    const key = "h_" + details.tabId;
    encryptHeader(authHeader.value).then((encrypted) => {
      chrome.storage.session.set({ [key]: encrypted });
    });

    tabLastHeaders[details.tabId] = authHeader.value;
  },
  {
    urls: ["<all_urls>"],
    types: ["xmlhttprequest"]
  },
  ["requestHeaders", "extraHeaders"]
);

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabLastHeaders[tabId];
  delete tabHostnames[tabId];
  chrome.storage.session.remove("h_" + tabId);
});

async function readPersistedHeader(tabId) {
  const key = "h_" + tabId;
  const result = await chrome.storage.session.get(key);
  if (!result[key]) return null;
  return await decryptHeader(result[key]);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getLastAuthHeader") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ header: null });
        return;
      }

      let header = tabLastHeaders[tab.id];
      if (!header) {
        header = await readPersistedHeader(tab.id);
      }

      sendResponse({ header: header || null });
    });

    return true;
  }
});
