
module.exports = function (expressApp) {

 		var db = require('./databox-log-db.js')('../database/datastoreLOG.db');

    var request = require('request'); 

    var router = require('express').Router();
        
    var app = expressApp;
    
    router.post('/:datastore',function(req, res, next) {
      
      var datastore = req.params.datastore;
      var data = req.body;
      console.log("[logging] " + datastore);

      //store a correct version of the datastore name validated by the macaroon for searching
      data._datastore = datastore;
      
      db.insert(data, function (err, doc) {
            if (err) {
                console.log("[Error]:: ", datastore, err, doc);
                res.status(500).send({status:500,error:err, body:"error"});
            }
            res.status(200).send({status:200,body:"OK"});
      });

    });

     //return all logs by datastore
     router.get('/:datastore', function(req, res, next) {
        
        var datastore = req.params.datastore;
        
        console.log("looking for logs for datastore:: " + datastore);
        db.find({'_datastore': datastore}, function (err, documents) {
          if (err) {
            console.log("[Error]:: /log/:" + datastore);
            res.status(500).send({status:500,error:err});
          }

          if(documents.length === 0) {
            res.status(404).send({status:404,error:"No documents not found."});
          } else {
            res.send(documents);
          }
        });
    });

    return router;

};