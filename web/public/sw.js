// Service worker: makes the app installable to the home screen and shows the
// morning check-in reminder notifications. Deliberately does no caching, so
// the installed app always loads the latest version from the server.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Pass-through: always go to the network. Only page loads get a fallback.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#0b0c0f;color:#e9eaee;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px">You\'re offline. Connect to the internet and reopen the app.</body>',
          { headers: { "Content-Type": "text/html" } },
        ),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Morning check-in", body: "Log your readiness for today.", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // keep defaults
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "morning-checkin", // a newer reminder replaces an older one
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
