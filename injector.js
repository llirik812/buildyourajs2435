'use strict';

function createInjector(modulesToLoad, strictDi) {
    var FN_ARGS = /^function\s*[^\(\s*([^\)]*)\)/m;
    var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
    var STRIP_COMMENTS = /\/\*.*\*\//g;
    var cache = {};
    var providerCache = {};
    var instanceCache = {};
    var loadedModules = {};
    strictDi = (strictDi === true);

    var $provide = {
        constant: function(key, value) {
            if (key === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid constant name';
            }
            instanceCache[key] = value;
        },
        provider: function(key, provider) {
            providerCache[key + 'Provider'] = provider;
        }
    };

    /*
     * Return a list of arguments - ['a','b'] from ['a','b', function(){}]
     */
    function annotate(fn) {
        if (_.isArray(fn)) {
            return fn.slice(0, fn.length - 1);
        } else if (fn.$inject) {
            return fn.$inject;
        } else if (!fn.length) {
            return [];
        } else {
            if (strictDi) {
                throw 'fn is not using explicit annotation and ' +
                        'cannot be invoked in strict mode';
            }
            var source = fn.toString().replace(STRIP_COMMENTS, '');
            var argDeclaration = source.match(FN_ARGS);
            return _.map(argDeclaration[1].split(','), function(argName) {
                return argName.match(FN_ARG)[2];
            }
        }
    }

    /*
    * Invokes function and injects dependencies to it
    */
    function invoke(fn, self, locals) {
        var args = _.map(annotate(fn), function(token) {
            if (_.isString(token)) {
                return locals && locals.hasOwnProperty(token) ? locals[token] : getService(token);
            } else {
                return 'Incorrect injection token! Expected a string, got ' + token;
            }
        });
        if (_.isArray(fn)) {
            fn = _.last(fn);
        }
        return fn.apply(self, args);
    }

    /*
    * Create new object of type Type and invokes it injecting dependencies
    */
    function instantiate(Type, locals) {
        var UnwrappedType = _.isArray(Type) ? _.last(Type) : Type;
        var instance = Object.create(UnwrappedType.prototype);
        invoke(Type, instance, locals);
        return instance;
    }

    /**
    * Returns cached object requested by its name
    */
    function getService(name){
        if (instanceCache.hasOwnProperty(name)) {
            return instanceCache[name];
        } else if (providerCache.hasOwnProperty(name + 'Provider')) {
            var provider = providerCache[name + 'Provider'];
            return invoke(provider.$get, provider);
        }
    }

    _.forEach(modulesToLoad, function loadModule(moduleName) {
        if (!loadedModules.hasOwnProperty(moduleName)) {
            loadedModules[moduleName] = true;
            var module = angular.module(moduleName);
            _.forEach(module.requires, loadModule);
            _.forEach(module._invokeQueue, function(invokeArgs) {
                var method = invokeArgs[0];
                var args = invokeArgs[1];
                $provide[method].apply($provide, args);
            });
        }
    });

    return {
        has: function(key) {
            return instanceCache.hasOwnProperty(key) || providerCache.hasOwnProperty(key + 'Provider');
        },
        get: getService,
        annotate: annotate,
        invoke: invoke,
        instantiate: instantiate
    };
}