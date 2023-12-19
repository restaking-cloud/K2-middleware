const { infoHandler } = require('./handlers/info');
const { reportHandler } = require('./handlers/report');

// handler.js is the main entry point into the middleware and links to other handlers that take care of dedicated tasks

module.exports = {
    info: infoHandler,      // Handler for returning information about the configuration of the K2 middleware.
    report: reportHandler   // Handler for performing verification of a report submitted by a K2 reporter.
}