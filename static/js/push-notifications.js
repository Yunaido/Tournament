/* Push Notification subscription management — OP TCG Tournament */
(function () {
    "use strict";

    function getCSRFToken() {
        var cookie = document.cookie.match(/csrftoken=([^;]+)/);
        if (cookie) return cookie[1];
        var input = document.querySelector("[name=csrfmiddlewaretoken]");
        return input ? input.value : "";
    }

    var subscribeBtn = document.getElementById("push-subscribe-btn");
    var unsubscribeBtn = document.getElementById("push-unsubscribe-btn");
    var statusEl = document.getElementById("push-status");

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (statusEl) statusEl.textContent = "Push notifications are not supported in this browser.";
        if (subscribeBtn) subscribeBtn.style.display = "none";
        if (unsubscribeBtn) unsubscribeBtn.style.display = "none";
        return;
    }

    function updateUI(subscription) {
        if (subscription) {
            if (subscribeBtn) subscribeBtn.style.display = "none";
            if (unsubscribeBtn) unsubscribeBtn.style.display = "";
            if (statusEl) statusEl.textContent = "Push notifications are enabled.";
        } else {
            if (subscribeBtn) subscribeBtn.style.display = "";
            if (unsubscribeBtn) unsubscribeBtn.style.display = "none";
            if (statusEl) statusEl.textContent = "Push notifications are disabled.";
        }
    }

    function urlBase64ToUint8Array(base64String) {
        var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
        var raw = window.atob(base64);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) {
            arr[i] = raw.charCodeAt(i);
        }
        return arr;
    }

    navigator.serviceWorker.register("/sw.js").then(function (registration) {
        registration.pushManager.getSubscription().then(function (sub) {
            updateUI(sub);
        });
    });

    if (subscribeBtn) {
        subscribeBtn.addEventListener("click", async function () {
            try {
                var permission = await Notification.requestPermission();
                if (permission !== "granted") {
                    if (statusEl) statusEl.textContent = "Notification permission denied.";
                    return;
                }

                var keyRes = await fetch("/accounts/push/vapid-key/");
                var keyData = await keyRes.json();
                if (!keyData.publicKey) {
                    if (statusEl) statusEl.textContent = "Push not configured on server.";
                    return;
                }

                var registration = await navigator.serviceWorker.ready;
                var subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
                });

                var subJson = subscription.toJSON();
                var res = await fetch("/accounts/push/subscribe/", {
                    method: "POST",
                    headers: {
                        "X-CSRFToken": getCSRFToken(),
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        endpoint: subJson.endpoint,
                        keys: subJson.keys,
                    }),
                });

                if (res.ok) {
                    updateUI(subscription);
                } else {
                    if (statusEl) statusEl.textContent = "Failed to save subscription.";
                }
            } catch (err) {
                console.error("Push subscribe error:", err);
                if (statusEl) statusEl.textContent = "Error enabling notifications.";
            }
        });
    }

    if (unsubscribeBtn) {
        unsubscribeBtn.addEventListener("click", async function () {
            try {
                var registration = await navigator.serviceWorker.ready;
                var subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    var endpoint = subscription.endpoint;
                    await subscription.unsubscribe();

                    await fetch("/accounts/push/unsubscribe/", {
                        method: "POST",
                        headers: {
                            "X-CSRFToken": getCSRFToken(),
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ endpoint: endpoint }),
                    });
                }
                updateUI(null);
            } catch (err) {
                console.error("Push unsubscribe error:", err);
                if (statusEl) statusEl.textContent = "Error disabling notifications.";
            }
        });
    }
})();
