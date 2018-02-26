const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const Account = require('../models/account');
const config = require('../config/config');

module.exports = function(passport) {
  let opts = {};
  opts.jwtFromRequest = ExtractJwt.fromAuthHeaderWithScheme('jwt');
  opts.secretOrKey = config.secret;
  passport.use(new JwtStrategy(opts, (jwt_payload, done) => {
    Account.getAccountById(jwt_payload.data._id, (err, user) => {
      if(err) {
        return done(err, false);
      }

      if(user) {
        if(!user.isAdmin){
          Account.checkEmployeeAccount(user._id, (_err, _user) =>{
            if(_err){
              console.log(_err)
              return done(_err, false);
            }
            if(_user.length){
              return done(null, _user[0]);
            }
            else{
              return done(_err, false);
            }
          })          
        }
        else{
          return done(null, user);
        }
        
      } else {
        return done(null, false);
      }
    });
  }));
}
