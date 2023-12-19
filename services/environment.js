const readEnv = () => {
    // Check environment variables are defined
    if (
        !process.env
        || !process.env.VERSION
        || !process.env.DEFAULT_SERVICE_PROVIDER_BORROW_ADDRESS
        || !process.env.DESIGNATED_VERIFIER_PRIVATE_KEY
        || !process.env.PROVIDER_URL
        || !process.env.K_SQUARED_LENDING_CONTRACT
        || !process.env.K_SQUARED_REPORTER_REGISTRY
        || !process.env.LIVENESS_ENDPOINT            
        || !process.env.CORRUPTION_VERIFICATION_ENDPOINT
        || !process.env.DATA_FEED_ENDPOINT       
        || !process.env.IDENTIFIER_GENERATOR_ENDPOINT
        || !process.env.CHAIN_ID          
        || !process.env.REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS
        || !process.env.CORRUPTION_VALIDATION_BEARER_TOKEN   
        || !process.env.IDENTIFIER_BEARER_TOKEN      
    ) {
        throw new Error('Missing environment variables. Please check and try again.');
    }

    // Extract environment variables
    const {
        VERSION,                                // Only serve payloads from this version
        DEFAULT_SERVICE_PROVIDER_BORROW_ADDRESS,// Multiple SBP can elect this designated verifier but this is the original creator
        DESIGNATED_VERIFIER_PRIVATE_KEY,        // Not to be exposed and used for signing slashing requests
        PROVIDER_URL,                           // Execution layer provider URL for checking contract info
        K_SQUARED_LENDING_CONTRACT,             // Slashable lending pool
        K_SQUARED_REPORTER_REGISTRY,            // Registry of registered reporters able to report slashing
        LIVENESS_ENDPOINT,                      // This should be open for reporters to be able to detect liveness events
        CORRUPTION_VERIFICATION_ENDPOINT,       // This should have HTTP auth with the k squared middleware on the validate endpoint
        DATA_FEED_ENDPOINT,                     // Endpoint where SLOT by SLOT data can be checked for corruption issues
        IDENTIFIER_GENERATOR_ENDPOINT,          // This should have HTTP auth with the k squared middleware on the generate endpoint
        CHAIN_ID,                               // Chain validity for slashing messages
        REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS,   // How long after creating slashing messages they stay active before contract will reject submission
        CORRUPTION_VALIDATION_BEARER_TOKEN,     // HTTP bearer token for interacting with the corruption validation API
        IDENTIFIER_BEARER_TOKEN                 // HTTP bearer token for interacting with the report identification API
    } = process.env;

    // Return them
    return {
        VERSION,                                
        DEFAULT_SERVICE_PROVIDER_BORROW_ADDRESS,
        DESIGNATED_VERIFIER_PRIVATE_KEY,        
        PROVIDER_URL,                           
        K_SQUARED_LENDING_CONTRACT,             
        K_SQUARED_REPORTER_REGISTRY,            
        LIVENESS_ENDPOINT,                      
        CORRUPTION_VERIFICATION_ENDPOINT,       
        DATA_FEED_ENDPOINT,                     
        IDENTIFIER_GENERATOR_ENDPOINT,          
        CHAIN_ID,                               
        REPORT_DEADLINE_LENGTH_IN_ETH_BLOCKS,   
        CORRUPTION_VALIDATION_BEARER_TOKEN,
        IDENTIFIER_BEARER_TOKEN
    };
}

module.exports = {
    readEnv
}