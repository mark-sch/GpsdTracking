/* 
 * Copyright 2014 Fulup Ar Foll
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

traceback  = require('traceback'); // https://www.npmjs.org/package/traceback
util       = require("util");

// ------- Public Methods --------------
var Debug = function(level, format) {  //+ arguments
  
    if (this.debug >= level) {

        args = [].slice.call(arguments, 1); // copy argument in a real array leaving out level
        trace=traceback()[1];               // get trace up to previous calling function
                
        this.message=util.format.apply (null, args);
        if (this.debug >5) console.log ("-%d- %s/%s:%d [%s] -- %j", level, trace.file, trace.name, trace.line, this.uid, this.message);
           else console.log ("-- %s [%s] -- %j", level, trace.name, this.uid, this.message);
    };
};

module.exports = Debug;