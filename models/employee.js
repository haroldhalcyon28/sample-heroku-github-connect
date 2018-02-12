const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = require('mongodb').ObjectID;

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
            lastName: String,
            middleName: String
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
        createdAt: Number
});

const Employee = module.exports =  mongoose.model('Employee', employeeSchema);

module.exports.addNew = (newEmployee, callback) => {
    newEmployee.save(callback);
}

module.exports.adsda = () => {
    console.log('fsdf');
}

module.exports.getEmployeeById  = (id, callback) => {
    Employee.findById(id, callback);
}