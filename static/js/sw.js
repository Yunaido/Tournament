/* Service Worker for Web Push Notifications — OP TCG Tournament */

self.addEventListener("push", function (event) {
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { title: "OP TCG Tournament", body: event.data.text() };
    }

    const title = data.title || "OP TCG Tournament";
    const options = {
        body: data.body || "",
        icon: "/static/img/favicon-32x32.png",
        badge: "/static/img/favicon-32x32.png",
        data: { url: data.url || "/" },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";
    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.indexOf(url) !== -1 && "focus" in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
