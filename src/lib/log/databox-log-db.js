

module.exports = function (dbFilePath) {
    var Datastore = require('nedb');
    var db = new Datastore({filename: dbFilePath, autoload: true});
    db.ensureIndex({fieldName: '_datastore', unique: false});
    db.ensureIndex({fieldName: 'req_id', unique: false});
    db.ensureIndex({fieldName: 'req.url', unique: false});
    db.ensureIndex({fieldName: 'hostname', unique: false});

    return db;
};