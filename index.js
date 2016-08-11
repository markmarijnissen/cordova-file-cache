var hash = require('./murmerhash');
var Promise = null;

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
    self.localInternalURL = entry.toInternalURL? entry.toInternalURL(): entry.toURL();
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
          toInternalURL: entry.toInternalURL? entry.toInternalURL(): entry.toURL(),
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

FileCache.prototype.download = function download(onprogress,includeFileProgressEvents){
  var fs = this._fs;
  var self = this;
  includeFileProgressEvents = includeFileProgressEvents || false;
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
      var done = self._downloading.length;
      var total = self._downloading.length + queue.length;
      var percentage = 0;
      var errors = [];

      // download every file in the queue (which is the diff from _added with _cached)
      queue.forEach(function(url){
        var path = self.toPath(url);
        // augment progress event with done/total stats
        var onSingleDownloadProgress = function() {};
        if(typeof onprogress === 'function') {
          onSingleDownloadProgress = function(ev){
            ev.queueIndex = done;
            ev.queueSize = total;
            ev.url = url;
            ev.path = path;
            ev.percentage = done / total;
            if(ev.loaded > 0 && ev.total > 0 && done !== total){
               ev.percentage += (ev.loaded / ev.total) / total;
            }
            ev.percentage = Math.max(percentage,ev.percentage);
            percentage = ev.percentage;
            onprogress(ev);
          };
        }

        // callback
        var onDone = function(){
          done++;
          onSingleDownloadProgress(new ProgressEvent());

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
                reject(errors);
              }
            },reject);
          }
        };
        var onErr = function(err){
          if(err && err.target && err.target.error) err = err.target.error;
          errors.push(err);
          onDone();
        };

        var downloadUrl = url;
        if(self._cacheBuster) downloadUrl += "?"+Date.now();
        var download = fs.download(downloadUrl,path,{retry:self._retry},includeFileProgressEvents? onSingleDownloadProgress: undefined);
        download.then(onDone,onErr);
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
  var path = this.toPath(url);
  if(this._cached[path]) return this._cached[path].toInternalURL;
  return url;
};

FileCache.prototype.get = function get(url){
  var path = this.toPath(url);
  if(this._cached[path]) return this._cached[path].toURL;
  return this.toServerURL(url);
};

FileCache.prototype.toDataURL = function toDataURL(url){
  return this._fs.toDataURL(this.toPath(url));
};

FileCache.prototype.toURL = function toURL(url){
  var path = this.toPath(url);
  return this._cached[path]? this._cached[path].toURL: url;
};

FileCache.prototype.toServerURL = function toServerURL(path){
  var path = this._fs.normalize(path);
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
    url = this._fs.normalize(url || '');
    var len = this.serverRoot.length;
    if(url.substr(0,len) !== this.serverRoot) {
      return this.localRoot + url;
    } else {
      return this.localRoot + url.substr(len);
    }
  } else {
    var ext = url.substr(url.lastIndexOf('.'));
    if ((ext.indexOf("?") > 0) || (ext.indexOf("/") > 0)) {
      ext = ".txt";
    }
    return this.localRoot + hash(url) + ext;
  }
};

module.exports = FileCache;
