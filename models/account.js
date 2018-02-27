
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = require('mongodb').ObjectID;


var _this = this;
const accountSchema = new Schema({
    username: String,
    password: String,
    name: {
        firstName: String,
        lastName: String,
    },
    pic: {
        original: String,
        thumb: String
    },
    isAdmin: {
        type: Boolean,
        default: false
    }
});

const Account = module.exports =  mongoose.model('Account', accountSchema);
const Employee = require('./employee');

module.exports.addNew = (newAccount, callback) => {
    newAccount.save(callback);
}

module.exports.getAccountById = function(id, callback) {
    Account.findById(id, callback);
}

module.exports.getAccountByQuery = (query, callback) => {
    Account.findOne(query, callback);
}

module.exports.comparePassword = (candidatePassword, hash, callback) => {
    bcrypt.compare(candidatePassword, hash, (err, isMatch) => {
        if(err) console.log(err)
        callback(null, isMatch);
    });
}

module.exports.checkEmployeeAccount = (_id, callback) => {
    Employee.aggregate(
        [   { $lookup: {
                    from: "companies",
                    localField: "company",
                    foreignField: "_id",
                    as: "company"
                }
            },
            { $match: {_id: ObjectId(_id), deleted: false, "company.deleted": false}},
            {
                $project : { 
                    _id: 1,
                    name: 1,
                    pic: 1,
                } 
            }
        ])
    .exec(callback)
}

module.exports.authenticate = (username, password, isAdmin, callback) => {
    Account.findOne({username: username, isAdmin: isAdmin}, (err, account) => {
        if(err) {
            callback(err, true, null);
        }
        else{
            if(account){
                Account.comparePassword(password, account.password, (_err, isMatch) => {
                    if(_err) console.log(_err);
                    if(isMatch){
                        if(account.isAdmin){
                            callback(null, false, account);
                        }
                        else{
                            Account.checkEmployeeAccount(account._id, (__err, __account) => {
                                if(__account.length){
                                    callback(null, false, __account[0]);
                                }
                                else{
                                    callback(_err, true, null);
                                }
                            })
                        }
                        
                    }
                    else{
                        callback(_err, true, null);
                    }
                })
            }
            else{
                callback(null, true, null);
            }
        }
    })
}