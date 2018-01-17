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
//             firstName: 'michael',
//             lastName: 'jordan',
//             middleName: ''
//         },
//         pic: {
//             original: 'http://i.imgur.com/98dZbMp.jpg',
//             thumb: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSdns3GwDPKCgqXxCmR-XRpAK17xi87HwQYuCBoGjsPe56vlbY5'
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

// cloudinary.uploader.upload("http://www.lovemarks.com/wp-content/uploads/profile-avatars/default-avatar-ginger-guy.png",function(result) { 
//     console.log(result)
//     console.log(cloudinary.image(result.secure_url, { width: 100, height: 150, crop: 'fill' }));
    
// });


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
const io = socketIO(server);


io.on('connection', (socket) => {
    console.log(`Client connected with ID: ${socket.id}`);
    

    socket.on('cl-getInitNotif', () => {
        console.log(`Admin is requesting initial notifications\nSocketId: ${socket.id}`);
        EmployeeTimeIn.find({})
        .populate(
            {
                path:'employee',
                select: 'name  pic'
            })
        .limit(20)
        .exec(function (err, employeeTimeIns) {
            if (err) return handleError(err);
            employeeTimeIns = employeeTimeIns.map(timeIn => {
                return {
                    id: timeIn.id,
                    name: timeIn.employee.name,
                    pic: timeIn.employee.pic.thumb,
                    timeIn: timeIn.timeIn,
                    isSeen: timeIn.isSeen
                }
            })
            console.log('Initial notifications succesfully sent to admin');
            io.emit('sv-sendInitNotif', employeeTimeIns);
        });
    });


    socket.on('cl-timeIn', socketdata => {
        Employee.findById(socketdata.employeeId, (err, employee) => {

            if (err) throw err
            if (!employee) {
                console.log(`_id ${socketdata.employeeId} not found`);
                return;
            }
            console.log(`New Time In From ${employee.name.firstName} ${employee.name.lastName}\nSocket ID: ${socket.id}\n`);

            let employeeTimeIn = new EmployeeTimeIn({
                employee: socketdata.employeeId,
                timeIn: socketdata.timeIn,
                pic: {
                    original: 'save original',
                    thumb: 'thumb'
                },
                map: {
                    lng: socketdata.map.lng,
                    lat: socketdata.map.lat,
                    formattedAddress: 'pasig'
                },
                batteryStatus: socketdata.batteryStatus
            });

            EmployeeTimeIn.addNew(employeeTimeIn, (err, timeIn) => {
                if (err) throw err;
                console.log(`Time In of ${employee.name.firstName} ${employee.name.lastName} successfully saved\n`);
                let data = {
                    notificationId: timeIn.id,
                    name: employee.name,
                    timeIn: timeIn.timeIn,
                    isSeen: false,
                    picThumb: employee.pic.thumb ? employee.pic.thumb : "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRYeS4S-XjMeN8MCz5Bf-WvwFGMvYy4lmXq2FoICy84hg5v1Oh9yQ"
                };

                io.emit('sv-newnotification', data);
                // emit to user that time in is successfully saved
            });
        })        
    });

    socket.on('cl-getNotifDetails', socketdata => {
        console.log('Admin requesting notification details')
        EmployeeTimeIn.findByIdAndUpdate(socketdata.id, {
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
            //emit to client that his notification is seen by admin
        })
    });


    socket.on('cl-join-room', function(roomId){
        socket.join(roomId);
    });
    
    socket.on('cl-sendmessage', socketdata => {
        io.emit('sv-newmessagetoadmin', socketdata);
    })

    socket.on('cl-sendmessagetoemployee', socketdata => {
        console.log(socketdata);
        io.emit('sv-servenewmessagetoemployee', {
            text: socketdata.txt,
            time: socketdata.time
        });
    })

    socket.on('cl-getinitlog', socketdata => {
        unirest.get(`${DBHOST}/employeeTimeIn?employeeid=${socketdata.employeeid}&_limit=20&_sort=timeIn&_order=desc`)
        .end(
            response => {
                // console.log(response.body);
                    io.emit('sv-sendinitemployeelog', {logs: response.body});
            }
        );
    });

    socket.on('cl-getInitMessages', socketData => {
        ///sort and limit the result
        console.log('Request initial message history of selected employee');
        EmployeeTimeIn.findById(socketData.notificationId, (err, employeeTimeIn) =>{
            if (err) throw err;
            Employee.findById(employeeTimeIn.employee, (err, employee) =>{
                if (err) throw err;
                console.log('Initial message history for selected employee successfully sent');
                io.emit('sv-sendInitMessages', {
                    id: employee.id,
                    messages: employee.messages,
                    pic: employee.pic,

                })                
            })
        })
    });

    // if admin set isMe = false, employee set isMe = true
    socket.on('cl-sendNewMessage', socketData => {
        console.log(`${socketData.isMe ? 'Employee' : 'Admin'} sending new message`);
        Employee.findByIdAndUpdate(socketData.employeeId, {
            $push: {'messages': {
                isMe: socketData.isMe,
                content: socketData.content}}
        }, (err, employee) => {
            if (err) throw err;
            console.log(employee);
            console.log('New message saved');
            // io.emit('sv-newMessage', {
            //     content: socketData.content
            // })
            //if admin, emit to client new message
        })
    });


    socket.on('disconnect', () => console.log('Client disconnected'));
});

setInterval(() => io.emit('time', new Date().toTimeString()), 1000);


// You can solve it by two ways.

// first and preferred one is @durrellchamorro answer. you ran the command ps aux | grep node and you will get the process id like 16750 or some other else, next you need to run kill -9 16750 it will kill the process.
// 2.Next one is run the command killall -9 node it will kill all the processing running on node.