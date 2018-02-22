const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = require('mongodb').ObjectID;
const Account = require('./account');

const config = require('../config/config');
const cloudinary = config.cloudinary;

const Util = require('../util/util');

// mongodb collection name is case sensitive (‘Campaigns’ is different from ‘campaigns’)
// mongodb best practises is to have all lower case for collection name (‘campaigns’ is preferred)
// mongoose model name should be singular and upper case (‘Campaign’)
// mongoose will lowercase and pluralize with an ‘s’ so that it can access the collection (‘Campaign’ » ‘campaigns’)

const employeeSchema = new Schema({
        _id: mongoose.Schema.Types.ObjectId,
        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company'
        },
        name: {
            firstName: String,
            lastName: String
        },
        pic: {
            original: String,
            thumb: String
        },
        messages: [
            {
                _id: false,
                isMe:Boolean,
                content: String,
                sentAt: Number,
                seenAt: {
                    type: Number,
                    default: 0
                },
            }
        ],
        createdAt: Number,
        deleted: {
            type: Boolean,
            default: false
        }
});

const Employee = module.exports =  mongoose.model('Employee', employeeSchema);

module.exports.addNew = (_newEmployee, callback) => {
    let newAccount = new Account({
        username: _newEmployee.username,
        password: _newEmployee.password
    })
 
    Account.addNew(newAccount, (err, account) => {
        if(err) throw err;
        if(account){
            let newEmployee = new Employee({
                _id: account._id,
                company: _newEmployee.company,
                name: _newEmployee.name,
                pic: {
                    original: '',
                    thumb: ''
                },
                messages: [],
                createdAt: Math.floor(Date.now() /1000)
            })

            if (_newEmployee.pic.original){
                Util.upload(_newEmployee.pic.original, (err, result) => {
                    if (err) { 
                        Account.findByIdAndRemove(account._id);
                        throw err;
                    }
                    if(result) {
                        newEmployee.pic = {
                            original: result.secure_url,
                            thumb: result.secure_url
                        }
                        newEmployee.save(callback);
                    }
                })
            }
            else{
                newEmployee.save(callback);
            }
            
            

            
            
        }
    })
}

module.exports.update = (employee, callback) => {
    console.log(employee);
    let pic = '';
    function _update(){
        Employee.findById(employee._id, (err, _employee) => {
            if(err) console.log(err);
            if(_employee){
                _employee.name = employee.name;
                if(pic){
                    _employee.pic.original = pic;
                    _employee.pic.thumb = pic;
                }
                _employee.save((__err, __employee) => {
                    if(!err && __employee){
                        callback({
                            name: __employee.name,
                            pic: __employee.pic
                        })
                    }
                })
            }
        })
    }
    if(employee.pic){
        Util.upload(employee.pic, (err, result) => {
            if (err) console.log(err);
            if(result) {
                pic = result.secure_url;
                _update();
            }
        })
    }
    else{
        _update();
    }

}

module.exports.getAll = (company, callback) => {
    Employee.find({company: company, deleted: false}, callback);
}

module.exports.getEmployeeById  = (id, callback) => {
    Employee.findById(id, callback);
}

module.exports.delete = (id, callback) => {
    console.log(id);
    Employee.findByIdAndUpdate(id, {$set: {deleted: true}}, callback);
}