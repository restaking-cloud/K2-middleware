const axios = require("axios");
const getResponseCode = async (url) => {
    let responseCode = 200

    await axios.get(url)
        .catch(async function (error) {
            if (error.response) {
                responseCode = await error.response.status
            }
        });

    return responseCode
}

const formResponse = (statusCode, body) => {
    return {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true
        },
        statusCode,
        body: JSON.stringify(body),
    }
};

const formErrorMessage = msg => {
    return { error: { msg } };
};

module.exports = {
    getResponseCode,
    formResponse,
    formErrorMessage
}