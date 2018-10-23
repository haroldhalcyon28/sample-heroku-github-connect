

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
var _ = require('lodash');

const Account = require('./models/account');
const Employee = require('./models/employee');


const Message = require('./models/message');
const EmployeeTimeIn = require('./models/employee-time-in');
const SocketClient = require('./models/socket-client');

const mongoose = require('mongoose');
const ObjectId = require('mongodb').ObjectID;
const config = require('./config/config');
const cloudinary = config.cloudinary;
const Util = require('./util/util');
const logger = Util.logger;

mongoose.connect(config.database.uri, { useMongoClient: true});
// On Connection
mongoose.connection.on('connected', () => {logger.debug('Connected to Database ')});
// On Error
mongoose.connection.on('error', (err) => {logger.error('Database error '+err)});


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


// EmployeeTimeIn.find({}).exec((err, es) => {
//     if(err){

//     }
//     else{
//         for(let e of es){
//             console.log(e.scanDecoded);
//             // if(!isNaN(e.scanDecoded)) {
//             //     e.scanDecoded = `b${e.scanDecoded}`;
//             //     // 8806088564425
//             // }
//             // else if(e.scanDecoded == undefined){
//             //     e.scanDecoded = `b8806088564425`;
//             // }
//             // else{
//             //     e.scanDecoded = `q${e.scanDecoded}`;
//             // }
//             // e.save((err, d) => {

//             // })
//         }
//     }
// })

// (async (nes) => {
//     let das = await new Promise(resolve => {
//         setTimeout(() => {
//             resolve(nes);
//         }, 3000)
//     })
//     return das
// })('hello world').then(dsad => {
//     console.log(dsad + 321)
// });


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
        logger.error("Collection couldn't be removed" + err);
        return;
    }
    logger.debug("SocketClient collection removed");
})



const jwt = require('jsonwebtoken');

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
                            if (err) logger.error(err);
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
    logger.debug(`
        New socket client connected
        Socket ID: ${socket.id}
        ${socket.user.isAdmin ? 'Admin' : 'Employee'} ID: ${socket.user._id}
        Username: ${socket.user.username}
    `);
    return next();
})

//   logger.debug(Object.keys(io.sockets.connected));
  
