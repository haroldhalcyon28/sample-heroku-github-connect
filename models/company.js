const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const companySchema = new Schema({
    name: String,
    logo: String
});

const Company = module.exports =  mongoose.model('Company', companySchema);

module.exports.addNew = (newCompany, callback) => {
    newCompany.save(callback);
}

module.exports.getCompanyById = function(id, callback) {
    Company.findById(id, callback);
}


module.exports.getCompanyByQuery = function(query, callback) {
    Company.findOne(query, callback);
}


module.exports.getAll = function(callback) {
    Company.find({}, callback);
}