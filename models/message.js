const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = require('mongodb').ObjectID;
const EmployeeTimeIn = require('./employee-time-in');
const Employee = require('./employee');

const messageSchema = new Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    },
    isMe: Boolean,
    content: String,
    sentAt: Number,
    seenAt: {
        type: Number,
        default: 0
    }
});

const Message = module.exports = mongoose.model('Message', messageSchema);

module.exports.addNew = (newMessage, callback) => {
    newMessage.save(callback);
}

module.exports.getInitialMessages = (isAdmin, id, callback) => {
    function _getInitialMessages(_id){
        Message.find({employee: ObjectId(_id)}, '-employee -__v')
        .limit(20)
        .sort({sentAt: -1})
        .exec((err, messages) => {
            Employee.findById(_id, (err, employee) => {
                if(err) console.log(err);
                if(employee) {
                    let _employee = Object.assign({}, {
                        _id: employee._id,
                        name: employee.name,
                        pic: employee.pic
                    }, {messages: messages});
                    callback(null, _employee);
                }
            })
        });
    }

    if (isAdmin) {
        EmployeeTimeIn.findById(id, (err, employeeTimeIn) => {
            if (err) console.log(err);
            if (employeeTimeIn) {
                _getInitialMessages(employeeTimeIn.employee);
            }
        })
    }
    else{
        _getInitialMessages(id);
    }
}

module.exports.getAdditionalMessages = (employeeId, sentAt, callback) => {
    Message.find({employee: ObjectId(employeeId), sentAt: {$lt: sentAt}}, '-employee -__v')
    .limit(20)
    .sort({sentAt: -1})
    .exec(callback);
}