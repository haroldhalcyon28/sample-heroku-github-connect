const mongoose = require('mongoose');
const Schema = mongoose.Schema;

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






// EmployeeTimeIn.find({employee: socketData.emplopyeeId})
//         .populate(
//             {
//                 path:'employee',
//                 select: 'name  pic'
//             })
//         .limit(1)
//         .sort({timeIn: -1})
//         .exec(function (err, employeeTimeIns) {
//             if (err) console.log(err);
//             if (employeeTimeIns.length) {
//                 let employee = employeeTimeIns.map(timeIn => {
//                     console.log(timeIn);
//                     return {
//                         id: timeIn.id,
//                         name: timeIn.employee.name,
//                         pic: timeIn.employee.pic,
//                         timeIn: timeIn.timeIn,
//                         isSeen: timeIn.isSeen
//                     }
//                 })
//                 console.log('Details of employee successfully sent to admin');
//                 //console.log(employeeTimeIns);
//             }
            
//         });