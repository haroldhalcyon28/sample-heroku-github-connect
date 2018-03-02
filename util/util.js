const config = require('../config/config');
const cloudinary = config.cloudinary;

var _ = require('lodash');

var _this = this;

module.exports.thumbnail = (url, options) => {
    let _url = _.split(url, '/');
    let _startUrl = _.dropRight(_url, 2);
    let _endUrl = _.drop(_url, (_url.length -2));
    // console.log(_startUrl);
    // console.log(_endUrl);
    let _transform = ''
    if(options.profile) _transform = 'c_fill,h_53,w_53';
    if(options.timeIn) _transform = 'c_scale,h_210';
    _url = _.join(_.concat(_startUrl, _transform, _endUrl), '/');
    return _url;
    // console.log(_url);
}

module.exports.upload = (image, callback) => {
    cloudinary.v2.uploader.upload(image, callback);
}

module.exports.uploadMultiple = (images, callback) => {
    let imageCount = images.length;
    let index = 0;
    
    let resultImages = [];

    function _upload(){
        if (index > (imageCount -1)){
            callback(null, resultImages);
        }
        else{
            _this.upload(images[index], (err, result) => {
                if(err){
                    callback(err, null);
                }
                if(result) {
                    
                    resultImages.push(
                        {
                            original: result.secure_url,
                            thumb: _this.thumbnail(result.secure_url, {timeIn: true})
                        }
                    )
                    index++;
                    _upload();
                }
            });
        }
    }
    _upload();

    
}



const log4js = require('log4js');
const _logger = log4js.getLogger();

_logger.trace(`Sample debug`);
_logger.debug(`Sample debug`);
_logger.info(`Sample debug`);
_logger.warn(`Sample debug`);
_logger.error(`Sample debug`);

_logger.level = 'debug';

function removeSpace(originalString){
    if(_.isObject(originalString)) {
        return `\n${originalString}\n`
    }

    let str = originalString.split('\n');
    let newString = '';
    for(let s of str){
        newString += `${s.trim()}\n`;
    }
    return `\n${newString.trim()}\n`
}


var logger = {
    trace: str => {
        return _logger.trace(removeSpace(str))
    },
    debug: str => {
        return _logger.debug(removeSpace(str))
    },
    info: str => {
        return _logger.info(removeSpace(str))
    },
    warn: str => {
        return _logger.warn(str)
    },
    error: str => {
        return _logger.error(str)
    },
}

module.exports.logger = logger;
