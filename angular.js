var _ = require('lodash');

function Scope() {
  this.$$watchers = [];
  this.$$asyncQueue = [];
  this.$$applyAsyncQueue = [];
  this.$$postDigestQueue = [];
  this.$$phase = null;
  this.$$lastDirtyWatch = null;
  this.$$applyAsyncId = null;
}

function initWatchVal() { }

Scope.prototype.$beginPhase = function(phase) {
  if (this.$$phase) {
    throw this.$$phase + ' already in progress.';
  }
  this.$$phase = phase;
};

Scope.prototype.$clearPhase = function() {
  this.$$phase = null;
};

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
  var self = this;
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function() { },
    valueEq: !!valueEq,
    last: initWatchVal
  };
  self.$$watchers.push(watcher);
  this.$$lastDirtyWatch = null;
  return function() {
    var index = self.$$watchers.indexOf(watcher);
    if (index >= 0) {
      self.$$watchers.splice(index, 1);
    }
  };
};

Scope.prototype.$watchGroup = function(watchFns, listenerFn) { 
  var self = this; 
  var oldValues = new Array(watchFns.length); 
  var newValues = new Array(watchFns.length); 
  var changeReactionScheduled = false; 
  var firstRun = true; 
  if (watchFns.length === 0) {
     var shouldCall = true; 
     self.$evalAsync(function() { 
       if (shouldCall) { 
         listenerFn(newValues, newValues, self); 
       } 
     });
     return function()
     { 
       shouldCall = false; 
     }; 
   } 
   function watchGroupListener() {
     if (firstRun) { 
       firstRun = false; 
       listenerFn(newValues, newValues, self); 
     } else { 
       listenerFn(newValues, oldValues, self); 
     } 
     changeReactionScheduled = false; 
   } 
   var destroyFunctions = _.map(watchFns, function(watchFn, i) { 
     return self.$watch(watchFn, function(newValue, oldValue) { 
       newValues[i] = newValue; 
       oldValues[i] = oldValue; 
       if (!changeReactionScheduled) { 
         changeReactionScheduled = true; 
         self.$evalAsync(watchGroupListener); 
       } 
     }); 
   }); 
   return function() { 
     _.forEach(destroyFunctions, function(destroyFunction) { 
       destroyFunction(); 
     }); 
   }; 
};


Scope.prototype.$applyAsync = function(expr) { 

    var self = this; 
    self.$$applyAsyncQueue.push(function() { 
        self.$eval(expr); 
    }); 
    if (self.$$applyAsyncId === null) { 
      self.$$applyAsyncId = setTimeout(function() { 
         self.$apply(_.bind(self.$$flushApplyAsync, self)); 
      }, 0); 
    } 
};

Scope.prototype.$$flushApplyAsync = function() { 
  while (this.$$applyAsyncQueue.length) { 
    this.$$applyAsyncQueue.shift()(); 
  } 
  this.$$applyAsyncId = null; 
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
  if (valueEq) {
    return _.isEqual(newValue, oldValue);
  } else {
    return newValue === oldValue ||
      (typeof newValue === 'number' && typeof oldValue === 'number' &&
       isNaN(newValue) && isNaN(oldValue));
  }
};

Scope.prototype.$$digestOnce = function() {
  var self  = this;
  var dirty;
  _.forEach(this.$$watchers, function(watch) {
    try {
      var newValue = watch.watchFn(self);
      var oldValue = watch.last;
      if (!self.$$areEqual(newValue, oldValue, watch.valueEq)) {
        self.$$lastDirtyWatch = watcher;
        watcher.listenerFn(newValue, 
             (oldValue === initWatchVal ? newValue : oldValue),
              self);
        dirty = true;
      } else if (self.$$lastDirtyWatch === watcher) { 
         return false; 
      }
      watch.last = (watch.valueEq ? _.cloneDeep(newValue) : newValue);
    } catch (e) {
      (console.error || console.log)(e);
    }
  });
  return dirty;
};

Scope.prototype.$digest = function() {
  var ttl = 10;
  var dirty;
  this.$$lastDirtyWatch = null;
  this.$beginPhase("$digest");
  if (this.$$applyAsyncId) { 
    clearTimeout(this.$$applyAsyncId); 
    this.$$flushApplyAsync(); 
  }
  do {
    while (this.$$asyncQueue.length) {
      try {
        var asyncTask = this.$$asyncQueue.shift();
        this.$eval(asyncTask.expression);
      } catch (e) {
        (console.error || console.log)(e);
      }
    }
    dirty = this.$$digestOnce();
    if (dirty || this.$$asyncQueue.length && !(ttl--)) {
      this.$clearPhase();
      throw "10 digest iterations reached";
    }
  } while (dirty || this.$$asyncQueue.length);
  this.$clearPhase();

  while (this.$$postDigestQueue.length) {
    try {
      this.$$postDigestQueue.shift()();
    } catch (e) {
      (console.error || console.log)(e);
    }
  }
};

Scope.prototype.$eval = function(expr, locals) {
  return expr(this, locals);
};

Scope.prototype.$apply = function(expr) {
  try {
    this.$beginPhase("$apply");
    return this.$eval(expr);
  } finally {
    this.$clearPhase();
    this.$digest();
  }
};

Scope.prototype.$evalAsync = function(expr) {
  var self = this;
  if (!self.$$phase && !self.$$asyncQueue.length) {
    setTimeout(function() {
      if (self.$$asyncQueue.length) {
        self.$digest();
      }
    }, 0);
  }
  self.$$asyncQueue.push({scope: self, expression: expr});
};

Scope.prototype.$$postDigest = function(fn) {
  this.$$postDigestQueue.push(fn);
};


/////////////////////////////////////////////////////

var $scope = new Scope();