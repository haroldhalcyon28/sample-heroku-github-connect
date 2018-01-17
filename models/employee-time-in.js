const mongoose = require('mongoose');
const Schema = mongoose.Schema;


// mongodb collection name is case sensitive (‘Campaigns’ is different from ‘campaigns’)
// mongodb best practises is to have all lower case for collection name (‘campaigns’ is preferred)
// mongoose model name should be singular and upper case (‘Campaign’)
// mongoose will lowercase and pluralize with an ‘s’ so that it can access the collection (‘Campaign’ » ‘campaigns’)

const employeeTimeInSchema = new Schema({
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee'
        },
        timeIn: Number,
        pic: {
            original: String,
            thumb: String
        },
        map: {
            lng: Number,
            lat: Number,
            formattedAddress: String
        },
        batteryStatus: Number,
        isSeen: {
            type: Boolean,
            default: false
        },
        seenAt: {
            type: Number,
            default: 0
        },
        createdAt: {
            type: Number,
            default: Math.floor(Date.now() /1000)
        }
});

const EmployeeTimeIn = module.exports =  mongoose.model('EmployeeTimeIn', employeeTimeInSchema);

module.exports.addNew = (newEmployeeTimeIn, callback) => {
    newEmployeeTimeIn.save(callback);
}