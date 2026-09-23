// Mandarin Runway service worker — caches the whole app so it works with no
// network at all (subway, airplane mode, anywhere).
//
// Strategy: index.html (and "./") is served NETWORK-FIRST, falling back to
// the cache only when offline. This app ships as a single evolving HTML
// file with no build hash in its filename, so a pure cache-first strategy
// (the old approach) meant anyone who had ever loaded the app would keep
// seeing the exact version they first cached, forever, even after new
// content was uploaded to GitHub Pages and even across a bumped
// CACHE_NAME — because the browser only re-checks a service worker's own
// script for byte-level changes, and a content-only edit to index.html
// doesn't touch sw.js unless someone remembers to bump this file too.
// Network-first for the shell fixes that at the root: every load while
// online gets the current index.html, no manual cache-busting required
// ever again, while still falling back to the last-cached copy offline.
// Everything else (large, rarely-changing binary/data assets — icons,
// hanzi stroke data, worksheets, the CC-CEDICT dictionary) stays
// CACHE-FIRST, since those are big, don't change often, and cache-first
// is what makes them instantly available offline without a network
// round-trip on every load.

var CACHE_NAME = "mandarin-runway-v7";
var NETWORK_FIRST = ["./", "./index.html"];
var CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./hanzi-writer.min.js",
  "./hanzi-stroke-data-hsk1.js",
  "./hanzi-stroke-data-hsk2.js",
  "./hanzi-stroke-data-hsk3.js",
  "./worksheet-hsk1.pdf",
  "./worksheet-hsk2.pdf",
  "./worksheet-hsk3.pdf",
  "./cedict-data.js",
  "./cedict-LICENSE.txt"
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

function isNetworkFirstUrl(url){
  for(var i=0;i<NETWORK_FIRST.length;i++){
    var abs = new URL(NETWORK_FIRST[i], self.location.href).href;
    if(url === abs) return true;
  }
  return false;
}

self.addEventListener("fetch", function(event){
  if(event.request.method !== "GET") return;

  // The app shell (index.html / "./") is always fetched fresh first, so a
  // new deploy shows up on the very next load while online. A navigation
  // request (typing the URL, opening a link, a plain reload) is treated
  // the same way even if its exact URL isn't in NETWORK_FIRST, since that's
  // always the shell being requested.
  if(isNetworkFirstUrl(event.request.url) || event.request.mode === "navigate"){
    event.respondWith(
      fetch(event.request).then(function(resp){
        if(resp && resp.status===200){
          // Two independent clones: one stored under this exact request
          // (handles "./" vs "./index.html" as distinct cache keys), one
          // always also stored under "./index.html" specifically, since
          // that's the fixed key the offline fallback below looks up.
          var copyForRequest = resp.clone();
          var copyForShellKey = resp.clone();
          caches.open(CACHE_NAME).then(function(cache){
            cache.put(event.request, copyForRequest);
            cache.put("./index.html", copyForShellKey);
          });
        }
        return resp;
      }).catch(function(){
        // Offline (or the request failed) — fall back to the last cached shell.
        return caches.match(event.request).then(function(cached){
          return cached || caches.match("./index.html");
        });
      })
    );
    return;
  }

  // Everything else: cache-first, since these are large, rarely-changing
  // static assets where instant offline availability matters more than
  // catching every edit immediately.
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
