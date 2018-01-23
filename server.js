

'use strict';

const express = require('express');
const socketIO = require('socket.io');
const path = require('path');
const unirest = require('unirest');
const PORT = process.env.PORT || 8080;
const INDEX = path.join(__dirname, 'index.html');
const DBHOST = 'http://192.168.1.73:3000';
const Employee = require('./models/employee');
const EmployeeTimeIn = require('./models/employee-time-in');
const SocketClient = require('./models/socket-client');




const mongoose = require('mongoose');
const database = require('./config/database');
mongoose.connect(database.uri, { useMongoClient: true});
// On Connection
mongoose.connection.on('connected', () => {console.log('Connected to Database ')});
// On Error
mongoose.connection.on('error', (err) => {console.log('Database error '+err)});

// let newEmployee = new Employee(
//     {
//         name: {
//             firstName: 'Jes',
//             lastName: 'Paz',
//             middleName: ''
//         },
//         pic: {
//             original: 'https://trello-avatars.s3.amazonaws.com/86b9d2dcf35b7a7ca6525b1208401649/original.png',
//             thumb: 'https://trello-avatars.s3.amazonaws.com/86b9d2dcf35b7a7ca6525b1208401649/50.png'
//         },
//         messages: []
//     }
// )
// Employee.addNew(newEmployee, (err, employee) => {
//     if (err) throw err;
//     console.log(employee);
// })

// return;

const cloudinary = require('cloudinary');
cloudinary.config({ 
    cloud_name: 'dka3vzadb', 
    api_key: '259354488977965', 
    api_secret: 'zO8KRwUwA1A-zINxpKrkRO-CINs' 
  });


// for changing console to debug and for adding log time
var DEBUG = (function () {
    var timestamp = function () { };
    timestamp.toString = function () {
        return "[DEBUG " + (new Date).toLocaleTimeString() + "]";
    };

    return {
        log: console.log.bind(console, '%s', timestamp)
    }
})();



const server = express()
    .use((req, res) => res.sendFile(INDEX))
    .listen(PORT, () => DEBUG.log(`Listening on ${PORT}`));
const io = socketIO(server, {
    pingTimeout: 1000
});

// const io = socketIO(server);

SocketClient.remove({}, function(err, row) {
    if (err) {
        console.log("Collection couldn't be removed" + err);
        return;
    }
    console.log("SocketClient collection removed");
})


