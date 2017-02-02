
const request = require('request');
const https = require('https');
const url = require('url');


//
//Databox ENV vars
//
const CM_HTTPS_CA_ROOT_CERT = process.env.CM_HTTPS_CA_ROOT_CERT || '';
const ARBITER_TOKEN   = process.env.ARBITER_TOKEN;
const DATABOX_ARBITER_ENDPOINT = process.env.DATABOX_ARBITER_ENDPOINT || "https://databox-arbiter:8080";


//
// An https.Agent to trust the CM https cert if one is provided
//
var agentOptions = {};
if(CM_HTTPS_CA_ROOT_CERT === '') {
console.log("WARNING[databox-request]:: no https root cert provided not checking https certs.");
    agentOptions.rejectUnauthorized = false;
} else {
    agentOptions.ca = CM_HTTPS_CA_ROOT_CERT;
}
var httpsAgent = new https.Agent(agentOptions);


module.exports = function (options,callback) {

  options = options || {};

  //use the databox https agent
  options.agent = httpsAgent;

  //
  // Workout the host and path of the request
  //
  var urlObject = url.parse(options.uri);
  var path = urlObject.pathname;
  var host = urlObject.hostname;
  
  //request to arbiter do not need a macaroon but do need the ARBITER_TOKEN
  var isRequestToArbiter = DATABOX_ARBITER_ENDPOINT.indexOf(host) !== -1;
  if(isRequestToArbiter) {
      options.headers = {'X-Api-Key': ARBITER_TOKEN};
      //do the request and call back when done
      console.log("[databox-request] " + options.uri);
      request(options,callback);
  } else {
      //
      // we are talking to another databox component so we need a macaroon!
      //
      getMacaroon(host)
      .then((macaroon)=>{
          //do the request and call back when done
          options.headers = {'X-Api-Key': macaroon};
          console.log("[databox-request] " + options.uri);
          request(options,callback);
      })
      .catch((result)=>{
          if(result.error !== null) {
              callback(result.error,result.response,null);
              invalidateMacaroon(host);
              return;
          } else if (result.response.statusCode != 200) {
              //API responded with an error
              callback(result.body,result.response,null);
              invalidateMacaroon(host);
              return;
          }
      });
      
  }

};


var macaroonCache = {};
/**
 * @param {host} The host name of the end point to request the macaroon
 * @return {Promise} A promise that resolves with a shared secret gotten from the arbiter
 * 
 * Gets a macaroon form the cache if one exists else it requests one from the arbiter. 
 */
function getMacaroon(host) {
    return new Promise((resolve, reject) => {

        if(macaroonCache[host]) {
            console.log("returning cashed mac",macaroonCache);
            //TODO check if the macaroon has expired? for now if a request fails we invalidate the macaroon
            resolve(macaroonCache.host);
            return;
        }

        //
        // Macroon has not been requested. Get a new one.
        //
        var opts = {
                uri: DATABOX_ARBITER_ENDPOINT+'/token',
                method: 'POST',
                form: {
                            target: host,
                        },
                headers: {'X-Api-Key': ARBITER_TOKEN},
                agent: httpsAgent
            };
        request(opts,function (error, response, body) {
            if(error !== null) {
                reject({error:error,response:response,body:null});
                return;
            } else if (response.statusCode != 200) {
                //API responded with an error
                reject({error:body,response:response,body:null});
                return;
            }
            macaroonCache[host] = body;
            resolve(macaroonCache[host]);
        });
    });
}

/**
 * @param {host} The host name of the end point to request the macaroon
 * @return void
 * 
 * Gets a macaroon form the cache if one exists else it requests one from the arbiter. 
 */
function invalidateMacaroon(host) {
    macaroonCache[host] = null;
}