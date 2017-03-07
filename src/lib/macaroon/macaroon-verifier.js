var url = require('url');
var databoxRequest = require('../databox-request/databox-request-promise.js');
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
 * Checks if a path satisfies a macaroon "path" caveat
 * @param {String} caveat
 * @param {String} path
 * @return {Boolean} valid
 */
var isPathValid = function () {
	var prefixRegex = /path = .*/;
	var prefixLen   = 'path = '.length;

	return function (caveat, path) {
		if (!prefixRegex.test(caveat))
			return false;

		// TODO: Catch potential JSON.parse exception
		var allowed = caveat.substring(prefixLen);

		return pathToRegexp(allowed).test(path);
	}
}();

/**
 * Returns a verifier for a given path
 * @param {String} path
 * @return {Function} Path verifier
 */
var createPathVerifier = function (path) {
	return function (caveat) {
		return isPathValid(caveat, path);
	};
};

/**
 * Creates a validator that checks if an integer matches a caveat with a given name and relation
 * @param {String} name
 * @param {String} relation
 * @return {Function} Validator
 */
var createRelationValidator = function (name, relation) {
	var prefixRegex = new RegExp(name + ' ' + relation + ' .*');
	var prefixLen   = name.length + relation.length + 2;

	/**
	 * Checks if a timstamp satisfies a given macaroon caveat
	 * @param {String} caveat
	 * @param {String} value
	 * @return {Boolean} valid
	 */
	return function (caveat, value) {
		if (!prefixRegex.test(caveat))
			return false;

		// TODO: Catch potential JSON.parse exception
		var bound = parseInt(caveat.substring(prefixLen));

		switch(relation) {
			case '>':
				return value >  bound;
			case '<':
				return value <  bound;
			case '>=':
				return value >= bound;
			case '<=':
				return value <= bound;
			default:
				return false;
		}
	}
};

var isStartTimestampValid = createRelationValidator('startTimestamp', '>=');
var isEndTimestampValid   = createRelationValidator('endTimestamp',   '<=');

/**
 * Returns a function that returns verifiers for a given caveat name and relation
 * @param {String} validator
 * @param {...*} validatorParams
 * @return {Function} Relation verifier creator
 */
var createGeneralVerifier = function (validator) {
	var params = Array.prototype.slice.call(arguments, 1);
	return function (caveat) {
		return validator.apply(this, params);
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

		macaroon.satisfyExact("method = " + req.method);

		macaroon.satisfyGeneral(createPathVerifier(req.path));

		// Special cases
		if (req.body.startTimestamp)
			macaroon.satisfyGeneral(createGeneralVerifier(isStartTimestampValid, req.body.startTimestamp));

		if (req.body.endTimestamp)
			macaroon.satisfyGeneral(createGeneralVerifier(isEndTimestampValid,   req.body.endTimestamp));

		// TODO: Check `datasources` caveat here for /cat GETs

		// TODO: Verify granularity etc here

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
