var CordovaFileCache =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	var hash = __webpack_require__(1);
	var Promise = null;
	var isCordova = typeof cordova !== 'undefined';

	/* Cordova File Cache x */
	function FileCache(options){
	  var self = this;
	  // cordova-promise-fs
	  this._fs = options.fs;
	  if(!this._fs) {
	    throw new Error('Missing required option "fs". Add an instance of cordova-promise-fs.');
	  }
	  // Use Promises from fs.
	  Promise = this._fs.Promise;

	  // 'mirror' mirrors files structure from "serverRoot" to "localRoot"
	  // 'hash' creates a 1-deep filestructure, where the filenames are hashed server urls (with extension)
	  this._mirrorMode = options.mode !== 'hash';
	  this._retry = options.retry || [500,1500,8000];
	  this._cacheBuster = !!options.cacheBuster;

	  // normalize path
	  this.localRoot = this._fs.normalize(options.localRoot || 'data');
	  this.serverRoot = this._fs.normalize(options.serverRoot || '');

	  // set internal variables
	  this._downloading = [];    // download promises
	  this._added = [];          // added files
	  this._cached = {};         // cached files

	  // list existing cache contents
	  this.ready = this._fs.ensure(this.localRoot)
	  .then(function(entry){
	    self.localInternalURL = isCordova? entry.toInternalURL(): entry.toURL();
	    self.localUrl = entry.toURL();
	    return self.list();
	  });
	}

	FileCache.hash = hash;

	/**
	 * Helper to cache all 'internalURL' and 'URL' for quick synchronous access
	 * to the cached files.
	 */
	FileCache.prototype.list = function list(){
	  var self = this;
	  return new Promise(function(resolve,reject){
	    self._fs.list(self.localRoot,'rfe').then(function(entries){
	      self._cached = {};
	      entries = entries.map(function(entry){
	        var fullPath = self._fs.normalize(entry.fullPath);
	        self._cached[fullPath] = {
	          toInternalURL: isCordova? entry.toInternalURL(): entry.toURL(),
	          toURL: entry.toURL(),
	        };
	        return fullPath;
	      });
	      resolve(entries);
	    },function(){
	      resolve([]);
	    });
	  });
	};

	FileCache.prototype.add = function add(urls){
	  if(!urls) urls = [];
	  if(typeof urls === 'string') urls = [urls];
	  var self = this;
	  urls.forEach(function(url){
	    url = self.toServerURL(url);
	    if(self._added.indexOf(url) === -1) {
	      self._added.push(url);
	    }
	  });
	  return self.isDirty();
	};

	FileCache.prototype.remove = function remove(urls,returnPromises){
	  if(!urls) urls = [];
	  var promises = [];
	  if(typeof urls === 'string') urls = [urls];
	  var self = this;
	  urls.forEach(function(url){
	    var index = self._added.indexOf(self.toServerURL(url));
	    if(index >= 0) self._added.splice(index,1);
	    var path = self.toPath(url);
	    promises.push(self._fs.remove(path));
	    delete self._cached[path];
	  });
	  return returnPromises? Promise.all(promises): self.isDirty();
	};

	FileCache.prototype.getDownloadQueue = function(){
	  var self = this;
	  var queue = self._added.filter(function(url){
	    return !self.isCached(url);
	  });
	  return queue;
	};

	FileCache.prototype.getAdded = function() {
	  return this._added;
	};

	FileCache.prototype.isDirty = function isDirty(){
	  return this.getDownloadQueue().length > 0;
	};

	FileCache.prototype.download = function download(onprogress){
	  var fs = this._fs;
	  var self = this;
	  self.abort();

	  return new Promise(function(resolve,reject){
	    // make sure cache directory exists and that
	    // we have retrieved the latest cache contents
	    // to avoid downloading files we already have!
	    fs.ensure(self.localRoot).then(function(){
	      return self.list();
	    }).then(function(){
	      // no dowloads needed, resolve
	      if(!self.isDirty()) {
	        resolve(self);
	        return;
	      }

	      // keep track of number of downloads!
	      var queue = self.getDownloadQueue();
	      var started = [];
	      var index = self._downloading.length;
	      var done = self._downloading.length;
	      var total = self._downloading.length + queue.length;

	      // download every file in the queue (which is the diff from _added with _cached)
	      queue.forEach(function(url){
	        var path = self.toPath(url);
	        // augment progress event with index/total stats
	        var onSingleDownloadProgress;
	        if(typeof onprogress === 'function') {
	          onSingleDownloadProgress = function(ev){
	            ev.queueIndex = index;
	            ev.queueSize = total;
	            ev.url = url;
	            ev.path = path;
	            ev.percentage = index / total;
	            if(ev.loaded > 0 && ev.total > 0 && index !== total){
	               ev.percentage += (ev.loaded / ev.total) / total;
	            }
	            if(started.indexOf(url) < 0) {
	              started.push(url);
	              index++;
	            }
	            onprogress(ev);
	          };
	        }

	        // callback
	        var onDone = function(){
	          done++;
	          // when we're done
	          if(done === total) {
	            // reset downloads
	            self._downloading = [];
	            // check if we got everything
	            self.list().then(function(){
	              // final progress event!
	              if(onSingleDownloadProgress) onSingleDownloadProgress(new ProgressEvent());
	              // Yes, we're not dirty anymore!
	              if(!self.isDirty()) {
	                resolve(self);
	              // Aye, some files got left behind!
	              } else {
	                reject(self.getDownloadQueue());
	              }
	            },reject);
	          }
	        };
	        var downloadUrl = url;
	        if(self._cacheBuster) downloadUrl += "?"+Date.now();
	        var download = fs.download(downloadUrl,path,{retry:self._retry},onSingleDownloadProgress);
	        download.then(onDone,onDone);
	        self._downloading.push(download);
	      });
	    },reject);
	  });
	};

	FileCache.prototype.abort = function abort(){
	  this._downloading.forEach(function(download){
	    download.abort();
	  });
	  this._downloading = [];
	};

	FileCache.prototype.isCached = function isCached(url){
	  url = this.toPath(url);
	  return !!this._cached[url];
	};

	FileCache.prototype.clear = function clear(){
	  var self = this;
	  this._cached = {};
	  return this._fs.removeDir(this.localRoot).then(function(){
	    return self._fs.ensure(self.localRoot);
	  });
	};

	/**
	 * Helpers to output to various formats
	 */
	FileCache.prototype.toInternalURL = function toInternalURL(url){
	  path = this.toPath(url);
	  if(this._cached[path]) return this._cached[path].toInternalURL;
	  return url;
	};

	FileCache.prototype.get = function get(url){
	  path = this.toPath(url);
	  if(this._cached[path]) return this._cached[path].toInternalURL;
	  return this.toServerURL(url);
	};

	FileCache.prototype.toDataURL = function toDataURL(url){
	  return this._fs.toDataURL(this.toPath(url));
	};

	FileCache.prototype.toURL = function toURL(url){
	  path = this.toPath(url);
	  return this._cached[path]? this._cached[path].toURL: url;
	};

	FileCache.prototype.toServerURL = function toServerURL(path){
	  path = this._fs.normalize(path);
	  return path.indexOf('://') < 0? this.serverRoot + path: path;
	};

	/**
	 * Helper to transform remote URL to a local path (for cordova-promise-fs)
	 */
	FileCache.prototype.toPath = function toPath(url){
	  if(this._mirrorMode) {
	    var query = url.indexOf('?');
	    if(query > -1){
	      url = url.substr(0,query);
	    }
	    url = url = this._fs.normalize(url || '');
	    len = this.serverRoot.length;
	    if(url.substr(0,len) !== this.serverRoot) {
	      return this.localRoot + url;
	    } else {
	      return this.localRoot + url.substr(len);
	    }
	  } else {
	    return this.localRoot + hash(url) + url.substr(url.lastIndexOf('.'));
	  }
	};

	module.exports = FileCache;

