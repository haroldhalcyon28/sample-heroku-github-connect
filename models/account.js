

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = require('mongodb').ObjectID;


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
    let isMatch = (candidatePassword == hash);
    callback(null, isMatch);
}