'use strict';

const express = require('express');
const socketIO = require('socket.io');
const path = require('path');
const unirest = require('unirest');
const PORT = process.env.PORT || 8080;
const INDEX = path.join(__dirname, 'index.html');
const DBHOST = 'http://192.168.1.73:3000';

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

var initialRate = {
    jan: 5,
    feb: 30,
    mar: 3,
    apr: 8,
    may: 50,
    jun: 22,
};

io.on('connection', (socket) => {
    console.log(`Client connected with ID: ${socket.id}`);

    socket.on('cl-getinitnotif', () => {
        unirest.get(`${DBHOST}/employeeTimeIn?_page=1&_limit=20&_sort=id&_order=asc`)
        .end(
            response => {
                    var itemCount = (response.body).length;
                    var data = [];
                    //console.log(response.body);
                    if(!itemCount) {
                        io.emit('sv-sendinitnotif', data);
                        return;
                    }
                    var x = 0;
                    var getInitNotif = () => {
                        _getInitNotif(() => {
                            let item = response.body[x];
                            unirest.get(`${DBHOST}/employees/${item.employeeid}`).end(
                                r => {
                                    let i = {
                                        notificationid: item.id,
                                        name: r.body.name,
                                        isseen: item.isseen,
                                        picthumb: r.body.picthumb ? r.body.picthumb : "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRYeS4S-XjMeN8MCz5Bf-WvwFGMvYy4lmXq2FoICy84hg5v1Oh9yQ"
                                    };
                                    x++;
                                    data.push(i);
                                    if(x != itemCount){
                                        getInitNotif();
                                    }
                                    else{
                                        io.emit('sv-sendinitnotif', data);
                                    }
                                }
                            );
                        });
                       
                    }
                    var _getInitNotif =  callback => {
                        callback();
                    }
                    getInitNotif();
            }
        );
    });


    socket.on('cl-timein', socketdata => {
        console.log('socketdata: ');
        console.log( socketdata);
        unirest.get(`${DBHOST}/employeeTimeIn?_sort=id&_order=desc&_start=0&_limit=1`)
        .end(
            response => {
                cloudinary.uploader.upload(socketdata.b64, function(uploadresult) {
                    let employeeTimeIn = response.body[0];
                    unirest.get(`http://maps.googleapis.com/maps/api/geocode/json?latlng=${socketdata.map.lat},${socketdata.map.long}`)
                    .end(
                        formattedAddress => {
                            console.log(formattedAddress.body.results[0].formatted_address);
                            unirest.post(`${DBHOST}/employeeTimeIn`)
                            .headers({'Accept': 'application/json', 'Content-Type': 'application/json'})
                            .send(
                                {
                                    id: (employeeTimeIn.id + 1),
                                    employeeid: socketdata.employeeid,
                                    timein: socketdata.time,
                                    pic: uploadresult.secure_url,
                                    map: {
                                        formattedaddress: formattedAddress.body.results[0].formatted_address,
                                        long: socketdata.map.long,
                                        lat: socketdata.map.lat

                                    },                                    
                                    batteryStatus: socketdata.bt,
                                    isseen: false
                                }
                            )
                            .end(
                                r => {
                                    unirest.get(`${DBHOST}/employees?id=${socketdata.employeeid}`)
                                    .end(
                                        rr => {
                                            let employee = rr.body[0];
                                            if(socketdata.msg){
                                                ////add new message on message history
                                            }
                                            let data = {
                                                notificationid: (employeeTimeIn.id + 1),
                                                name: employee.name,
                                                isseen: false,  
                                                picthumb: employee.picthumb ? employee.picthumb : "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRYeS4S-XjMeN8MCz5Bf-WvwFGMvYy4lmXq2FoICy84hg5v1Oh9yQ"
                                            };
                                            io.emit('sv-newnotification', data);
                                            console.log(data);
                                        }
                                    );
                                    
                                }
                            );
                        }
                    )
                    
                });
                
            }
        );

        
    });

    socket.on('cl-getnotificationdetails', socketdata => {
        unirest.get(`${DBHOST}/employeeTimeIn?id=${socketdata.notificationid}`)
        .end(
            response => {
                let _employeeTimeIn = response.body[0];
                io.emit('sv-servenotificationdetails', {
                    timein: _employeeTimeIn.timeIn,
                    pic: _employeeTimeIn.pic,
                    map: _employeeTimeIn.map,
                    batteryStatus: _employeeTimeIn.batteryStatus
                })
                unirest.patch(`${DBHOST}/employeeTimeIn/${socketdata.notificationid}`)
                .headers({'Accept': 'application/json', 'Content-Type': 'application/json'})
                .send({
                    isseen: true
                })
                .end(
                    response => {
                        console.log(response.body ? 'Success' : 'Failed');
                    }
                );               
            }
        );
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

    

    socket.on('disconnect', () => console.log('Client disconnected'));
});

setInterval(() => io.emit('time', new Date().toTimeString()), 1000);


// You can solve it by two ways.

// first and preferred one is @durrellchamorro answer. you ran the command ps aux | grep node and you will get the process id like 16750 or some other else, next you need to run kill -9 16750 it will kill the process.
// 2.Next one is run the command killall -9 node it will kill all the processing running on node.