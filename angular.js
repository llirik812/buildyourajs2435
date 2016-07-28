var _ = require('lodash');

_.mixin({ 
  isArrayLike: function(obj) { 
    if (_.isNull(obj) || _.isUndefined(obj)) { 
      return false; 
    } 
    var length = obj.length; 
    return _.isNumber(length); 
  } 
});

function Scope() {
  this.$$watchers = [];
  this.$$asyncQueue = [];
  this.$$applyAsyncQueue = [];
  this.$$postDigestQueue = [];
  this.$$phase = null; // only $evalAsync sets up phase currently
  this.$$lastDirtyWatch = null;
  this.$$applyAsyncId = null;
  this.$$children = [];
  this.$root = this;
}

Scope.prototype.$new = function(isolated, parent) { 
  var child; 
  parent = parent || this; 
  if (isolated) { 
    child = new Scope(); 
    child.$root = parent.$root; 
    child.$$asyncQueue = parent.$$asyncQueue; 
    child.$$postDigestQueue = parent.$$postDigestQueue; 
    child.$$applyAsyncQueue = parent.$$applyAsyncQueue; 
  } else { 
    var ChildScope = function() { }; 
    ChildScope.prototype = this; 
    child = new ChildScope(); 
  } 
  parent.$$children.push(child); 
  child.$$watchers = []; 
  child.$$children = []; 
  child.$parent = parent;
  return child; 
};

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
  self.$$watchers.unshift(watcher);
  this.$root.$$lastDirtyWatch = null;
  return function() {
    var index = self.$$watchers.indexOf(watcher);
    if (index >= 0) {
      self.$$watchers.splice(index, 1);
      self.$root.$$lastDirtyWatch = null;
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

Scope.prototype.$watchCollection = function(watchFn, listenerFn) { 
  var self = this; 
  var newValue; 
  var oldValue; 
  // Counter. Increments. If incremented, watcher`s listenerFn called then
  var changeCount = 0; 
  var oldLength;
  var internalWatchFn = function(scope) {
    var newLength;
    newValue = watchFn(scope);
    // Do we have an object here as new value?
    if (_.isObject(newValue)) { 
      // Is this object is array-like (array, arguments or DOM) object?
      if (_.isArrayLike(newValue)) {
        // What if this object has just become an array?
        if (!_.isArray(oldValue)) { 
          changeCount++;
	  // Will do compare new value to old as arrays...
          oldValue = []; 
        }
 	/* 
	Now both of them has length attribute 
        despite the fact that the old value could be plain object 
        */
        if (newValue.length !== oldValue.length) { 
          changeCount++; 
          oldValue.length = newValue.length; 
        }
        // Iterate over array alements to see if there any changes
        _.forEach(newValue, function(newItem, i) { 
          var bothNaN = _.isNaN(newItem) && _.isNaN(oldValue[i]); 
          if (!bothNaN && newItem !== oldValue[i]) {
            changeCount++; 
            oldValue[i] = newItem;
          }
        });
      } else /* object is plain object */ { 
        // is previous value was completely different?
        if (!_.isObject(oldValue) || _.isArrayLike(oldValue)) { 
          changeCount++; 
          oldValue = {}; 
          // simulate length property of an array 
          // so we can operate with objects in arrays manner
          oldLength = 0;
        }
        newLength = 0;
	// Iterate over all objects properties
        _.forOwn(newValue, function(newVal, key) { 
	  // Lets count of how much properties this object has
          newLength++;
          if (oldValue.hasOwnProperty(key)) {
            var bothNaN = _.isNaN(newVal) && _.isNaN(oldValue[key]); 
            if (!bothNaN && oldValue[key] !== newVal) { 
              changeCount++; 
              oldValue[key] = newVal; 
            }
          } else { 
            changeCount++; 
            oldLength++; 
            oldValue[key] = newVal; 
          }
        });
	// Do we have some property deleted?
        if (oldLength > newLength) { 
          changeCount++;
          _.forOwn(oldValue, function(oldVal, key) { 
            if (!newValue.hasOwnProperty(key)) { 
              changeCount++;
              oldLength--;
              delete oldValue[key];
            }
          });
        }
      } 
    } else { 
      if (!self.$$areEqual(newValue, oldValue, false)) { 
        changeCount++; 
      } 
      oldValue = newValue; 
    }
    return changeCount; 
  };
  var internalListenerFn = function() { 
    listenerFn(newValue, oldValue, self); 
  }; 
  return this.$watch(internalWatchFn, internalListenerFn); 
};

Scope.prototype.$applyAsync = function(expr) { 
    var self = this;
    self.$$applyAsyncQueue.push(function() { 
        self.$eval(expr); 
    }); 
    if (self.$root.$$applyAsyncId === null) { 
      self.$root.$$applyAsyncId = setTimeout(function() { 
        self.$apply(_.bind(self.$$flushApplyAsync, self)); 
      }, 0); 
    }
};

Scope.prototype.$$flushApplyAsync = function() { 
  while (this.$$applyAsyncQueue.length) { 
    try { 
      this.$$applyAsyncQueue.shift()(); 
    } catch (e) { 
      console.error(e); 
    } 
  } 
  this.$root.$$applyAsyncId = null; 
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

Scope.prototype.$$everyScope = function(fn) { 
  if (fn(this)) {
    return this.$$children.every(function(child) { 
      return child.$$everyScope(fn); 
    }); 
  } else { 
    return false; 
  } 
};

Scope.prototype.$$digestOnce = function() {
  var dirty;
  var continueLoop = true;
  var self = this;
  this.$$everyScope(function(scope) {
    var newValue, oldValue;
    _.forEachRight(scope.$$watchers, function(watcher) {
      try {
        if (watcher) {
          newValue = watcher.watchFn(scope);
          oldValue = watcher.last;
          if (!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
            scope.$root.$$lastDirtyWatch = watcher;
            watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue);
            watcher.listenerFn(newValue,
                (oldValue === initWatchVal ? newValue : oldValue),
                scope);
            dirty = true;
          } else if (scope.$root.$$lastDirtyWatch === watcher) {
            continueLoop = false;
            return false;
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
    return continueLoop;
  });
  return dirty;
};

Scope.prototype.$digest = function() {
  var ttl = 10;
  var dirty;
  this.$root.$$lastDirtyWatch = null;
  this.$beginPhase("$digest");
  if (this.$root.$$applyAsyncId) { 
    clearTimeout(this.$root.$$applyAsyncId); 
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
    this.$root.$digest();
  }
};

Scope.prototype.$evalAsync = function(expr) {
  var self = this;
  if (!self.$$phase && !self.$$asyncQueue.length) {
    setTimeout(function() {
      if (self.$$asyncQueue.length) {
        self.$root.$digest();
      }
    }, 0);
  }
  self.$$asyncQueue.push({scope: self, expression: expr});
};

Scope.prototype.$$postDigest = function(fn) {
  this.$$postDigestQueue.push(fn);
};

Scope.prototype.$destroy = function() { 
  if (this.$parent) { 
    var siblings = this.$parent.$$children; 
    var indexOfThis = siblings.indexOf(this); 
    if (indexOfThis >= 0) { 
      siblings.splice(indexOfThis, 1); 
    } 
  } 
  this.$$watchers = null; 
};

/////////////////////////////////////////////////////

var $scope = new Scope();