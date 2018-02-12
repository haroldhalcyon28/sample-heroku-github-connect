

'use strict';

const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
    pingInterval: 5000,
    pingTimeout: 5000
});


const path = require('path');
const unirest = require('unirest');
const PORT = process.env.PORT || 8080;
const INDEX = path.join(__dirname, 'index.html');
const Employee = require('./models/employee');
const EmployeeTimeIn = require('./models/employee-time-in');
const SocketClient = require('./models/socket-client');

const mongoose = require('mongoose');
const ObjectId = require('mongodb').ObjectID;
const config = require('./config/config');
mongoose.connect(config.database.uri, { useMongoClient: true});
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



// const server = express()
//     .use((req, res) => res.sendFile(INDEX))
//     .listen(PORT, () => DEBUG.log(`Listening on ${PORT}`));
// const io = socketIO(server, {
//     pingTimeout: 5000,
//     pingInterval: 5000
// });

server.listen(PORT, () => DEBUG.log(`Listening on ${PORT}`));

const cors = require('cors');
app.use(cors());

const bodyParser = require('body-parser');

const passport = require('passport');
app.use(bodyParser.json());
app.use(passport.initialize());
app.use(passport.session());
require('./config/passport')(passport);

const users = require('./routes/users');
app.use('', users);


// const io = socketIO(server);

SocketClient.remove({}, function(err, row) {
    if (err) {
        console.log("Collection couldn't be removed" + err);
        return;
    }
    console.log("SocketClient collection removed");
})



const jwt = require('jsonwebtoken');
const Account = require('./models/account');
io.use((socket, next) => {
    
    let token = socket.handshake.query.token;
    jwt.verify(token, config.secret, (err, decodedToken) => {
        if(err) return next(new Error('authentication error'));
        if(decodedToken) {
            let query = {
                _id: ObjectId(decodedToken.data._id),
                isAdmin: decodedToken.data.isAdmin
            }
            Account.getAccountByQuery(query, (err, account) => {
                if(err) return next(new Error('authentication error'));
                if(!account){
                    return next(new Error('authentication error'));
                }
                else{
                    socket.user = {
                        _id: account._id,
                        username: account.username,
                        isAdmin: account.isAdmin,
                        name: account.name
                    };
                    if(account.isAdmin){
                        return next();
                    }
                    else{
                        Employee.getEmployeeById(account._id, (err, employee) => {
                            if (err) console.log(err);
                            if (employee) {
                                socket.user = Object.assign({}, socket.user, {
                                    name: employee.name
                                })
                            }
                            
                            return next();
                        })
                    }
                    
                    
                }
            })
        }
    })
});

io.use((socket, next) => {
    console.log(`
        New socket client connected
        Socket ID: ${socket.id}
        ${socket.user.isAdmin ? 'Admin' : 'Employee'} ID: ${socket.user._id}
        Username: ${socket.user.username}
    `);
    return next();
})

//   console.log(Object.keys(io.sockets.connected));
  