io.on('connection', (socket) => {

    console.log(`Client connected with ID: ${socket.id}`);

    socket.on('cl-sendEmployeeId', socketData => {
        let newSocketClient = new SocketClient(
            {
                socketId: socket.id,
                employeeId: socketData.employeeId,
            }
        )
        
        SocketClient.addNew(newSocketClient, (err, socketClient) => {
            if (err) {
                console.log(err);
            } else {
                console.log('New socket client added!');
            }
            
        })
    })

    
    socket.on('cl-getInitNotifEmployee', (socketData) => {
        console.log(`Employee is requesting initial notifications\nSocketId: ${socket.id}`);
        EmployeeTimeIn.find({employee: socketData.employeeId})
        .limit(20)
        .sort({timeIn: -1})
        .exec(function (err, employeeTimeIns) {
            if (err) {
                console.log(err);
            }
            else{
                socket.emit('sv-sendInitNotif', employeeTimeIns);
                console.log('Initial notifications succesfully sent to employee');
            }

        });
    })

    socket.on('cl-getEmployeeStatus', socketData => {
        SocketClient.findOne({employeeId: socketData.employeeId})
        .exec((err, socketClient) =>{
            if (err) {
                console.log(err)
            }
            if (socketClient) {
                console.log('Admin requesting status of selected employee');
                io.to(socketClient.socketId).emit('sv-myCurrentStatus');
            }
            else{
                console.log('Employee is offline');
                socket.emit('sv-sendEmployeeStatus', {
                    online: false,
                    employeeId: socketData.employeeId
                });
            }
        });
    })

    socket.on('cl-myCurrentStatus', socketData =>{

        SocketClient.findOne({socketId: socket.id})
        .exec((err, socketClient) =>{
            if (err) {
                console.log(err)
            }
            if (socketClient) {
                socketData.employeeId = socketClient.employeeId;
                socketData.online = true;
                console.log('Employee status successfully sent to admin');
                io.emit('sv-sendEmployeeStatus', socketData);
            }
        });
        
    })
    
    socket.on('cl-getInitNotif', () => {
        console.log(`Admin is requesting initial notifications\nSocketId: ${socket.id}`);
        EmployeeTimeIn.find({})
        .populate(
            {
                path:'employee',
                select: 'name  pic'
            })
        .limit(20)
        .sort({timeIn: -1})
        .exec(function (err, employeeTimeIns) {
            if (err) return handleError(err);
            if (employeeTimeIns.length) {
                employeeTimeIns = employeeTimeIns.map(timeIn => {
                    return {
                        id: timeIn.id,
                        name: timeIn.employee.name,
                        pic: timeIn.employee.pic.thumb,
                        timeIn: timeIn.timeIn,
                        isSeen: timeIn.isSeen
                    }
                })
            } 
            
            console.log('Initial notifications succesfully sent to admin');
            io.emit('sv-sendInitNotif', employeeTimeIns);
        });
    });

    


    socket.on('cl-timeIn', socketdata => {
        Employee.findById(socketdata.employeeId, (err, employee) => {
            let success = false;
            if (err) {
                console.log(err);
            } else if (!employee) {
                console.log(`_id ${socketdata.employeeId} not found`);
            } else {
                console.log(`New Time In From ${employee.name.firstName} ${employee.name.lastName}\nSocket ID: ${socket.id}\n`);
                cloudinary.v2.uploader.upload(socketdata.pic,function(err, result) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log(`Selfie of ${employee.name.firstName} ${employee.name.lastName} successfully uploaded`);
                        unirest.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${socketdata.map.lat},${socketdata.map.lng}&key=AIzaSyDuOss95cF1Xa6hfbn7M_fC7plWH9GCnj8`)
                            .end(
                                response => {
                                    let employeeTimeIn = new EmployeeTimeIn({
                                        employee: socketdata.employeeId,
                                        timeIn: socketdata.timeIn,
                                        pic: {
                                            original: result.secure_url,
                                            thumb: result.secure_url
                                        },
                                        map: {
                                            lng: socketdata.map.lng,
                                            lat: socketdata.map.lat,
                                            formattedAddress: response.body.results[0].formatted_address
                                        },
                                        batteryStatus: socketdata.batteryStatus
                                    });
                        
                                    EmployeeTimeIn.addNew(employeeTimeIn, (err, timeIn) => {
                                        if (err) {
                                            console.log(err);
                                        } else {
                                            console.log(`Time In of ${employee.name.firstName} ${employee.name.lastName} successfully saved\n`);
                                            io.to(socket.id).emit('sv-successTimeIn', {success: true});
                                            console.log(`Response confirmation of time in succesfully sent to ${employee.name.firstName} ${employee.name.lastName}`)

                                            io.emit('sv-newNotification', {
                                                id: employeeTimeIn.id,
                                                isSeen: false,
                                                name: {
                                                    firstName: employee.name.firstName,
                                                    middleName: employee.name.middleName, 
                                                    lastName: employee.name.lastName,
                                                },
                                                pic: employee.pic.thumb,
                                                timeIn: employeeTimeIn.timeIn
                                            });
                                        }
                                        
                                    });
                                }
                            );                                        
                    } 
                });
            }
        })        
    });

    socket.on('cl-getNotifDetails', socketData => {
        console.log('Admin requesting notification details')
        EmployeeTimeIn.findByIdAndUpdate(socketData.id, {
            isSeen: true,
            seenAt: Math.floor(Date.now() /1000)
        }, (err, employeeTimeIn) =>{
            if (err) throw err;
            io.emit('sv-serveNotifDetails', {
                id: employeeTimeIn.id,
                pic: employeeTimeIn.pic,
                map: employeeTimeIn.map,
                timeIn: employeeTimeIn.timeIn,
                batteryStatus: employeeTimeIn.batteryStatus
            })
            console.log('Notification details succesfully sent to admin');
            SocketClient.find({employeeId: employeeTimeIn.employee})
            .exec((err, socketClients) => {
                if (err) {
                    console.log(err);
                } else {
                    socketClients.forEach(socketClient => {
                        io.to(socketClient.socketId).emit('sv-notifSeen', {id: socketData.id});
                    })
                }
            })

            //emit to client that his notification is seen by admin
        })
    });

    socket.on('cl-typing', socketData => {
        if (socketData.isEmployee) {
            io.emit('sv-employeeTyping');
        } else {
            io.emit('sv-adminTyping');
        }
    })

    socket.on('cl-getInitMessages', socketData => {
        ///sort and limit the result
        console.log('Request initial message history of selected employee');
        EmployeeTimeIn.findById(socketData.notificationId, (err, employeeTimeIn) =>{
            if (err) throw err;
            Employee.findById(employeeTimeIn.employee, (err, employee) =>{
                if (err) throw err;
                console.log('Initial message history for selected employee successfully sent');
                io.emit('sv-sendInitMessages', employee);        
            })
        })
    });
    

    socket.on('cl-sendNewMessage', socketData => {
        console.log(socketData);
        console.log(`${socketData.isMe ? 'Employee' : 'Admin'} sending new message`);
        let newMessage = {
            isMe: socketData.isMe,
            content: socketData.content,
            sentAt: Math.floor(Date.now() /1000)
        }

        Employee.findByIdAndUpdate(socketData.employeeId, {
            $push: {'messages': newMessage}
        }, (err, employee) => {
            if (err) throw err;
            console.log('New message saved');
            io.to(socket.id).emit('sv-messageSent', {success: true})

            if (socketData.isMe) {
                newMessage.employeeId = socketData.employeeId;
                io.emit('sv-newMessageFromEmployee', newMessage)
                console.log(newMessage);

            }
            else{
                console.log(newMessage)
                io.emit('sv-newMessageFromAdmin', newMessage)
            }
        })
    });

    socket.on('cl-getRecentTimeIns', socketData => {
        console.log('Admin requesting employees recent time ins');
        EmployeeTimeIn.aggregate(
            [   { "$lookup": {
                        "from": "employees",
                        "localField": "employee",
                        "foreignField": "_id",
                        "as": "employeeDetails"
                    }
                },
                { 
                    "$project" : { 
                        "_id": 1,
                        "employee": 1,
                        "map": 1,
                        "pic": 1,
                        "employeeDetails._id": 1,
                        "employeeDetails.name": 1,
                        "employeeDetails.pic": 1,
                        "timeIn": 1
                    } 
                },
                { "$sort": {"timeIn": -1 } },
                { "$group": {
                    "_id": "$employee",
                    "employee": {"$first": "$_id"},
                    "map": { "$first": "$map" },
                    "timeIn": {"$first": "$timeIn"},
                    "pic": {"$first": "$pic"},
                    "employeeDetails": {"$first": "$employeeDetails"}
                }}
            ])
        .exec((err, result) =>{
            
            let employeeTimeIns = result.map(employeeTimeIn => {
                let e = employeeTimeIn.employee;
                employeeTimeIn.employee = employeeTimeIn.employeeDetails[0];
                employeeTimeIn.employeeDetails = undefined;
                employeeTimeIn._id = e; 
                return employeeTimeIn;
            })

            io.emit('sv-sendRecentTimeIns', employeeTimeIns);
            console.log('Employees recent time ins successfully sent to admin');
            
        })

        
    })




    socket.on('disconnect', () => {
        console.log('Client disconnected with ID: ' + socket.id)

        SocketClient.findOne({socketId: socket.id})
        .exec((err, socketClient) =>{
            if (err) {
                console.log(err);
            }
            if (socketClient) {
                io.emit('sv-sendEmployeeStatus', {
                    online: false,
                    employeeId: socketClient.employeeId
                });
            }
            
            
        });

        SocketClient.find({ socketId:socket.id }).remove().exec();

        
        
    });


        
});