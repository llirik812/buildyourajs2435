/*
тут простое приравнивание прототипов и конструкторов
*/

function Test1() {}
Test1.prototype.one = function() {
    console.log(1);
};

function Test2() {}
Test2.prototype.two = function() {
    console.log(2);
};

function Test3() {}
Test3.prototype = Test2.prototype;
Test3.prototype.constructor = Test2.prototype.constructor;
Test3.prototype.prototype  = Test1.prototype;
Test3.prototype.prototype.constructor = Test1.prototype.constructor;

var asd = new Test3();
//asd.prototype.one();
//asd.two();

/////////////////////////////////
/*
нельзя реализовать наследоваие 
в уже созданных объектах
*/
/////////////////////////////////

function extend(obj1, obj2) {
    //var o1 = function(){};
    //o1.prototype = obj1;
    var o1 = function() {
//	this.prototype.
    }
    o1.prototype = obj1;
    //var o1 = Object.create(obj1);      
    //o1.prototype.prototype = obj2;  
      
    return new o1();
    //return o1;
}

var 
obj1 = {
    fn1 : function() {
	console.log(1);
    }
}, 
obj2 = {
    fn2 : function() {
	console.log(2);
    }
};

console.log(typeof obj2.constructor);
console.log(typeof extend);

var obj3 = extend(obj1, obj2);

obj3.fn1();
//obj3.fn2();