const skipKey = "skipCommon";

// Load setting + preview
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get([skipKey], (data) => {
    document.getElementById("skipCommon").checked = !!data[skipKey];
  });
  updatePreview();
});

// Save setting
document.getElementById("skipCommon").addEventListener("change", (e) => {
  chrome.storage.sync.set({ [skipKey]: e.target.checked });
});

// Copy button
document.getElementById("copy").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "getLastAuthHeader" }, ({ header }) => {
    const status = document.getElementById("status");
    if (!header) {
      status.textContent = "No Authorization header found for this tab.";
      return;
    }

    chrome.storage.sync.get([skipKey], (data) => {
      const skip = !!data[skipKey];
      let toCopy = header;

      const lower = header.toLowerCase();
      if (skip) {
        if (lower.startsWith("bearer ")) {
          toCopy = header.slice(7).trim(); // remove "Bearer "
        } else if (lower.startsWith("basic ")) {
          toCopy = header.slice(6).trim(); // remove "Basic "
        }
      }

      navigator.clipboard.writeText(toCopy).then(() => {
        status.textContent = "Copied!";
      }).catch(() => {
        try {
          const ta = document.createElement("textarea");
          ta.value = toCopy;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          status.textContent = "Copied!";
        } catch (e) {
          status.textContent = "Copy failed.";
          console.error("Copy failed:", e);
        }
      });
    });
  });
});

// Show short preview
function updatePreview() {
  chrome.runtime.sendMessage({ type: "getLastAuthHeader" }, ({ header }) => {
    const preview = document.getElementById("preview");
    if (!header) {
      preview.textContent = "(no header yet)";
      return;
    }

    preview.textContent = header.length > 512 ? header.slice(0, 512) + "…" : header;
  });
}
