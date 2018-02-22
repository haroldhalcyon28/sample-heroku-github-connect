const config = require('../config/config');
const cloudinary = config.cloudinary;

var _this = this;
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
                            thumb: result.secure_url
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