/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * JS Implementation of MurmurHash3 (r136) (as of May 20, 2011)
	 * 
	 * @author <a href="mailto:gary.court@gmail.com">Gary Court</a>
	 * @see http://github.com/garycourt/murmurhash-js
	 * @author <a href="mailto:aappleby@gmail.com">Austin Appleby</a>
	 * @see http://sites.google.com/site/murmurhash/
	 * 
	 * @param {string} key ASCII only
	 * @param {number} seed Positive integer only
	 * @return {number} 32-bit positive integer hash 
	 */

	function murmurhash3_32_gc(key, seed) {
	  var remainder, bytes, h1, h1b, c1, c1b, c2, c2b, k1, i;
	  
	  remainder = key.length & 3; // key.length % 4
	  bytes = key.length - remainder;
	  h1 = seed;
	  c1 = 0xcc9e2d51;
	  c2 = 0x1b873593;
	  i = 0;
	  
	  while (i < bytes) {
	      k1 = 
	        ((key.charCodeAt(i) & 0xff)) |
	        ((key.charCodeAt(++i) & 0xff) << 8) |
	        ((key.charCodeAt(++i) & 0xff) << 16) |
	        ((key.charCodeAt(++i) & 0xff) << 24);
	    ++i;
	    
	    k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff;
	    k1 = (k1 << 15) | (k1 >>> 17);
	    k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff;

	    h1 ^= k1;
	        h1 = (h1 << 13) | (h1 >>> 19);
	    h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff;
	    h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16));
	  }
	  
	  k1 = 0;
	  
	  switch (remainder) {
	    case 3: k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
	    case 2: k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
	    case 1: k1 ^= (key.charCodeAt(i) & 0xff);
	    
	    k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
	    k1 = (k1 << 15) | (k1 >>> 17);
	    k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
	    h1 ^= k1;
	  }
	  
	  h1 ^= key.length;

	  h1 ^= h1 >>> 16;
	  h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
	  h1 ^= h1 >>> 13;
	  h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff;
	  h1 ^= h1 >>> 16;

	  return h1 >>> 0;
	}

	module.exports = murmurhash3_32_gc;

/***/ }
/******/ ]);