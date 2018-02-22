const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Company = require('./company');
const Employee = require('./employee');
const ObjectId = require('mongodb').ObjectID;

const employeeTimeInSchema = new Schema({
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee'
        },
        timeIn: Number,
        pics: [
            {
                original: String,
                thumb: String
            }
        ],
        scanDecoded: String,
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
        createdAt: Number
});

const EmployeeTimeIn = module.exports =  mongoose.model('EmployeeTimeIn', employeeTimeInSchema);

module.exports.addNew = (newEmployeeTimeIn, callback) => {
    newEmployeeTimeIn.save(callback);
}

module.exports.getInitNotif = (company, callback) => {

    
    EmployeeTimeIn.aggregate(
            [   { $lookup: {
                        from: "employees",
                        localField: "employee",
                        foreignField: "_id",
                        as: "employeeDetails"
                    }
                },
                { $match: {"employeeDetails.company": ObjectId(company), "employeeDetails.deleted": false}},
                { 
                    $project : { 
                        _id: 1,
                        employee: 1,
                        "employeeDetails.name": 1,
                        "employeeDetails.pic": 1,
                        timeIn: 1,
                        isSeen: 1
                    } 
                },
                { $group: {
                    _id: {
                        id: "$_id",
                        name: "$employeeDetails.name",
                        pic: "$employeeDetails.pic",
                        timeIn: "$timeIn",
                        isSeen: "$isSeen",
                        employeeId: "$employee"
                    } 
                }},
                { $sort: {"_id.timeIn": -1 } },
                { $limit: 15}                
            ])
        .exec(callback)
}

module.exports.getAdditionalNotif = (company, timeIn, callback) => {

    EmployeeTimeIn.aggregate(
        [   { $lookup: {
                    from: "employees",
                    localField: "employee",
                    foreignField: "_id",
                    as: "employeeDetails"
                }
            },
            { $match: {
                "employeeDetails.company": ObjectId(company),
                "employeeDetails.deleted": false,
                timeIn: {$lt: timeIn}
                }
            },
            { 
                $project : { 
                    _id: 1,
                    employee: 1,
                    "employeeDetails.name": 1,
                    "employeeDetails.pic": 1,
                    timeIn: 1,
                    isSeen: 1
                } 
            },
            { $group: {
                _id: {
                    id: "$_id",
                    name: "$employeeDetails.name",
                    pic: "$employeeDetails.pic",
                    timeIn: "$timeIn",
                    isSeen: "$isSeen",
                    employeeId: "$employee"
                } 
            }},
            { $sort: {"_id.timeIn": -1 } },
            { $limit: 10}                
        ])
    .exec(callback)
}

module.exports.getRecentTimeIns = (company, callback) => {
    EmployeeTimeIn.aggregate(
            [   { $lookup: {
                        from: "employees",
                        localField: "employee",
                        foreignField: "_id",
                        as: "employeeDetails"
                    }
                },
                { $match: {"employeeDetails.company": ObjectId(company), "employeeDetails.deleted": false}},
                { 
                    $project : { 
                        employee: 1,
                        map: 1,
                        "employeeDetails._id": 1,
                        "employeeDetails.name": 1,
                        "employeeDetails.pic": 1,
                        timeIn: 1
                    } 
                },
                { $sort: {timeIn: -1 } },
                { $group: {
                    _id: "$employee",
                    map: {$first: "$map" },
                    employeeDetails: {$first: "$employeeDetails"}
                }}
            ])
        .exec(callback)
}

module.exports.getUnseenLogsCount = (company, callback) => {
    EmployeeTimeIn.aggregate(
        [   { "$lookup": {
                    "from": "employees",
                    "localField": "employee",
                    "foreignField": "_id",
                    "as": "employeeDetails"
                }
            },
            { "$match": {
                "employeeDetails.company": ObjectId(company),
                "isSeen": false
                }
            },
            { 
                "$project" : { 
                    "_id": 1
                } 
            }              
        ])
    .exec(callback)
}