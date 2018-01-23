const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const socketClientSchema = new Schema({
        socketId: String,
        employeeId: String
});

const SocketClient = module.exports =  mongoose.model('SocketClient', socketClientSchema);

module.exports.addNew = (newSocketClient, callback) => {
    newSocketClient.save(callback);
}