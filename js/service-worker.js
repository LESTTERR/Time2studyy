self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open("planner-cache").then((cache) =>
      cache.addAll([
        "./",
        "./index.html",
        "./style.css",
        "./script.js",
        "./manifest.json",
        "./logo.png",
        "./home.html",
        "./classes.html",
        "./gome.css",
        "./add-class.html",
        "./add-task.html",
        "./login.html",
        "./nav.js",
        "./profile.html",
        "./register.html",
        "./tasks.html",
      ])
    )
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
