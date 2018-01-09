'use strict';

const express = require('express');
const socketIO = require('socket.io');
const path = require('path');

const PORT = process.env.PORT || 8080;
const INDEX = path.join(__dirname, 'index.html');

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

    socket.emit('initRate', initialRate);

    socket.on('send-rate', (data) => {
        DEBUG.log('New rate ' + data.rate + ' by ' + socket.id);
        io.emit('new-rate', {
            rate: data.rate,
            value: data.value,
            month: data.monthChanged,
            id: socket.id
        });
    });

    socket.on('changeColor', (newColor) => {
        DEBUG.log('New color ' + newColor + ' by ' + socket.id);
        io.emit('new-color', {
            color: newColor,
            id: socket.id
        });
    });

    socket.on('disconnect', () => console.log('Client disconnected'));
});

setInterval(() => io.emit('time', new Date().toTimeString()), 1000);