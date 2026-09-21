// Mandarin Runway service worker — caches the whole app so it works with no
// network at all (subway, airplane mode, anywhere). Cache-first for everything
// this app owns; the app itself never makes network requests after load except
// to fetch the Google Fonts stylesheet/files once (also cached below) and, only
// when you're online, the optional speech-recognition feature in Shadowing.

var CACHE_NAME = "mandarin-runway-v3";
var CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./hanzi-writer.min.js",
  "./hanzi-stroke-data-hsk1.js",
  "./hanzi-stroke-data-hsk2.js",
  "./hanzi-stroke-data-hsk3.js"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(CORE_ASSETS);
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.filter(function(n){ return n!==CACHE_NAME; }).map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event){
  if(event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function(cached){
      if(cached) return cached;
      return fetch(event.request).then(function(resp){
        // Opportunistically cache same-origin assets and the Google Fonts files
        // so the next load (even offline) has them too.
        var url = event.request.url;
        var isFonts = url.indexOf("fonts.googleapis.com")!==-1 || url.indexOf("fonts.gstatic.com")!==-1;
        if(resp && resp.status===200 && (isFonts || url.indexOf(self.location.origin)===0)){
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return resp;
      }).catch(function(){
        // Offline and not cached yet — for navigations, fall back to the cached app shell.
        if(event.request.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
