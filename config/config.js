// module.exports = {
//     // uri: 'mongodb://harold:johnp@ds249707.mlab.com:49707/employee-log-socket-io',   //prod
//     uri: 'mongodb://localhost:27017/mydb',    //dev
//    // uri: 'mongodb://192.168.1.73:27017/mydb',    //dev
//     secret: 'yoursecret'
//   }






module.exports.database = {uri: 'mongodb://localhost:27017/mydb'};
module.exports.secret = 'johnp';



const _cloudinary  = require('cloudinary')
_cloudinary.config({ 
    cloud_name: 'dka3vzadb', 
    api_key: '259354488977965', 
    api_secret: 'zO8KRwUwA1A-zINxpKrkRO-CINs' 
});
module.exports.cloudinary = _cloudinary;

// cloudinary.config({ 
//     cloud_name: 'dka3vzadb', 
//     api_key: '259354488977965', 
//     api_secret: 'zO8KRwUwA1A-zINxpKrkRO-CINs' 
//   });