cordova-file-cache
==========
> Super Awesome File Cache for Cordova Apps

Based on [cordova-promise-fs](https://github.com/markmarijnissen/cordova-promise-fs).

## Getting started

```bash
  # fetch code using bower
  bower install cordova-file-cache cordova-promise-fs
  # ...or npm...
  npm install cordova-file-cache cordova-promise-fs
  
  # install Cordova and plugins
  cordova platform add ios@3.7.0
  cordova plugin add org.apache.cordova.file
  cordova plugin add org.apache.cordova.file-transfer # optional
```

**IMPORTANT:** For iOS, use Cordova 3.7.0 or higher (due to a [bug](https://github.com/AppGyver/steroids/issues/534) that affects requestFileSystem).

Or just download and include [CordovaPromiseFS.js](https://raw.githubusercontent.com/markmarijnissen/cordova-promise-fs/master/dist/CordovaPromiseFS.js) and [CordovaFileCache.js](https://raw.githubusercontent.com/markmarijnissen/cordova-file-cache/master/dist/CordovaFileCache.js)

## Usage

### Initialize & configuration
```javascript
// Initialize a Cache
var cache = new CordovaFileCache({
  fs: new CordovaPromiseFS({ // An instance of CordovaPromiseFS is REQUIRED
      Promise: Promise // <-- your favorite Promise lib (REQUIRED)
  }), 
  mode: 'hash', // or 'mirror', optional
  localRoot: 'data', //optional
  serverRoot: 'http://yourserver.com/files/', // optional, required on 'mirror' mode
  cacheBuster: false  // optional
});

cache.ready.then(function(list){
    // Promise when cache is ready.
    // Returns a list of paths on the FileSystem that are cached.
}) 
```

* **CordovaPromiseFS** is **REQUIRED**!
* You need to include a **Promise** library when creating a CordovaPromiseFS. Any library that follows the A+ spec will work. For example: bluebird or promiscuous.
* **mode: "mirror"**: Mirrors the file structure from `serverRoot` at `localRoot`.
* **mode: "hash"**: Filename is hash of server url (plus extension).
* **CordovaPromiseFS()** is an instance of [cordova-promise-fs](https://github.com/markmarijnissen/cordova-promise-fs).
* `cacheBuster` appends a timestamp to the url `?xxxxxx` to avoid the network cache.


### Add files to the cache
```javascript

// First, add files
cache.add('http://yourserver.com/folder/photo1.jpg')
cache.add('folder/photo2.jpg')  // automatically prepends the `severRoot`
cache.add(['photo3.jpg','photo4.jpg'])

// Now the cache is dirty: It needs to download.
cache.isDirty() === true
// cache.add also returns if the cache is dirty.
var dirty = cache.add(['photo3.jpg']) 

// Downloading files. 
// The optional 'onprogress' event handler is enhanced with information
// about the total download queue.
// It is recommended to avoid heavy UI and animation while downloading.
var onprogress = function(e) {
  var progress ="Progress: " 
  + e.queueIndex // current download index 
  + " " 
  + e.queueSize; // total files to download

// Download files. 
cache.download(onprogress).then(function(cache){ ... },function(failedDownloads) { ... }) 

}
```

### Use the cache
```javascript
// Get the cached internalURL of the file: "cdvfile://localhost/persisent/cache/photo3.jpg" 
cache.get('photo3.jpg');           
cache.toInternalURL('photo3.jpg'); 
cache.toInternalURL('http://yourserver.com/photo3.jpg'); 

// Get the file URL of the file: "file://.../photo3.jpg";
cache.toURL('photo3.jpg');

// When file is not cached, the server URL is returned as a fallback.
cache.get('http://yoursever.com/never-cached-this.jpg') === 'http://yoursever.com/never-cached-this.jpg'
cache.get('never-cached-this.jpg') === 'http://yoursever.com/never-cached-this.jpg'

// Get Base64 encoded data URL.
cache.toDataURL('photo3.jpg').then(function(base64){},function(err){});
```

### Other functions
```javascript
// Abort all downloads
cache.abort()

// Clear cache (removes localRoot directory)
cache.clear().then( ... )

// Or remove a single file
cache.remove('photo3.jpg').then( ... )

// Returns path on Cordova Filesystem, i.e. "/cache/photo3.jpg"
cache.toPath('photo3.jpg');      

// Returns server URL to download, i.e. "http://yourserver.com/photo3.jpg";
cache.toServerURL('photo3.jpg'); 

// Needs a download?
cache.isDirty(); 

// Returns a list of server URLs that need to be downloaded.
cache.getDownloadQueue();        

 // Return a list of paths that are cached (i.e. ["/cache/photo3.jpg"])
cache.list().then(function(list){...},function(err){...}) 

```

## Changelog

### 0.12.0 (18/03/2014)

* Export hash function as CordovaFileCache.hash (needed by App Loader)

### 0.11.0 (17/03/2014)

* Update CordovaPromiseFS dependency.
* Fix some errors in README

### 0.10.0 (21/12/2014)

* Update CordovaPromiseFS dependency

### 0.9.0 (21/12/2014)

* Bugfix with cacheBuster

### 0.8.0 (28/11/2014)

* Normalized path everywhere.

### 0.7.0 (27/11/2014)

* Added tests and fixed few minor bugs

### 0.6.0 (19/11/2014)

* Bugfix: changes to "get" and "toInternalURL" methods.
* Bugfix: LocalRoot should NOT start with a slash (Android)

### 0.5.0 (15/11/2014)

* Bugfix: Make sure cache returns a valid server URL if file is not cached.

### 0.4.0 (13/11/2014)

* Added Chrome Support!

### 0.3.0 (09/11/2014)

* Added `cacheBuster` option.

### 0.2.0 (07/11/2014)

* Many small bugfixes
* Upgraded the build process with `webpack`

### 0.1.0 (06/11/2014)

## Contribute

Convert CommonJS to a browser-version:
```bash
npm install webpack -g
npm run-script prepublish
```

Feel free to contribute to this project in any way. The easiest way to support this project is by giving it a star.

## Contact
-   @markmarijnissen
-   http://www.madebymark.nl
-   info@madebymark.nl

© 2014 - Mark Marijnissen
