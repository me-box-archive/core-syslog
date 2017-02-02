var url = require('url');
var databoxRequest = require('../databox-request/databox-request.js');
var basicAuth = require('basic-auth');
var macaroons = require('macaroons.js');
var pathToRegexp = require('path-to-regexp');

const DATABOX_ARBITER_ENDPOINT = process.env.DATABOX_ARBITER_ENDPOINT || "https://databox-arbiter:8080";


/**
 * @return {Promise} A promise that resolves with a shared secret gotten from the arbiter
 */
module.exports.getSecretFromArbiter = function(arbiterKey) {
	return new Promise((resolve, reject) => {
		if (!arbiterKey) {
			resolve('');
			return;
		}

		// TODO: Could just make it port 80 arbiter-side since permissions don't matter in the container anyway...
		databoxRequest({uri: DATABOX_ARBITER_ENDPOINT+'/store/secret'}, function (error,response,body){
			if (error !== null) {
				reject(error);
				return;
			}
			resolve(new Buffer(body, 'base64'));
		});

	});
};


/**
 * Checks if a method and path satisfies a macaroon "routes" caveat
 * @param {String} caveat
 * @param {String} method
 * @param {String} path
 * @return {Boolean} valid
 */
var isPathValid = function () {
	var prefixRegex = /routes = .*/;
	var prefixLen   = 'routes = '.length;

	return function (caveat, method, path) {
		if (!prefixRegex.test(caveat))
			return false;

		// TODO: Catch potential JSON.parse exception
		var routes = JSON.parse(caveat.substring(prefixLen));
		var whitelist = routes[method];

		if (!whitelist)
			return false;

		// TODO: Catch potential JSON.parse exception
		whitelist = JSON.parse(whitelist);

		return pathToRegexp(whitelist).test(path);
	}
}();

/**
 * Returns a verifier for a given path
 * @param {String} path
 * @return {Function} Path verifier
 */
var createPathVerifier = function (method, path) {
	return function (caveat) {
		return isPathValid(caveat, method, path);
	};
};


/**
 * Creates Macaroon verification middleware for express requests
 * @param {String} secret Arbiter shared secret key
 * @param {String} storeName Store hostname
 * @return {Function} Macaroon verification middleware
 */
module.exports.verifier = function (secret, storeName) {
	return function (req, res, next) {
		// TODO: Fail loudly if app is not using body-parser

		// Extract token as per Hypercat PAS 212 7.1 for uniformity
		var creds = basicAuth(req);
		var macaroon = req.get('X-Api-Key') || (creds && creds.name);

		if (!macaroon) {
			res.status(401).send('Missing API key/token');
			return;
		}

		//console.log("Macaroon serialized:", macaroon);

		// Parse and verify macaroon
		// TODO: Complain if there are issues deserializing it
		macaroon = macaroons.MacaroonsBuilder.deserialize(macaroon);

		//console.log("Macaroon deserialized:", macaroon.inspect());

		macaroon = new macaroons.MacaroonsVerifier(macaroon);

		// Verify "target" caveat
		macaroon.satisfyExact("target = " + storeName);

		macaroon.satisfyGeneral(createPathVerifier(req.method, req.path));

		// TODO: Verify granularity etc here (or potentially in tandem with driver)?

		if (!macaroon.isValid(secret)) {
			res.status(401).send('Invalid API key/token');
			return;
		}

		req.macaroon = macaroon;
		next();
	};
};


/**
 * Creates Macaroon verification middleware for WebSocket connections
 * @param {String} secret Arbiter shared secret key
 * @param {String} storeName Store hostname
 * @return {Function} WebSocket server client verifier
 */
module.exports.wsVerifier = function (secret, storeName) {
	// TODO: See me-box/databox-store-blob issue #19
	return function (info, callback) {
		// Extract token as per Hypercat PAS 212 7.1 for uniformity
		var creds = basicAuth(info);
		var macaroon = info.req.headers['x-api-key'] || (creds && creds.name);

		if (!macaroon) {
			callback(false, 401, 'Missing API key/token');
			return;
		}

		//console.log("Macaroon serialized:", macaroon);

		// Parse and verify macaroon
		// TODO: Complain if there are issues deserializing it
		macaroon = macaroons.MacaroonsBuilder.deserialize(macaroon);

		//console.log("Macaroon deserialized:", macaroon.inspect());

		macaroon = new macaroons.MacaroonsVerifier(macaroon);

		// Verify "target" caveat
		macaroon.satisfyExact("target = " + storeName);

		macaroon.satisfyGeneral(createPathVerifier(url.parse(info.req.url).pathname));

		// TODO: Verify granularity etc here (or potentially in tandem with driver)?

		if (!macaroon.isValid(secret)) {
			callback(false, 401, 'Invalid API key/token');
			return;
		}

		info.req.macaroon = macaroon;
		callback(true);
	};
};
