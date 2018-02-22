const express = require('express');
const router = express.Router();
const Account = require('../models/account');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const passport =  require('passport');
const Company = require('../models/company');
const Employee = require('../models/employee');




// router.get('/', function (req, res) {
//         let newAccount = new Account(
//         {
//             username: 'admin',
//             password: 'admin',
//             name: {
//                 firstName: 'Bryan',
//                 lastName: 'Adams',
//                 middleName: ''
//             },
//             pic: {
//                 original: 'http://res.rankedgaming.com/resources/images/profile/default-avatar-male.png',
//                 thumb: 'http://res.rankedgaming.com/resources/images/profile/default-avatar-male.png'
//             },
//             isAdmin: true
//         }
//     )
//     Account.addNew(newAccount, (err, account) => {
//         if (err) throw err;
//         console.log(account);
//     })


//     res.json({ a: 1 });
// });


router.post('/', function (req, res) {
    console.log(req);
    res.send('test');
});

router.post('/authenticate', function (req, res) {
    let query = {
        username: req.body.username,
        password: req.body.password,
        isAdmin: req.body.isAdmin ? true : false
    }

    Account.getAccountByQuery(query, (err, account) => {
        
        if(err) console.log(err);
        if(!account){
            return res.json({success: false, msg: 'Your username or password is incorrect'});
        }
        Account.comparePassword(query.password, account.password, (err, isMatch) => {
            if(err) throw err;
            if(isMatch){
                const token = jwt.sign(
                    {data: {
                        _id: account._id,
                        isAdmin: account.isAdmin
                    }}, 
                    config.secret,
                    {expiresIn: 604800}
                );

                res.json({success: true, token: token})
            } else{
                return res.json({success: false, msg: 'Your username or password is incorrect'});
            }
        })
    })
});

router.post('/check-authentication', passport.authenticate('jwt', {session:false}), function (req, res, next) {
    console.log('Cheking authentication token');
    let user;
    if(req.user.isAdmin){
        user = Object.assign({}, {
            name: req.user.name,
            pic: req.user.pic,
            _id: req.user._id
        })
        res.json(user);
    }
    else{
        Employee.getEmployeeById(req.user._id, (err, employee) => {
            if(err) console.log(err);
            if(employee){
                user = Object.assign({}, {
                    _id: employee._id,
                    name: employee.name,
                    pic: employee.pic
                });
                res.json(user);
            }
        })
    }
    
});

router.post('/company', passport.authenticate('jwt', {session:false}), function (req, res, next) {
    let newCompany = new Company({
        name: req.body.name,
        logo: req.body.logo ? req.body.logo : 'http://res.cloudinary.com/dka3vzadb/image/upload/v1517996051/download_yblqwi.png'
    })

    let response = {success: false}
    Company.getCompanyByQuery({name: req.body.name}, (err, c) => {
        console.log(c);
        if (err) console.log(err);
        if(c){
            response = Object.assign({}, response, {
                msg: `Name ${req.body.name} already taken`
            })
            res.json(response);
        }
        else{
            Company.addNew(newCompany, (err, company) => {
                if(err){
                    console.log(err);
                    response = Object.assign({}, response, {
                        msg: err
                    })
                }
                if(company){
                    response = Object.assign({}, response, {
                        success: true,
                        company: company,
                        msg: 'New company successfully addedd'
                    })
                }
                res.json(response);
            })
        }
    } )
    
});

router.get('/company', passport.authenticate('jwt', {session:false}), function (req, res, next) {
    let response = {success: false}
    Company.getCompanyById(req.query.id, (err, company) => {
        if(err){
            console.log(err);
            response = Object.assign({}, response, {
                msg: err
            })
        }
        if(company){
            response = Object.assign({}, response, {
                success: true,
                company: company,
                msg: 'company successfully sent to admin'
            })
        }
        res.json(response);
    })
});

router.get('/companies', passport.authenticate('jwt', {session:false}), function (req, res, next) {
    console.log('Admin requesting companies');
    let response = {success: false}
    Company.getAll((err, companies) => {
        if(err){
            console.log(err);
            response = Object.assign({}, response, {
                msg: err
            })
        }
        if(companies){
            response = Object.assign({}, response, {
                success: true,
                companies: companies,
                msg: 'Companies successfully sent to admin'
            })
        }
        res.json(response);
    })
    
    
});

router.post('/check-username', passport.authenticate('jwt', {session:false}), function (req, res, next) {
    console.log('Checking username availability');
    let _response = {ok: true}
    Account.findOne({username: req.body.username}, (err, account) => {
        if(err) console.log(err);
        else{
            _response.ok = account ? false : true;
            console.log(`Username ${req.body.username} ${_response.ok ? 'available' : 'already taken'}`);
            res.json(_response);
        }
    })
});

router.post('/check-demoname', passport.authenticate('jwt', {session:false}), function (req, res, next) {
    console.log('Checking demo name availability');
    let _response = {ok: true}
    Company.findOne({name: req.body.demoname.trim()}, (err, company) => {
        if(err) console.log(err);
        else{
            _response.ok = company ? false : true;
            console.log(`Demo name ${req.body.demoname} ${_response.ok ? 'available' : 'already taken'}`);
            res.json(_response);
        }
    })
});



module.exports = router;
