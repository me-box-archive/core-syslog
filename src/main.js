const https = require('https');
const express = require("express");
const bodyParser = require("body-parser");

const macaroonVerifier = require('./lib/macaroon/macaroon-verifier.js');

const DATABOX_LOCAL_NAME = process.env.DATABOX_LOCAL_NAME || "databox-logstore";
const DATABOX_LOCAL_PORT = process.env.DATABOX_LOCAL_PORT || 8080;
const DATABOX_ARBITER_ENDPOINT = process.env.DATABOX_ARBITER_ENDPOINT || "https://databox-arbiter:8080";

// TODO: Refactor token to key here and in CM to avoid confusion with bearer tokens
const ARBITER_KEY = process.env.ARBITER_TOKEN;
const NO_SECURITY = !!process.env.NO_SECURITY;

const PORT = process.env.PORT || 8080;

//HTTPS certs created by the container mangers for this components HTTPS server.
const HTTPS_CLIENT_CERT = process.env.HTTPS_CLIENT_CERT || '';
const HTTPS_CLIENT_PRIVATE_KEY = process.env.HTTPS_CLIENT_PRIVATE_KEY || '';
const credentials = {
	key:  HTTPS_CLIENT_PRIVATE_KEY,
	cert: HTTPS_CLIENT_CERT,
};

const app = express();

//Register with arbiter and get secret
macaroonVerifier.getSecretFromArbiter(ARBITER_KEY)
	.then((secret) => {
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({extended: true}));

		app.get("/status", (req, res) => res.send("active"));

		if (!NO_SECURITY) {
			//everything after here will require a valid macaroon
			app.use(macaroonVerifier.verifier(secret, DATABOX_LOCAL_NAME));
		}

		

		var server = null;
		if(credentials.cert === '' || credentials.key === '') {
			var http = require('http');
			console.log("WARNING NO HTTPS credentials supplied running in http mode!!!!");
			server = http.createServer(app);
		} else {
			server = https.createServer(credentials,app);
		}

		/*
		* DATABOX API Logging
		* Logs all requests and responses to/from the API in bunyan format in nedb
		*/
		var databoxLoggerApi = require('./lib/log/databox-log-api.js');
		app.use('/', databoxLoggerApi(app));

		server.listen(PORT, function () {
			console.log("Listening on port " + PORT);
		});
	})
	.catch((err) => {
		console.log(err);
	});


module.exports = app;
