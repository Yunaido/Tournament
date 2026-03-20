/**
 * Passkey (WebAuthn) support for the login page.
 * Shows the passkey login button if the browser supports WebAuthn.
 */
(function () {
    "use strict";

    // Only show passkey section if WebAuthn is available
    if (!window.PublicKeyCredential) return;

    const section = document.getElementById("passkey-section");
    if (section) section.style.display = "";

    // ── Passkey registration (profile page) ──────────────────────
    const registerBtn = document.getElementById("passkey-register-btn");
    if (registerBtn) {
        registerBtn.addEventListener("click", async function () {
            const statusDiv = document.getElementById("passkey-reg-status");
            try {
                const beginRes = await fetch("/accounts/passkey/register/begin/", {
                    method: "POST",
                    headers: {
                        "X-CSRFToken": getCSRFToken(),
                        "Content-Type": "application/json",
                    },
                });
                if (!beginRes.ok) throw new Error("Failed to start registration.");
                const options = await beginRes.json();

                options.challenge = base64urlToBuffer(options.challenge);
                options.user.id = base64urlToBuffer(options.user.id);
                if (options.excludeCredentials) {
                    options.excludeCredentials = options.excludeCredentials.map(function (c) {
                        return { ...c, id: base64urlToBuffer(c.id) };
                    });
                }

                const credential = await navigator.credentials.create({ publicKey: options });

                const body = {
                    id: credential.id,
                    rawId: bufferToBase64url(credential.rawId),
                    type: credential.type,
                    response: {
                        attestationObject: bufferToBase64url(credential.response.attestationObject),
                        clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
                    },
                };

                const completeRes = await fetch("/accounts/passkey/register/complete/", {
                    method: "POST",
                    headers: {
                        "X-CSRFToken": getCSRFToken(),
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                });
                const result = await completeRes.json();
                if (result.ok) {
                    window.location.reload();
                } else {
                    showStatus(statusDiv, result.error || "Registration failed.");
                }
            } catch (err) {
                if (err.name !== "NotAllowedError") {
                    showStatus(statusDiv, err.message || "Registration failed.");
                }
            }
        });
    }

    const loginBtn = document.getElementById("passkey-login-btn");
    const errorDiv = document.getElementById("passkey-error");
    if (!loginBtn) return;

    loginBtn.addEventListener("click", async function () {
        if (errorDiv) errorDiv.style.display = "none";
        try {
            // Begin authentication
            const beginRes = await fetch("/accounts/login/passkey/begin/", {
                method: "POST",
                headers: {
                    "X-CSRFToken": getCSRFToken(),
                    "Content-Type": "application/json",
                },
            });
            if (!beginRes.ok) throw new Error("Failed to start passkey login.");
            const options = await beginRes.json();

            // Decode challenge
            options.challenge = base64urlToBuffer(options.challenge);
            if (options.allowCredentials) {
                options.allowCredentials = options.allowCredentials.map(function (c) {
                    return { ...c, id: base64urlToBuffer(c.id) };
                });
            }

            const credential = await navigator.credentials.get({ publicKey: options });

            // Complete authentication
            const body = {
                id: credential.id,
                rawId: bufferToBase64url(credential.rawId),
                type: credential.type,
                response: {
                    authenticatorData: bufferToBase64url(credential.response.authenticatorData),
                    clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
                    signature: bufferToBase64url(credential.response.signature),
                    userHandle: credential.response.userHandle
                        ? bufferToBase64url(credential.response.userHandle)
                        : null,
                },
            };

            const completeRes = await fetch("/accounts/login/passkey/complete/", {
                method: "POST",
                headers: {
                    "X-CSRFToken": getCSRFToken(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            const result = await completeRes.json();
            if (result.ok) {
                window.location.href = "/";
            } else {
                showError(result.error || "Passkey login failed.");
            }
        } catch (err) {
            if (err.name !== "NotAllowedError") {
                showError(err.message || "Passkey login failed.");
            }
        }
    });

    // ── Helpers ──────────────────────────────────────────────────
    function getCSRFToken() {
        const cookie = document.cookie.match(/csrftoken=([^;]+)/);
        if (cookie) return cookie[1];
        const input = document.querySelector("[name=csrfmiddlewaretoken]");
        return input ? input.value : "";
    }

    function base64urlToBuffer(base64url) {
        const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
        const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
        const binary = atob(base64 + pad);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    function bufferToBase64url(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    function showError(msg) {
        if (errorDiv) {
            errorDiv.textContent = msg;
            errorDiv.style.display = "";
        }
    }

    function showStatus(container, msg) {
        if (container) {
            container.textContent = "";
            var div = document.createElement("div");
            div.className = "alert alert-danger mt-2";
            div.textContent = msg;
            container.appendChild(div);
        } else {
            alert(msg);
        }
    }
})();