io.on('connection', (socket) => {
    if(!socket.user.isAdmin) {
        socket.join(socket.user._id);
    }

    
    socket.on('cl-adminJoinRooms', socketData => {
        for(let room of socketData.rooms){
            socket.join(room);
        }        
    })

    
    socket.on('cl-adminLeaveRooms', () => {
        let _objKeys = Object.keys(socket.rooms);
        for(let i = 1; i < _objKeys.length; i++){
            socket.leave(_objKeys[i]);
        }       
    })

    
    socket.on('cl-adminLeaveOneRoom', socketData => {
        socket.leave(socketData.room);
    })

    
    socket.on('cl-adminLeaveAndJoinRoom', socketData => {
        let _objKeys = Object.keys(socket.rooms);
        let roomLeaveFound = false;
        for(let i = 0; i < _objKeys.length; i++){
            if (_objKeys[i] === socketData.roomLeave){
                roomLeaveFound = true;
                break;
            }
        }
        if(roomLeaveFound){
            if(socketData.roomLeave !== socketData.roomJoin){
                socket.leave(socketData.roomLeave);
                socket.join(socketData.roomJoin);
            }
        }
        else{
            socket.join(socketData.roomJoin);
        }
        
        
    })

    
    socket.on('cl-getInitNotifEmployee', () => {
        logger.debug(`
            ${socket.user.name.firstName} ${socket.user.name.lastName} is requesting initial notifications
        `);

        EmployeeTimeIn.find({employee: socket.user._id})
        .limit(100)
        .sort({timeIn: -1})
        .exec(function (err, employeeTimeIns) {
            if (err) throw err;
            else{
                socket.emit('sv-sendInitNotif', employeeTimeIns);
                logger.debug(`
                    ${employeeTimeIns.length} initial notifications succesfully sent to ${socket.user.name.firstName} ${socket.user.name.lastName}
                `);
            }

        });
    })

    
    socket.on('cl-getEmployeeStatus', socketData => {
        logger.debug('Admin requesting details of employee');
        let isOnline = getClientsInRoom(io.sockets, socketData.employeeId);
        if(isOnline){
            io.to(socketData.employeeId).emit('sv-myCurrentStatus');
        }
        else{
            logger.debug('Employee is offline');
            EmployeeTimeIn.find({employee: socketData.employeeId})
            .populate(
                {
                    path:'employee',
                    select: 'name  pic'
                })
            .limit(1)
            .sort({timeIn: -1})
            .exec(function (err, employeeTimeIns) {
                if (err) logger.error(err);

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
                    logger.debug('Details of employee successfully sent to admin');

                    socket.emit('sv-sendSelectedEmployeeStatus', employee[0]);
                    socket.emit('sv-sendEmployeeStatus', {
                        isOnline: false,
                        id: socketData.employeeId
                    });
                    
                } 
            });
        }
    })

    socket.on('cl-getInitialAllEmployeeStatus', socketData => {
        for(let e of socketData.employeeIds){
            io.to(e).emit('sv-myCurrentStatus');
        }
    })

    
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
            if (err) logger.error(err);
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
                if (!_.isEmpty(socketData.location)) Object.assign(e, {currentLocation: socketData.location});
                io.to(socket.user.company).emit('sv-sendEmployeeStatus', e);

                if (socketData.battery) Object.assign(e, {battery: socketData.battery});
                if (socketData.connection) Object.assign(e, {connectionType: socketData.connection});
                if (socketData.phone) Object.assign(e, {phone: socketData.phone});
                e = Object.assign({}, e, employee[0]);
                io.to(socket.user._id).emit('sv-sendSelectedEmployeeStatus', e);
                logger.debug('Employee status successfully sent to admin');
            } 
        });        
    })

    
    socket.on('cl-getInitNotif', socketData => {
        logger.debug(`
            Admin ${socket.user.name.firstName} ${socket.user.name.lastName} requesting initial notifications
        `);

        EmployeeTimeIn.getInitNotif(socketData.company, (err, employeeTimeIns) => {

            if(err) logger.error(err);
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

                logger.debug('Initial notifications succesfully sent to admin');
                socket.emit('sv-sendInitNotif', employeeTimeIns);
            }
        })
    });

    
    socket.on('cl-getAdditionalNotif', socketData => {
        logger.debug(`Admin is requesting additions notifications\nSocketId: ${socket.id}`);
        EmployeeTimeIn.getAdditionalNotif(socketData.company, socketData.timeIn, (err, employeeTimeIns) => {
            if(err) logger.error(err);
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
                logger.debug('Additional notifications succesfully sent to admin');
                socket.emit('sv-sendAdditionNotif', employeeTimeIns);
            }
        })
    });

    
    socket.on('cl-timeIn', (socketdata, clientCallback) => {
        Util.uploadMultiple(socketdata.pics, (err, uploadedImages) => {
            if (err) logger.error(err);
            else{
                if(uploadedImages.length) {
                    logger.debug(`Selfies of ${socket.user.name.firstName} ${socket.user.name.lastName} successfully uploaded`);
                    unirest.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${socketdata.map.lat},${socketdata.map.lng}&key=AIzaSyDuOss95cF1Xa6hfbn7M_fC7plWH9GCnj8`)
                        .end(
                            response => {
                                console.log("RESPONSE", response);
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
                                    if (err) logger.error(err);
                                    if(timeIn){
                                        logger.debug(`Time In of ${socket.user.name.firstName} ${socket.user.name.lastName} successfully saved\n`);
    
                                        clientCallback({
                                            id: timeIn._id,
                                            timeIn: socketdata.timeIn,
                                            formattedAddress: formattedAddress
                                        })
                                        
                                        // socket.emit('sv-successTimeIn', );
                                        logger.debug(`Response confirmation of time in succesfully sent to ${socket.user.name.firstName} ${socket.user.name.lastName}`)
    
                                        Employee.getEmployeeById(socket.user._id, (err, employee) => {
                                            if (err) logger.error(err)
                                            if (employee) {
                                                io.to(socket.user.company).emit('sv-newNotification', {
                                                    employeeId: employee._id,
                                                    id: employeeTimeIn.id,
                                                    isSeen: false,
                                                    name: {
                                                        firstName: employee.name.firstName,
                                                        lastName: employee.name.lastName,
                                                    },
                                                    pic: employee.pic.thumb,
                                                    timeIn: employeeTimeIn.timeIn,
                                                    _t: `${employeeTimeIn.id}.${employeeTimeIn.timeIn}.${socket.user.company}`
                                                });
                                            }
                                        })
                                        
                                    }
    
                                });
                            }
                        );
                }
            }
            
        })       
    });

    
    socket.on('cl-getNotifDetails', socketData => {
        logger.debug('Admin requesting notification details');

        EmployeeTimeIn.findById(socketData.id)
        .exec((err, employeeTimeIn) => {
            if(err) logger.error(err);
            if (employeeTimeIn) {
                if (!employeeTimeIn.isSeen) {
                    employeeTimeIn.isSeen = true,
                    employeeTimeIn.seenAt = Math.floor(Date.now() /1000);
                    employeeTimeIn.save();
                    io.to(employeeTimeIn.employee).emit('sv-notifSeen', {id: socketData.id});
                    logger.debug('Seen notification successfully sent to employee');
                }

                logger.debug('Notification details succesfully sent to admin');
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

    
    socket.on('cl-typing', socketData => {
        if (socketData.employeeId) {
            logger.debug('Admin typing');
            io.to(socketData.employeeId).emit('sv-adminTyping');
        } else {
            logger.debug('Employee typing');
            io.to(socket.user._id).emit('sv-employeeTyping');
        }
        
        
    })

    
    socket.on('cl-getInitMessages', socketData => {
        let id = socket.user.isAdmin ? socketData.notificationId : socket.user._id;
        Message.getInitialMessages(socket.user.isAdmin, id, (err, employeeMessages) => {
            if(err) logger.error(err);
            else{
                logger.debug('Initial message history for selected employee successfully sent');
                socket.emit('sv-sendInitMessages', employeeMessages);
            }
        })
        
    });

    
    socket.on('cl-getAdditionalMessages', socketData => {
        logger.debug('Request additional message history of selected employee');
        let id = socket.user.isAdmin ? socketData.employeeId : socket.user._id;
        Message.getAdditionalMessages(id, socketData.sentAt, (err, messages) => {
            if(err) logger.error(err)
            else{
                let employee = Object.assign({}, {
                    employeeId: socketData.employeeId,
                }, {messages: messages});
                logger.debug('Additional message history for selected employee successfully sent');
                socket.emit('sv-sendAdditionalMessages', employee);
            }
            
        })
    })
    
    
    socket.on('cl-sendNewMessage', socketData => {
        logger.debug(socketData);
        logger.debug(`
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
            if(err) logger.error(err);
            if(message){
                logger.debug('New message saved');                
                let secret = socketData.secret ? socketData.secret : (Math.floor(Date.now() /1000) + 'qwqwew');
                let _newMessage = Object.assign({}, {
                    _id: newMessage._id,
                    employee: newMessage.employee,
                    seenAt: newMessage.seenAt,
                    sentAt: newMessage.sentAt,
                    content: newMessage.content,
                    isMe: newMessage.isMe,
                    secret: secret,
                    _m: `${newMessage._id}.${newMessage.sentAt}.${socket.user.company ? socket.user.company : socketData.company}`
                })

                io.in(employeeId).emit('sv-newMessage', _newMessage);

                if(!socket.user.isAdmin) {
                    Employee.findById(employeeId, (err, employee) => {
                        if(err) logger.error(err);
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
                
            }
        })
    });

    
    socket.on('cl-seenMessage', socketData => {
        Message.findById(socketData._id, (err, message) => {
            if(err) logger.error(err);
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

    
    socket.on('cl-getRecentTimeIns', socketData => {
        logger.debug('Admin requesting employees recent time ins');
        EmployeeTimeIn.getRecentTimeIns(socketData.company, (err, employeeTimeIns) => {
            if(err) logger.error(err)
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
                logger.debug('Employees recent time ins successfully sent to admin');
            }
        })
        
    })

    
    socket.on('cl-unseenLogsCount', socketData => {
        EmployeeTimeIn.getUnseenLogsCount(socketData.company, (err, employeeTimeIns) => {
            if (err) logger.error(err);
            else{
                socket.emit('sv-unseenLogsCount', employeeTimeIns.length);
            }
        })        
    })

    
    socket.on('cl-saveEmployee', (socketData, clientCallback) => {
        if(socketData.add){
            Employee.addNew(socketData, (err, employee) => {
                if(err) throw err;
                if(employee){
                    logger.debug(`
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

    
    socket.on('cl-getAllEmployee', socketData => {
        logger.debug(`
            Admin ${socket.user.name.firstName} ${socket.user.name.lastName} requesting initial list of employee
        `);
        Employee.getAll(socketData.company, (err, employees) => {

            if(err) throw err;
            if(employees){
                logger.debug(`
                    ${employees.length} employees successfully sent to Admin ${socket.user.name.firstName} ${socket.user.name.lastName}
                `);
                socket.emit('sv-sendAllEmployees', employees);
            }
        })
      //  socket.emit('sv-sendAllEmployee');
    })

    socket.on('cl-deleteEmployee', socketData => {
        Employee.delete(socketData.employeeId, (err, employee) => {
            logger.debug(`Employee ${employee.name.firstName} ${employee.name.lastName} marked as deleted`);
        });
    })

    socket.on('cl-idOfLastMessageAndTimein', socketData => {
        EmployeeTimeIn.getLastTimeIn(socketData.company, (err, employeeTimeIn) => {
            if(err) logger.error(err);
            else{
                if(employeeTimeIn.length){
                    let _employeeTimeIn = employeeTimeIn[0]._id;
                    socket.emit('sv-idOfLastMessageAndTimein', {
                        _t: `${_employeeTimeIn.id}.${_employeeTimeIn.timeIn}.${_employeeTimeIn.company[0]}` 
                    })
                }
            }
        })

        Message.getLastMessage(socketData.company, (err, message) => {
            if(err) logger.error(err);
            else{
                if(message.length){
                    let _message = message[0]._id;
                    socket.emit('sv-idOfLastMessageAndTimein', {
                        _m: `${_message.id}.${_message.sentAt}.${_message.company[0]}` 
                    })
                }
            }
        })


    })

    socket.on('cl-getLatestUpdate', socketData => {
        if(socketData._t){
            let _t = socketData._t.split('.');
            // let f = '5a95f0df532131316d175e74.1519775967.5a8299bbaf6e1f3a4c0294be';
            // let _t = f.split('.');
            let _employeeTimeIn = {
                _id: _t[0],
                timeIn: parseInt(_t[1]),
                company: _t[2]
            }

            EmployeeTimeIn.getLatestUpdate(_employeeTimeIn, (err, employeeTimeIns) => {
                if(err) logger.error(err);
                else{
                    if(employeeTimeIns.length){
                        if(socket.rooms[_employeeTimeIn.company]){
                            for(let e of employeeTimeIns){
                                let employeeTimeIn = e._id;
                                socket.emit('sv-newNotification', {
                                    id: employeeTimeIn.id,
                                    name: employeeTimeIn.name[0],
                                    pic: employeeTimeIn.pic[0].thumb,
                                    timeIn: employeeTimeIn.timeIn,
                                    isSeen: employeeTimeIn.isSeen,
                                    employeeId: employeeTimeIn.employeeId,
                                    _t: `${employeeTimeIn.id}.${employeeTimeIn.timeIn}.${_employeeTimeIn.company}` 
                                })
                            }
                        }
                        
                    }
                }
            })
        }

        if(socketData._m){
            let _m = socketData._m.split('.');
            let _message = {
                _id: _m[0],
                sentAt: parseInt(_m[1]),
                company: _m[2]
            }

            Message.getLatestUpdate(_message, (err, messages) => {
                if(err) logger.error(err);
                else{
                    if(messages.length){
                        if(socket.rooms[_message.company]){
                            for(var i = 0; i < messages.length; i++){
                                let m = messages[i]._id;
                                let secret = (Math.floor(Date.now() /1000) + 'qwqwew' + i);
                                let message = Object.assign({}, {
                                    _id: m._id,
                                    employee: m.employee,
                                    seenAt: m.seenAt,
                                    sentAt: m.sentAt,
                                    content: m.content,
                                    isMe: m.isMe,
                                    secret: secret,
                                    _m: `${m._id}.${m.sentAt}.${_message.company}` 
                                })
                                if(socket.rooms[m.employee]){
                                    socket.emit('sv-newMessage', message);
                                }
    
                                if(message.isMe) {
                                    message = Object.assign({}, message, {
                                        pic: m.pic[0].thumb,
                                        name: m.name[0],
                                        id: m.employee
                                    })
                                    delete message.secret;
                                    delete message.isMe;
                                    socket.emit('sv-newMessageNotif', message);
                                }
                            }
                        }
                        
                    }
                }
            })
        }


        

    })



    socket.on('disconnect', () => {
        
        logger.debug('Client disconnected with ID: ' + socket.id)

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

    });


        
});

function getClientsInRoom(_io, employeeId, handleDisconnection){
    let clients = _.values(_io.sockets);

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



// heroku logs --tail -a appname
// "start": "service mongod start & node ./node_modules/.bin/pm2-runtime server.js --watch"
