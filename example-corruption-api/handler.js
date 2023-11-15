const {formResponse, formErrorMessage} = require('./response-utils');

/// @dev Service provider infrastructure should have some way of knowing who's supposed to be running software
const validateCorruption = async (req) => {
    const body = JSON.parse(req.body);
    if (!body) {
        return formResponse(500, formErrorMessage('Missing body'));
    }

    const headers = req.headers;
    console.log('Headers', headers)

    // Ensure that only those with the correct bearer can access
    if (!headers || !headers.Authorization || headers.Authorization !== `Bearer ${process.env.BEARER_TOKEN}`) {
        return formResponse(500, formErrorMessage('Invalid bearer token'));
    }

    if (!body.events) {
        return formResponse(500, formErrorMessage('Missing events'));
    }

    return formResponse(200, {
        severityScore: '0.2'
    });
}

module.exports = {
    validateCorruption
}