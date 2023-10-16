const {formResponse} = require('./response-utils');

/// @dev Service provider infrastructure should have some way of knowing who's supposed to be running software
const liveness = async (req) => {
    return formResponse(200, {
        numOfValidatorsOnline: '8',
        numOfValidatorsOffline: '2',
        totalValidators: '10'
    });
}

module.exports = {
    liveness
}