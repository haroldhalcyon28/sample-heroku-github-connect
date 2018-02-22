

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
const Message = require('./models/message');
const EmployeeTimeIn = require('./models/employee-time-in');
const SocketClient = require('./models/socket-client');

const mongoose = require('mongoose');
const ObjectId = require('mongodb').ObjectID;
const config = require('./config/config');
const cloudinary = config.cloudinary;
const Util = require('./util/util');

mongoose.connect(config.database.uri, { useMongoClient: true});
// On Connection
mongoose.connection.on('connected', () => {console.log('Connected to Database ')});
// On Error
mongoose.connection.on('error', (err) => {console.log('Database error '+err)});


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
                                    name: employee.name,
                                    company: employee.company
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
    if(!socket.user.isAdmin) {
        socket.join(socket.user._id);
    }

    // ok
    socket.on('cl-adminJoinRooms', socketData => {
        for(let room of socketData.rooms){
            socket.join(room);
        }        
    })

    // ok
    socket.on('cl-adminLeaveRooms', () => {
        let _objKeys = Object.keys(socket.rooms);
        for(let i = 1; i < _objKeys.length; i++){
            socket.leave(_objKeys[i]);
        }       
    })

    // ok
    socket.on('cl-adminLeaveOneRoom', socketData => {
        socket.leave(socketData.room);
    })

    // ok
    socket.on('cl-adminLeaveAndJoinRoom', socketData => {
        socket.leave(socketData.roomLeave);
        socket.join(socketData.roomJoin);
    })

    // ok
    socket.on('cl-getInitNotifEmployee', () => {
        console.log(`
            ${socket.user.name.firstName} ${socket.user.name.lastName} is requesting initial notifications
        `);

        EmployeeTimeIn.find({employee: socket.user._id})
        .limit(100)
        .sort({timeIn: -1})
        .exec(function (err, employeeTimeIns) {
            if (err) throw err;
            else{
                socket.emit('sv-sendInitNotif', employeeTimeIns);
                console.log(`
                    ${employeeTimeIns.length} initial notifications succesfully sent to ${socket.user.name.firstName} ${socket.user.name.lastName}
                `);
            }

        });
    })

    // ok
    socket.on('cl-getEmployeeStatus', socketData => {
        console.log('Admin requesting details of employee');
        let isOnline = getClientsInRoom(io.sockets, socketData.employeeId);
        if(isOnline){
            io.to(socketData.employeeId).emit('sv-myCurrentStatus');
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
                                employeeId: socketData.employeeId,
                                name: timeIn.employee.name,
                                pic: timeIn.employee.pic,
                                previousLocation: timeIn.map,
                                isOnline: false,
                                selfies: timeIn.pics
                            }
                        })
                        console.log('Details of employee successfully sent to admin');

                        socket.emit('sv-sendSelectedEmployeeStatus', employee[0]);
                        socket.emit('sv-sendEmployeeStatus', {
                            isOnline: false,
                            id: socketData.employeeId
                        });
                        
                    } 
                });
        }
        
        // let _objKeys = Object.keys(socket.rooms);
        // if(_objKeys.length > 2){
        //     for(let i = 1; i < _objKeys.length; i++){
        //         if (_objKeys[i] == 'adminRoom') continue;
        //         if(socketData.employeeId == _objKeys[i]) continue;
        //         socket.leave(_objKeys[i]);
        //     }
        // } // Util.uploadMultiple([_newEmployee.pic.original, 'https://res.cloudinary.com/dka3vzadb/image/upload/v1518572757/x4t0x3nxrvsa5gubnbvv.png'], (err, results) => {
        //             if (err) { 
        //                 Account.findByIdAndRemove(account._id);
        //                 throw err;
        //             }
        //             if(results.length) {
        //                 newEmployee.pic = {
        //                     original: results[0].original,
        //                     thumb: results[0].thumb
        //                 }
        //                 console.log(results);
        //                 newEmployee.save(callback);
        //             }
        //         }) // Util.uploadMultiple([_newEmployee.pic.original, 'https://res.cloudinary.com/dka3vzadb/image/upload/v1518572757/x4t0x3nxrvsa5gubnbvv.png'], (err, results) => {
        //             if (err) { 
        //                 Account.findByIdAndRemove(account._id);
        //                 throw err;
        //             }
        //             if(results.length) {
        //                 newEmployee.pic = {
        //                     original: results[0].original,
        //                     thumb: results[0].thumb
        //                 }
        //                 console.log(results);
        //                 newEmployee.save(callback);
        //             }
        //         }) // Util.uploadMultiple([_newEmployee.pic.original, 'https://res.cloudinary.com/dka3vzadb/image/upload/v1518572757/x4t0x3nxrvsa5gubnbvv.png'], (err, results) => {
        //             if (err) { 
        //                 Account.findByIdAndRemove(account._id);
        //                 throw err;
        //             }
        //             if(results.length) {
        //                 newEmployee.pic = {
        //                     original: results[0].original,
        //                     thumb: results[0].thumb
        //                 }
        //                 console.log(results);
        //                 newEmployee.save(callback);
        //             }
        //         })
        // socket.join(socketData.employeeId);

        // SocketClient.findOne({employeeId: socketData.employeeId})
        // .exec((err, socketClient) =>{
        //     if (err) console.log(err);
        //     if (socketClient) {
        //         console.log('Admin requesting status of selected employee');
        //         io.to(socketClient.socketId).emit('sv-myCurrentStatus');
        //     }
        //     else{
        //         console.log('Employee is offline');
        //         EmployeeTimeIn.find({employee: socketData.employeeId})
        //         .populate( // Util.uploadMultiple([_newEmployee.pic.original, 'https://res.cloudinary.com/dka3vzadb/image/upload/v1518572757/x4t0x3nxrvsa5gubnbvv.png'], (err, results) => {
        //             if (err) { 
        //                 Account.findByIdAndRemove(account._id);
        //                 throw err;
        //             }
        //             if(results.length) {
        //                 newEmployee.pic = {
        //                     original: results[0].original,
        //                     thumb: results[0].thumb
        //                 }
        //                 console.log(results);
        //                 newEmployee.save(callback);
        //             }
        //         })
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
        //                     return {
        //                         name: timeIn.employee.name,
        //                         pic: timeIn.employee.pic,
        //                         previousLocation: timeIn.map,
        //                         isOnline: false,
        //                         selfie: timeIn.pic
        //                     }
        //                 })
        //                 console.log('Details of employee successfully sent to admin');
        //                 io.to(socketData.employeeId).emit('sv-sendSelectedEmployeeStatus', employee[0]);
        //                 io.to('adminRoom').emit('sv-sendEmployeeStatus', {
        //                     isOnline: true,
        //                     id: socketData.employeeId
        //                 });
                        
        //             } 
        //         });
        //     }
        // });
    })

    socket.on('cl-getInitialAllEmployeeStatus', socketData => {
        for(let e of socketData.employeeIds){
            io.to(e).emit('sv-myCurrentStatus');
        }
    })

    // ok
    socket.on('cl-myCurrentStatus', socketData => {
        EmployeeTimeIn.find({employee: socket.user._id})
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
                        employeeId: socket.user._id,
                        name: timeIn.employee.name,
                        pic: timeIn.employee.pic,
                        previousLocation: timeIn.map,
                        isOnline: true,
                        selfies: timeIn.pics
                    }
                })
                let e = Object.assign({}, {id: socket.user._id, isOnline: true,});
                if (socketData.location) Object.assign(e, {currentLocation: socketData.location});
                io.to(socket.user.company).emit('sv-sendEmployeeStatus', e);

                if (socketData.battery) Object.assign(e, {battery: socketData.battery});
                if (socketData.connection) Object.assign(e, {connectionType: socketData.connection});
                if (socketData.phone) Object.assign(e, {phone: socketData.phone});
                e = Object.assign({}, e, employee[0]);
                io.to(socket.user._id).emit('sv-sendSelectedEmployeeStatus', e);
                console.log('Employee status successfully sent to admin');
            } 
        });
        // SocketClient.findOne({socketId: socket.id})
        // .exec((err, socketClient) =>{
        //     if (err) console.log(err);
        //     if (socketClient) {
        //         EmployeeTimeIn.find({employee: socket.user._id})
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
        //                     return {
        //                         name: timeIn.employee.name,
        //                         pic: timeIn.employee.pic,
        //                         previousLocation: timeIn.map,
        //                         isOnline: true,
        //                         selfie: timeIn.pic
        //                     }
        //                 })
        //                 let e = Object.assign({}, {id: socketClient.employeeId, isOnline: true,});
        //                 if (socketData.location) Object.assign(e, {currentLocation: socketData.location});
        //                 console.log(socketData);
        //                 io.to('adminRoom').emit('sv-sendEmployeeStatus', e);

        //                 if (socketData.battery) Object.assign(e, {battery: socketData.battery});
        //                 if (socketData.connection) Object.assign(e, {connectionType: socketData.connection});
        //                 if (socketData.phone) Object.assign(e, {phone: socketData.phone});
        //                 e = Object.assign({}, e, employee[0]);
        //                 console.log(socketClient.employeeId);
        //                 io.to(socket.user._id).emit('sv-sendSelectedEmployeeStatus', e);
        //                 console.log('Employee status successfully sent to admin');
        //             } 
        //         });

                
        //     }
        // });
        
    })

    // ok
    socket.on('cl-getInitNotif', socketData => {
        console.log(`
            Admin ${socket.user.name.firstName} ${socket.user.name.lastName} requesting initial notifications
        `);

        EmployeeTimeIn.getInitNotif(socketData.company, (err, employeeTimeIns) => {

            if(err) console.log(err);
            else{
                employeeTimeIns = employeeTimeIns.map(employeeTimeIn => {
                    employeeTimeIn = employeeTimeIn._id;
                    return {
                        id: employeeTimeIn.id,
                        name: employeeTimeIn.name[0],
                        pic: employeeTimeIn.pic[0].thumb,
                        timeIn: employeeTimeIn.timeIn,
                        isSeen: employeeTimeIn.isSeen,
                        employeeId: employeeTimeIn.employeeId
                    }
                })

                console.log('Initial notifications succesfully sent to admin');
                socket.emit('sv-sendInitNotif', employeeTimeIns);
            }
        })
    });

    // ok
    socket.on('cl-getAdditionalNotif', socketData => {
        console.log(`Admin is requesting additions notifications\nSocketId: ${socket.id}`);
        EmployeeTimeIn.getAdditionalNotif(socketData.company, socketData.timeIn, (err, employeeTimeIns) => {
            if(err) console.log(err);
            else{
                employeeTimeIns = employeeTimeIns.map(employeeTimeIn => {
                    employeeTimeIn = employeeTimeIn._id;
                    return {
                        id: employeeTimeIn.id,
                        name: employeeTimeIn.name[0],
                        pic: employeeTimeIn.pic[0].thumb,
                        timeIn: employeeTimeIn.timeIn,
                        isSeen: employeeTimeIn.isSeen,
                        employeeId: employeeTimeIn.employeeId
                    }
                })
                console.log('Additional notifications succesfully sent to admin');
                socket.emit('sv-sendAdditionNotif', employeeTimeIns);
            }
        })
    });

    // ok
    socket.on('cl-timeIn', (socketdata, clientCallback) => {
        Util.uploadMultiple(socketdata.pics, (err, uploadedImages) => {
                    if (err) throw err;
                    if(uploadedImages.length) {
                        console.log(`Selfies of ${socket.user.name.firstName} ${socket.user.name.lastName} successfully uploaded`);
                        unirest.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${socketdata.map.lat},${socketdata.map.lng}&key=AIzaSyDuOss95cF1Xa6hfbn7M_fC7plWH9GCnj8`)
                            .end(
                                response => {
                                    let formattedAddress = response.body.results[0].formatted_address;
                                    let employeeTimeIn = new EmployeeTimeIn({
                                        employee: socket.user._id,
                                        timeIn: socketdata.timeIn,
                                        pics: uploadedImages,
                                        scanDecoded: socketdata.scanResult,
                                        map: {
                                            lng: socketdata.map.lng,
                                            lat: socketdata.map.lat,
                                            formattedAddress: formattedAddress
                                        },
                                        batteryStatus: socketdata.batteryStatus,
                                        createdAt: Math.floor(Date.now() /1000)
                                    });
                        
                                    EmployeeTimeIn.addNew(employeeTimeIn, (err, timeIn) => {
                                        if (err) console.log(err);
                                        if(timeIn){
                                            console.log(`Time In of ${socket.user.name.firstName} ${socket.user.name.lastName} successfully saved\n`);

                                            clientCallback({
                                                id: timeIn._id,
                                                timeIn: socketdata.timeIn,
                                                formattedAddress: formattedAddress
                                            })
                                            
                                            // socket.emit('sv-successTimeIn', );
                                            console.log(`Response confirmation of time in succesfully sent to ${socket.user.name.firstName} ${socket.user.name.lastName}`)

                                            Employee.getEmployeeById(socket.user._id, (err, employee) => {
                                                if (err) console.log(err)
                                                if (employee) {
                                                    io.to(socket.user.company).emit('sv-newNotification', {
                                                        id: employeeTimeIn.id,
                                                        isSeen: false,
                                                        name: {
                                                            firstName: employee.name.firstName,
                                                            lastName: employee.name.lastName,
                                                        },
                                                        pic: employee.pic.thumb,
                                                        timeIn: employeeTimeIn.timeIn
                                                });
                                                }
                                            })
                                            
                                        }

                                    });
                                }
                            );
                    }
                })
        // cloudinary.v2.uploader.upload(socketdata.pic[0],function(err, result) {
        //     if (err) {
        //         console.log('error uploading')
        //         //console.log(err);
        //     } else {
        //         console.log(`Selfie of ${socket.user.name.firstName} ${socket.user.name.lastName} successfully uploaded`);
        //         unirest.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${socketdata.map.lat},${socketdata.map.lng}&key=AIzaSyDuOss95cF1Xa6hfbn7M_fC7plWH9GCnj8`)
        //             .end(
        //                 response => {
        //                     let formattedAddress = response.body.results[0].formatted_address;
        //                     let employeeTimeIn = new EmployeeTimeIn({
        //                         employee: socket.user._id,
        //                         timeIn: socketdata.timeIn,
        //                         pic: {
        //                             original: result.secure_url,
        //                             thumb: result.secure_url
        //                         },
        //                         map: {
        //                             lng: socketdata.map.lng,
        //                             lat: socketdata.map.lat,
        //                             formattedAddress: formattedAddress
        //                         },
        //                         batteryStatus: socketdata.batteryStatus,
        //                         createdAt: Math.floor(Date.now() /1000)
        //                     });
                
        //                     EmployeeTimeIn.addNew(employeeTimeIn, (err, timeIn) => {
        //                         if (err) console.log(err);
        //                         if(timeIn){
        //                             console.log(`Time In of ${socket.user.name.firstName} ${socket.user.name.lastName} successfully saved\n`);
        //                             socket.emit('sv-successTimeIn', {
        //                                 id: timeIn._id,
        //                                 timeIn: socketdata.timeIn,
        //                                 formattedAddress: formattedAddress
        //                             });
        //                             console.log(`Response confirmation of time in succesfully sent to ${socket.user.name.firstName} ${socket.user.name.lastName}`)

        //                             Employee.getEmployeeById(socket.user._id, (err, employee) => {
        //                                 if (err) console.log(err)
        //                                 if (employee) {
        //                                     io.to(socket.user.company).emit('sv-newNotification', {
        //                                     id: employeeTimeIn.id,
        //                                     isSeen: false,
        //                                     name: {
        //                                         firstName: employee.name.firstName,
        //                                         lastName: employee.name.lastName,
        //                                     },
        //                                     pic: employee.pic.thumb,
        //                                     timeIn: employeeTimeIn.timeIn
        //                                 });
        //                                 }
        //                             })
                                    
        //                         }

        //                     });
        //                 }
        //             );                                        
        //     } 
        // });
        // Employee.findById(socketdata.employeeId, (err, employee) => {
        //     let success = false;
        //     if (err) {
        //         console.log(err);
        //     } else if (!employee) {
        //         console.log(`_id ${socketdata.employeeId} not found`);
        //     } else {
        //         console.log(`New Time In From ${employee.name.firstName} ${employee.name.lastName}\nSocket ID: ${socket.id}\n`);
        //         cloudinary.v2.uploader.upload(socketdata.pic,function(err, result) {
        //             if (err) {
        //                 console.log('error uploading')
        //                 //console.log(err);
        //             } else {
        //                 console.log(`Selfie of ${employee.name.firstName} ${employee.name.lastName} successfully uploaded`);
        //                 unirest.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${socketdata.map.lat},${socketdata.map.lng}&key=AIzaSyDuOss95cF1Xa6hfbn7M_fC7plWH9GCnj8`)
        //                     .end(
        //                         response => {
        //                             let employeeTimeIn = new EmployeeTimeIn({
        //                                 employee: socketdata.employeeId,
        //                                 timeIn: socketdata.timeIn,
        //                                 pic: {
        //                                     original: result.secure_url,
        //                                     thumb: result.secure_url
        //                                 },
        //                                 map: {
        //                                     lng: socketdata.map.lng,
        //                                     lat: socketdata.map.lat,
        //                                     formattedAddress: response.body.results[0].formatted_address
        //                                 },
        //                                 batteryStatus: socketdata.batteryStatus
        //                             });
        //                             console.log(socketdata.timeIn);
                        
        //                             EmployeeTimeIn.addNew(employeeTimeIn, (err, timeIn) => {
        //                                 if (err) console.log(err);
        //                                 if(employeeTimeIn){
        //                                     console.log(`Time In of ${employee.name.firstName} ${employee.name.lastName} successfully saved\n`);
        //                                     io.to(socket.id).emit('sv-successTimeIn', {
        //                                         id: employeeTimeIn._id,
        //                                         timeIn: socketdata.timeIn,
        //                                         formattedAddress: response.body.results[0].formatted_address
        //                                     });
        //                                     console.log(`Response confirmation of time in succesfully sent to ${employee.name.firstName} ${employee.name.lastName}`)

        //                                     io.emit('sv-newNotification', {
        //                                         id: employeeTimeIn.id,
        //                                         isSeen: false,
        //                                         name: {
        //                                             firstName: employee.name.firstName,
        //                                             middleName: employee.name.middleName, 
        //                                             lastName: employee.name.lastName,
        //                                         },
        //                                         pic: employee.pic.thumb,
        //                                         timeIn: employeeTimeIn.timeIn
        //                                     });
        //                                 }
                                        
                                        
        //                             });
        //                         }
        //                     );                                        
        //             } 
        //         });
        //     }
        // })        
    });

    // ok
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
                    pics: employeeTimeIn.pics,
                    map: employeeTimeIn.map,
                    timeIn: employeeTimeIn.timeIn,
                    scanDecoded: employeeTimeIn.scanDecoded,
                    batteryStatus: employeeTimeIn.batteryStatus
                })
            }
        })
    });

    // ok
    socket.on('cl-typing', socketData => {
        if (socketData.employeeId) {
            console.log('Admin typing');
            io.to(socketData.employeeId).emit('sv-adminTyping');
        } else {
            console.log('Employee typing');
            io.to(socket.user._id).emit('sv-employeeTyping');
        }
        
        
    })

    // ok
    socket.on('cl-getInitMessages', socketData => {
        let id = socket.user.isAdmin ? socketData.notificationId : socket.user._id;
        Message.getInitialMessages(socket.user.isAdmin, id, (err, employeeMessages) => {
            if(err) console.log(err);
            else{
                console.log('Initial message history for selected employee successfully sent');
                socket.emit('sv-sendInitMessages', employeeMessages);
            }
        })

        
        ///sort and limit the result
        // if (!socket.user.isAdmin) {
        //     console.log('Employee requesting initial messages');
        //     Employee.findById(socket.user._id, (err, employee) =>{
        //         if (err) console.log(err);
        //         if (employee) {
        //             console.log('Initial message history for selected employee successfully sent');
        //             socket.emit('sv-sendInitMessages', employee.messages);
        //         } 
                        
        //     })
        // } 
        // else {
        //     console.log('Request initial message history of selected employee');
        //     EmployeeTimeIn.findById(socketData.notificationId, (err, employeeTimeIn) =>{
        //         if (err) console.log(err);
        //         if (employeeTimeIn) {
        //             Employee.findById(employeeTimeIn.employee)
        //             .exec((err, employee) => {
        //                 if (err) console.log(err);
        //                 if (employee) {
                            
        //                     let _objKeys = Object.keys(socket.rooms);
        //                     if(_objKeys.length > 2){
        //                         for(let i = 1; i < _objKeys.length; i++){
        //                             if (_objKeys[i] == employee.company) continue;
        //                             if (_objKeys[i] == employee._id) continue;
        //                             socket.leave(_objKeys[i]);
        //                         }
        //                     }
        //                     socket.join(employee._id);
                            
        //                     Employee.aggregate([
        //                         {"$match": {"_id": employeeTimeIn.employee}},
        //                         {"$project": {
        //                             "messages": 1,
        //                         }},
        //                         {"$unwind": "$messages"},
        //                         {"$sort": {"messages.sentAt": -1}},
        //                         {"$limit": 20},
        //                         {"$project": {
        //                             "messages": "$messages"
        //                         }},
        //                     ])
        //                     .exec((err, results) => {
        //                         if (err) console.log(err);
        //                         if (results) {
        //                             results = results.map(result => {
        //                                 return result.messages
        //                             })
        //                             employee = Object.assign({}, {
        //                                 _id: employee._id,
        //                                 name: employee.name,
        //                                 pic: employee.pic
        //                             }, {messages: results});
        //                             console.log('Initial message history for selected employee successfully sent');
        //                             socket.emit('sv-sendInitMessages', employee);
        //                         }
        //                     })
        //                 }
        //             })
        //         } 
                
        //     })
        // }
        
    });

    // ok
    socket.on('cl-getAdditionalMessages', socketData => {
        console.log('Request additional message history of selected employee');
        let id = socket.user.isAdmin ? socketData.employeeId : socket.user._id;
        Message.getAdditionalMessages(id, socketData.sentAt, (err, messages) => {
            if(err) console.log(err)
            else{
                let employee = Object.assign({}, {
                    employeeId: socketData.employeeId,
                }, {messages: messages});
                console.log('Additional message history for selected employee successfully sent');
                socket.emit('sv-sendAdditionalMessages', employee);
            }
            
        })
    })
    
    // ok
    socket.on('cl-sendNewMessage', socketData => {
        console.log(socketData);
        console.log(`
            ${socket.user.isAdmin ? 'Admin' : 'Employee'} ${socket.user.name.firstName} ${socket.user.name.lastName} sending new message
            Content: ${socketData.content}
        `);
        
        let employeeId = socket.user.isAdmin ? socketData.employeeId : socket.user._id;
        let newMessage = new Message({
            employee: ObjectId(employeeId),
            isMe: !socket.user.isAdmin,
            content: socketData.content,
            sentAt: Math.floor(Date.now() /1000)
        });

        Message.addNew(newMessage, (err, message) => {
            if(err) console.log(err);
            if(message){
                console.log('New message saved');                
                let secret = socketData.secret ? socketData.secret : (Math.floor(Date.now() /1000) + 'qwqwew');
                let _newMessage = Object.assign({}, {
                    _id: newMessage._id,
                    employee: newMessage.employee,
                    seenAt: newMessage.seenAt,
                    sentAt: newMessage.sentAt,
                    content: newMessage.content,
                    isMe: newMessage.isMe,
                    secret: secret
                })
                io.to(employeeId).emit('sv-newMessage', _newMessage);

                if(!socket.user.isAdmin) {
                    Employee.findById(employeeId, (err, employee) => {
                        if(err) console.log(err);
                        if(employee) {
                            _newMessage = Object.assign({}, _newMessage, {
                                pic: employee.pic.thumb,
                                name: employee.name,
                                id: employee._id
                            })
                            delete _newMessage.secret;
                            delete _newMessage.isMe;
                            io.to(socket.user.company).emit('sv-newMessageNotif', _newMessage);
                        }
                    })
                    
                    
                }
                

                // newMessage = Object.assign({}, newMessage, {
                //     pic: employee.pic.thumb,
                //     name: employee.name,
                //     id: employee._id
                // })
                // delete newMessage.secret;
                // delete newMessage.isMe;

                // console.log(_newMessage);
                // return;


                // if(!socket.user.isAdmin) {
                //     newMessage = Object.assign({}, newMessage, {
                //         pic: employee.pic.thumb,
                //         name: employee.name,
                //         id: employee._id
                //     })
                //     delete newMessage.secret;
                //     delete newMessage.isMe;
                //     io.to(socket.user.company).emit('sv-newMessageNotif', newMessage);
                // }
            }
        })

        // Employee.findByIdAndUpdate(employeeId, {
        //     $push: {'messages': newMessage}
        // }, (err, employee) => {
        //     if(err) console.log(err);

        //     if(employee){
        //         console.log('New message saved');
        //         newMessage.secret = socketData.secret ? socketData.secret : (Math.floor(Date.now() /1000) + 'qwqwew');

        //         io.to(employeeId).emit('sv-newMessage', newMessage);

        //         if(!socket.user.isAdmin) {
        //             newMessage = Object.assign({}, newMessage, {
        //                 pic: employee.pic.thumb,
        //                 name: employee.name,
        //                 id: employee._id
        //             })
        //             delete newMessage.secret;
        //             delete newMessage.isMe;
        //             io.to(socket.user.company).emit('sv-newMessageNotif', newMessage);
        //         }
                
        //     }

        // })
    });

    // ok
    socket.on('cl-seenMessage', socketData => {
        Message.findById(socketData._id, (err, message) => {
            if(err) console.log(err);
            if(message){
                if(!message.seenAt) message.seenAt = Math.floor(Date.now() /1000);
                message.save((_err, _message) => {
                    io.to(_message.employee).emit('sv-seenMessage', {
                        _id: _message._id,
                        seenAt: _message.seenAt
                    })
                });
                
            }
        })
    })

    // ok
    socket.on('cl-getRecentTimeIns', socketData => {
        console.log('Admin requesting employees recent time ins');
        EmployeeTimeIn.getRecentTimeIns(socketData.company, (err, employeeTimeIns) => {
            if(err) console.log(err)
            else{
                employeeTimeIns = employeeTimeIns.map(employeeTimeIn => {
                    return {
                        id: employeeTimeIn._id,
                        name: employeeTimeIn.employeeDetails[0].name,
                        pic: employeeTimeIn.employeeDetails[0].pic,
                        isOnline: false,
                        currentLocation: employeeTimeIn.map
                    }
                })
                socket.emit('sv-sendRecentTimeIns', employeeTimeIns);
                console.log('Employees recent time ins successfully sent to admin');
            }
        })
        
    })

    // ok
    socket.on('cl-unseenLogsCount', socketData => {
        EmployeeTimeIn.getUnseenLogsCount(socketData.company, (err, employeeTimeIns) => {
            if (err) console.log(err);
            else{
                socket.emit('sv-unseenLogsCount', employeeTimeIns.length);
            }
        })        
    })

    // ok
    socket.on('cl-saveEmployee', (socketData, clientCallback) => {
        if(socketData.add){
            Employee.addNew(socketData, (err, employee) => {
                if(err) throw err;
                if(employee){
                    console.log(`
                        New employee successfully save
                        Id: ${employee._id}
                        Name: ${employee.name.firstName} ${employee.name.lastName}
                    `);
                    socket.emit('sv-saveEmployee',{
                        success: true,
                        employee: employee,
                        add: true,
                        msg: 'New Employee successfull save'
                    })

                }
                
            });
        }
        if(socketData.update){
            Employee.update(socketData, clientCallback);
        }
    })

    // ok
    socket.on('cl-getAllEmployee', socketData => {
        console.log(`
            Admin ${socket.user.name.firstName} ${socket.user.name.lastName} requesting initial list of employee
        `);
        Employee.getAll(socketData.company, (err, employees) => {

            if(err) throw err;
            if(employees){
                console.log(`
                    ${employees.length} employees successfully sent to Admin ${socket.user.name.firstName} ${socket.user.name.lastName}
                `);
                socket.emit('sv-sendAllEmployees', employees);
            }
        })
      //  socket.emit('sv-sendAllEmployee');
    })

    socket.on('cl-deleteEmployee', socketData => {
        Employee.delete(socketData.employeeId, (err, employee) => {
            console.log(`Employee ${employee.name.firstName} ${employee.name.lastName} marked as deleted`);
        });
    })



    socket.on('disconnect', () => {
        
        console.log('Client disconnected with ID: ' + socket.id)

        if(!socket.user.isAdmin){
            let isOnline = getClientsInRoom(io.sockets, socket.user._id, true);
            if(!isOnline){
                io.to(socket.user._id).emit('sv-sendSelectedEmployeeStatus', {
                    isOnline: false,
                    employeeId: socket.user._id
                });
                io.to(socket.user.company).emit('sv-sendEmployeeStatus', {
                    isOnline: false,
                    id: socket.user._id
                });
            }
        }
        // SocketClient.findOne({socketId: socket.id})
        // .exec((err, socketClient) =>{
        //     if (err) console.log(err);
        //     if (socketClient) {
        //         SocketClient.find({ socketId:socket.id }).remove().exec();
        //         SocketClient.find({employeeId: socketClient.employeeId})
        //         .exec((err, socketClients) =>{
        //             if (err) console.log(err);
        //             if (socketClients) {
        //                 console.log(`Socket count: ${socketClients.length}`);
        //                 console.log(socketClients);
        //                 if (!socketClients.length) {
                            
        //                     let d = Object.assign({}, {
        //                         isOnline: false,
        //                         id: socketClient.employeeId
        //                     })
        //                     console.log(socketClient.employeeId);
        //                     io.to(socketClient.employeeId).emit('sv-sendSelectedEmployeeStatus', d);
        //                     io.to('adminRoom').emit('sv-sendEmployeeStatus', d);
        //                 }
        //             }
        //         });
        //     }
            
        // });

    });


        
});

function getClientsInRoom(_io, employeeId, handleDisconnection){
    let clients = Object.values(_io.sockets);

    if(handleDisconnection){
        let clientCount = 0;
        for (let client of clients){
            if(client.user._id != employeeId) continue;
            if (clientCount == 2) return true;
            clientCount++;
        }
        return false;
    }
    else{
        for (let client of clients){
            if(client.user._id == employeeId) return true;
        }
        return false;
    }
    
    

}