io.on('connection', (socket) => {
    // socket.emit('sv-requestEmployeeId');
    if(!socket.user.isAdmin) socket.join(socket.user._id);

    socket.on('cl-adminJoinRoom', () => {
        socket.join('adminRoom');
    })


    // socket.on('cl-sendEmployeeId', socketData => {
    //     socket.join(socketData.employeeId);
    //     let newSocketClient = new SocketClient(
    //         {
    //             socketId: socket.id,
    //             employeeId: socketData.employeeId,
    //         }
    //     )
        
    //     SocketClient.addNew(newSocketClient, (err, socketClient) => {
    //         if (err) {
    //             console.log(err);
    //         } else {
    //             console.log('New socket client added!');
    //             io.to(newSocketClient.socketId).emit('sv-myCurrentStatus');
    //         }
            
    //     })
    // })

    
    socket.on('cl-getInitNotifEmployee', () => {

        console.log(`${socket.user.name.firstName} ${socket.user.name.lastName} is requesting initial notifications`)
        //console.log(`Employee is requesting initial notifications\nSocketId: ${socket.id}`);
        EmployeeTimeIn.find({employee: socket.user._id})
        .limit(100)
        .sort({timeIn: -1})
        .exec(function (err, employeeTimeIns) {
            if (err) {
                console.log(err);
            }
            else{
                socket.emit('sv-sendInitNotif', employeeTimeIns);
                console.log(employeeTimeIns);
                console.log(`Initial notifications succesfully sent to ${socket.user.name.firstName} ${socket.user.name.lastName}`);
            }

        });
    })

    socket.on('cl-getEmployeeStatus', socketData => {
        console.log(Object.keys(socket.rooms));
        console.log('Admin requesting details of employee');
        let _objKeys = Object.keys(socket.rooms);
        if(_objKeys.length > 2){
            for(let i = 1; i < _objKeys.length; i++){
                if (_objKeys[i] == 'adminRoom') continue;
                if(socketData.employeeId == _objKeys[i]) continue;
                socket.leave(_objKeys[i]);
            }
        }
        socket.join(socketData.employeeId);

        SocketClient.findOne({employeeId: socketData.employeeId})
        .exec((err, socketClient) =>{
            if (err) console.log(err);
            if (socketClient) {
                console.log('Admin requesting status of selected employee');
                io.to(socketClient.socketId).emit('sv-myCurrentStatus');
            }
            else{
                console.log('Employee is offline');
                EmployeeTimeIn.find({employee: socketData.employeeId})
                .populate(
                    {
                        path:'employee',
                        select: 'name  pic'
                    })
                .limit(1)
                .sort({timeIn: -1})
                .exec(function (err, employeeTimeIns) {
                    if (err) console.log(err);

                    if (employeeTimeIns.length) {
                        let employee = employeeTimeIns.map(timeIn => {
                            return {
                                name: timeIn.employee.name,
                                pic: timeIn.employee.pic,
                                previousLocation: timeIn.map,
                                isOnline: false,
                                selfie: timeIn.pic
                            }
                        })
                        console.log('Details of employee successfully sent to admin');
                        io.to(socketData.employeeId).emit('sv-sendSelectedEmployeeStatus', employee[0]);
                        io.to('adminRoom').emit('sv-sendEmployeeStatus', {
                            isOnline: true,
                            id: socketData.employeeId
                        });
                        
                    } 
                });
            }
        });
    })

    

    socket.on('cl-myCurrentStatus', socketData => {
        SocketClient.findOne({socketId: socket.id})
        .exec((err, socketClient) =>{
            if (err) console.log(err);
            if (socketClient) {
                EmployeeTimeIn.find({employee: socketClient.employeeId})
                .populate(
                    {
                        path:'employee',
                        select: 'name  pic'
                    })
                .limit(1)
                .sort({timeIn: -1})
                .exec(function (err, employeeTimeIns) {
                    if (err) console.log(err);
                    if (employeeTimeIns.length) {
                        let employee = employeeTimeIns.map(timeIn => {
                            return {
                                name: timeIn.employee.name,
                                pic: timeIn.employee.pic,
                                previousLocation: timeIn.map,
                                isOnline: true,
                                selfie: timeIn.pic
                            }
                        })
                        let e = Object.assign({}, {id: socketClient.employeeId, isOnline: true,});
                        if (socketData.location) Object.assign(e, {currentLocation: socketData.location});
                        console.log(socketData);
                        io.to('adminRoom').emit('sv-sendEmployeeStatus', e);

                        if (socketData.battery) Object.assign(e, {battery: socketData.battery});
                        if (socketData.connection) Object.assign(e, {connectionType: socketData.connection});
                        if (socketData.phone) Object.assign(e, {phone: socketData.phone});
                        e = Object.assign({}, e, employee[0]);
                        console.log(socketClient.employeeId);
                        io.to(socketClient.employeeId).emit('sv-sendSelectedEmployeeStatus', e);
                        console.log('Employee status successfully sent to admin');
                    } 
                });

                
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
        .limit(15)
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
                        isSeen: timeIn.isSeen,
                        employeeId: timeIn.employee.id

                    }
                })
            } 
            
            console.log('Initial notifications succesfully sent to admin');
            
            socket.emit('sv-sendInitNotif', employeeTimeIns);
        });
    });

    socket.on('cl-getAdditionalNotif', socketData => {
        console.log(`Admin is requesting additions notifications\nSocketId: ${socket.id}`);
        EmployeeTimeIn.find({timeIn: {$lt: socketData.timeIn}})
        .populate(
            {
                path:'employee',
                select: 'name  pic'
            })
        .limit(10)
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
                        isSeen: timeIn.isSeen,
                        employeeId: timeIn.employee.id
                    }
                })
            }
            console.log('Additional notifications succesfully sent to admin');
            socket.emit('sv-sendAdditionNotif', employeeTimeIns);
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
                        console.log('error uploading')
                        //console.log(err);
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
                                    console.log(socketdata.timeIn);
                        
                                    EmployeeTimeIn.addNew(employeeTimeIn, (err, timeIn) => {
                                        if (err) console.log(err);
                                        if(employeeTimeIn){
                                            console.log(`Time In of ${employee.name.firstName} ${employee.name.lastName} successfully saved\n`);
                                            io.to(socket.id).emit('sv-successTimeIn', {
                                                id: employeeTimeIn._id,
                                                timeIn: socketdata.timeIn,
                                                formattedAddress: response.body.results[0].formatted_address
                                            });
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
        console.log('Admin requesting notification details');

        EmployeeTimeIn.findById(socketData.id)
        .exec((err, employeeTimeIn) => {
            if(err) console.log(err);
            if (employeeTimeIn) {
                if (!employeeTimeIn.isSeen) {
                    employeeTimeIn.isSeen = true,
                    employeeTimeIn.seenAt = Math.floor(Date.now() /1000);
                    employeeTimeIn.save();
                    io.to(employeeTimeIn.employee).emit('sv-notifSeen', {id: socketData.id});
                    console.log('Seen notification successfully sent to employee');
                }

                console.log('Notification details succesfully sent to admin');
                socket.emit('sv-serveNotifDetails', {
                    id: employeeTimeIn.id,
                    pic: employeeTimeIn.pic,
                    map: employeeTimeIn.map,
                    timeIn: employeeTimeIn.timeIn,
                    batteryStatus: employeeTimeIn.batteryStatus
                })
            }
        })
    });

    socket.on('cl-typing', socketData => {
        if (socketData.employeeId) {
            console.log('Admin typing');
            io.to(socketData.employeeId).emit('sv-adminTyping');
        } else {
            SocketClient.findOne({socketId: socket.id})
            .exec((err, socketClient) =>{
                if (err) {
                    console.log(err);
                }
                if (socketClient) {
                    console.log('Employee typing');
                    io.to(socketClient.employeeId).emit('sv-employeeTyping');
                }
            });
        }
        
        
    })

    socket.on('cl-getInitMessages', socketData => {
        ///sort and limit the result
        if (!socket.user.isAdmin) {
            console.log('Employee requesting initial nessages');
            Employee.findById(socket.user._id, (err, employee) =>{
                if (err) console.log(err);
                if (employee) {
                    console.log('Initial message history for selected employee successfully sent');
                    socket.emit('sv-sendInitMessages', employee.messages);
                } 
                        
            })
        } 
        else {
            console.log('Request initial message history of selected employee');
            EmployeeTimeIn.findById(socketData.notificationId, (err, employeeTimeIn) =>{
                if (err) console.log(err);
                if (employeeTimeIn) {
                    Employee.findById(employeeTimeIn.employee)
                    .exec((err, employee) => {
                        if (err) console.log(errr);
                        if (employee) {
                            
                            let _objKeys = Object.keys(socket.rooms);
                            if(_objKeys.length > 2){
                                for(let i = 1; i < _objKeys.length; i++){
                                    
                                    if (_objKeys[i] == 'adminRoom') continue;
                                    if (_objKeys[i] == employee._id) continue;
                                    socket.leave(_objKeys[i]);
                                }
                            }

                            socket.join(employee._id);
                            
                            Employee.aggregate([
                                {"$match": {"_id": employeeTimeIn.employee}},
                                {"$project": {
                                    "messages": 1,
                                }},
                                {"$unwind": "$messages"},
                                {"$sort": {"messages.sentAt": -1}},
                                {"$limit": 20},
                                {"$project": {
                                    "messages": "$messages"
                                }},
                            ])
                            .exec((err, results) => {
                                if (err) console.log(err);
                                if (results) {
                                    results = results.map(result => {
                                        return result.messages
                                    })
                                    employee = Object.assign({}, {
                                        _id: employee._id,
                                        name: employee.name,
                                        pic: employee.pic
                                    }, {messages: results});
                                    console.log('Initial message history for selected employee successfully sent');
                                    socket.emit('sv-sendInitMessages', employee);
                                }
                            })
                        }
                    })
                } 
                
            })
        }
        
    });

    socket.on('cl-getAdditionalMessages', socketData => {
        console.log('Request additional message history of selected employee');
        Employee.aggregate([
            {"$match": {"_id": ObjectId(socketData.employeeId)}},
            {"$project": {
                "messages": 1,
            }},
            {"$unwind": "$messages"},
            {"$match": {"messages.sentAt": {"$lt": socketData.sentAt}}},
            {"$unwind": "$messages"},
            {"$sort": {"messages.sentAt": -1}},
            {"$limit": 20},
            {"$project": {
                "messages": "$messages"
            }},
        ])
        .exec((err, results) => {
            if (err) console.log(err);
            if (results) {
                results = results.map(result => {
                    return result.messages
                })
                let employee = Object.assign({}, {
                    employeeId: socketData.employeeId,
                }, {messages: results});
                console.log('Additional message history for selected employee successfully sent');
                socket.emit('sv-sendAdditionalMessages', employee);
            }
        })
    })
    

    socket.on('cl-sendNewMessage', socketData => {
        console.log(socketData);
        //console.log(socketData);
        console.log(`
            ${socket.user.isAdmin ? 'Admin' : 'Employee'} ${socket.user.name.firstName} ${socket.user.name.lastName} sending new message
            Content: ${socketData.content}
        `);

        let newMessage = {
            isMe: !socket.user.isAdmin,
            content: socketData.content,
            sentAt: Math.floor(Date.now() /1000)
        }

        let employeeId = socket.user.isAdmin ? socketData.employeeId : socket.user._id;
        Employee.findByIdAndUpdate(employeeId, {
            $push: {'messages': newMessage}
        }, (err, employee) => {
            if(err) console.log(err);

            if(employee){
                console.log('New message saved');
                newMessage.secret = socketData.secret ? socketData.secret : (Math.floor(Date.now() /1000) + 'qwqwew');
                // console.log(socketData.employeeId);
                // console.log(Object.keys(socket.rooms));

                io.to(employeeId).emit('sv-newMessage', newMessage);

                if(!socket.user.isAdmin) {
                    newMessage = Object.assign({}, newMessage, {
                        pic: employee.pic.thumb,
                        name: employee.name,
                        id: employee._id
                    })
                    delete newMessage.secret;
                    delete newMessage.isMe;
                    io.to('adminRoom').emit('sv-newMessageNotif', newMessage);
                }
                
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
        .exec((err, results) =>{
            if (err) console.log(err);
            if (results) {
                let employeeTimeIns = results.map(employeeTimeIn => {
                    return Object.assign({}, {
                        id: employeeTimeIn.employeeDetails[0]._id,
                        name: employeeTimeIn.employeeDetails[0].name,
                        pic: employeeTimeIn.employeeDetails[0].pic,
                        isOnline: false,
                        currentLocation: employeeTimeIn.map,
                    })
                })
    
                socket.emit('sv-sendRecentTimeIns', employeeTimeIns);
                console.log('Employees recent time ins successfully sent to admin');
            }
            
            
        })

        
    })

    socket.on('cl-unseenLogsCount', () => {
        EmployeeTimeIn.find({isSeen: false})
        .exec((err, employeeTimeIns) => {
            if (err) console.log(err);
            if(employeeTimeIns){
                socket.emit('sv-unseenLogsCount', employeeTimeIns.length);
            }
        })
        
    })




    socket.on('disconnect', () => {
        console.log('Client disconnected with ID: ' + socket.id)

        SocketClient.findOne({socketId: socket.id})

        .exec((err, socketClient) =>{
            if (err) console.log(err);
            if (socketClient) {
                SocketClient.find({ socketId:socket.id }).remove().exec();
                SocketClient.find({employeeId: socketClient.employeeId})
                .exec((err, socketClients) =>{
                    if (err) console.log(err);
                    if (socketClients) {
                        console.log(`Socket count: ${socketClients.length}`);
                        console.log(socketClients);
                        if (!socketClients.length) {
                            
                            let d = Object.assign({}, {
                                isOnline: false,
                                id: socketClient.employeeId
                            })
                            console.log(socketClient.employeeId);
                            io.to(socketClient.employeeId).emit('sv-sendSelectedEmployeeStatus', d);
                            io.to('adminRoom').emit('sv-sendEmployeeStatus', d);
                        }
                    }
                });
            }
            
        });

    });


        
});