'use strict';

function setupModuleLoader(window) {
	/**
	* function ensure
	*/
	var ensure = function(obj, name, factory) {
		return obj[name] || (obj[name] = factory());
	};

	/**
	* function createModule
	*/
	var createModule = function(name, requires, modules) {
	    if (name === 'hasOwnProperty') {
	        throw 'hasOwnProperty is not a valid module name';
	    }
	    var invokeQueue = [];

	    var invokeLater = function(method) {
	        return function() {
	            invokeQueue.push(['method', arguments]);
	            return moduleInstance;
	        }
	    }

		var moduleInstance = {
			name: name,
			requires: requires,
			constant: invokeLater('constant'),
			provider: invokeLater('provider'),
			_invokeQueue: invokeQueue
		};
		modules[name] = moduleInstance;
		return moduleInstance;
	};

	/**
	* function getModule
	*/
	var getModule = function(name, modules) {
	    if (modules.hasOwnProperty(name)) {
    	    return modules[name];
	    } else {
	        throw 'Module ' + name + ' is not available!';
	    }
	}

	/**
	* register 'angular' object
	*/
	var angular = ensure('angular', window, Object);

    /**
    * register 'angular.module' function
    */
	ensure(angular, 'module', function() {
        var modules = {};
        return function(name, requires) {
            if (requires) {
                return createModule(name, requires, modules);
            } else {
                getModule(name, modules);
            }
        }
	});
}