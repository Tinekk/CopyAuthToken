const skipKey = "skipCommon";
const themeKey = "theme";

document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.sync.get([skipKey, themeKey], (data) => {
        document.getElementById("skipCommon").checked = !!data[skipKey];

        if (data[themeKey] === "dark") {
            document.body.classList.add("dark");
        }
    });
    updatePreview();
});

document.getElementById("themeToggle").addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    chrome.storage.sync.set({ [themeKey]: isDark ? "dark" : "light" });
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
        const jwtLink = document.getElementById("jwtLink");
        jwtLink.innerHTML = "";

        if (!header) {
            preview.textContent = "(no header yet)";
            return;
        }

        // show shortened preview
        preview.textContent = header.length > 512 ? header.slice(0, 512) + "…" : header;

        const lower = header.toLowerCase();
        let token = null;
        if (lower.startsWith("bearer ")) {
            token = header.slice(7).trim();
        } else if (lower.includes(".")) {
            // could be a raw JWT without bearer
            token = header.trim();
        }

        // check if it's likely a JWT (three segments separated by dots)
        if (token && token.split(".").length === 3) {
            const link = document.createElement("a");
            link.textContent = "🔗 Open in jwt.io";
            link.href = "#"; // prevent default
            link.addEventListener("click", (e) => {
            e.preventDefault();

            const warningContainer = document.getElementById("jwtWarning");
            warningContainer.innerHTML =
                "⚠ Opening a JWT in jwt.io can expose it to third parties. " +
                '<button id="jwtOpenBtn" class="decode-btn" style="margin-left:6px;">Open Anyway</button>' +
                '<button class="dismiss-btn">×</button>';
            warningContainer.style.display = "block";

            // handle the "Open Anyway" button
            const openBtn = document.getElementById("jwtOpenBtn");
            openBtn.addEventListener("click", () => {
                window.open(
                "https://jwt.io/#token=" + encodeURIComponent(token),
                "_blank"
                );
                warningContainer.style.display = "none"; // hide after opening
            });

            // handle dismiss button
            const dismissBtn = warningContainer.querySelector(".dismiss-btn");
            dismissBtn.addEventListener("click", () => {
                warningContainer.style.display = "none";
            });
            });
            link.className = "jwt-link";
            jwtLink.appendChild(link);
        }

        const orSpan = document.createElement("span");
        orSpan.textContent = " or ";
        orSpan.className = "jwt-or";
        jwtLink.appendChild(orSpan);


        const decodeBtn = document.createElement("button");
        decodeBtn.textContent = "Decode locally";
        decodeBtn.className = "decode-btn";

        decodeBtn.addEventListener("click", () => {
            const decodedContainer = document.getElementById("jwtDecoded");
            try {
                const parts = token.split(".");
                const decodeBase64 = (str) => {
                    str = str.replace(/-/g, "+").replace(/_/g, "/");
                    const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
                    return JSON.parse(atob(padded));
                };
                const headerObj = decodeBase64(parts[0]);
                const payloadObj = decodeBase64(parts[1]);
                decodedContainer.textContent =
                    "Header:\n" +
                    JSON.stringify(headerObj, null, 2) +
                    "\n\nPayload:\n" +
                    JSON.stringify(payloadObj, null, 2);
            } catch (err) {
                decodedContainer.textContent = "Failed to decode JWT.";
            }
        });
        jwtLink.appendChild(decodeBtn);
    });
}