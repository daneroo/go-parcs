// Config section
var port = (process.env.VMC_APP_PORT || process.env.app_port || 3000);
var host = (process.env.VCAP_APP_HOST || '0.0.0.0'|| 'localhost');

var express = require('express');
var fs = require('fs');
var cf = require('cloudfoundry');
var async = require('async');
var mongodb = require('mongodb');

var lavallee = {lat:45.4660,lng:-75.7553};
// db.parcs.find( { latlng : { $near : [45.4660, -75.7553] } } ).limit(1)

var server = express.createServer();

server.use(express.static(__dirname+ '/'));
//CORS middleware
var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET'); // 'GET,PUT,POST,DELETE'
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
}
server.use(allowCrossDomain);
server.enable("jsonp callback");
server.get('/geo', function(req, res){
  var lat = Number(req.param('lat'))||lavallee.lat;
  var lng = Number(req.param('lng'))||lavallee.lng;  
  // console.log('requested lat:%s, lng:%s',lat,lng);
  getNear(lat,lng,function(err,parcs){
      res.json(err || parcs);
  })
});

reloadData();

server.listen(port, host);
console.log('http://'+host+':'+port+'/');

function getNear(lat,lng,cb){
    // console.log('getNear %s,%s',lat,lng);
    getCollection(function(err,coll){
        if(checkError(err,cb)) return;
        var opts = {
            num:300 // otherwise 100 is max
        }
        coll.geoNear(lat,lng,opts,function(err,docs){
            if(checkError(err,null)) return;
            // console.log('parcs-distances',docs.results);
            // console.log('geoNear got %d parcs',docs.results.length);
            var parcs = [];
            docs.results.forEach(function(result){
                var parc = result.obj;
                parc.distance = result.dis;
                parcs.push(parc);
            });
            if (cb) cb(null,parcs);
        });
    });
}
function reloadData(){
    console.log('reload data');
    // load the json data
    var parcs = JSON.parse(fs.readFileSync(__dirname+ '/data/markers.json','utf8'));
    console.log('Found %d parcs',parcs.length);

    getCollection(function(err,coll){
        if(checkError(err,null)) return;
        coll.drop(function(err){
            // don't care if drop causes an error
            //if(checkError(err,null)) return;

            coll.ensureIndex( { latlng : "2d" } );
            // iterate and insert
            async.forEachSeries(parcs, function(parc,next){
                //console.log('parc',parc);
                // save(parc,function(){setTimeout(next,100);});
                // add properly formated latlng member
                parc.latlng = {lat:parc.lat,lng:parc.lng}
                save(parc,next);
                // next();
            }, function(err){
                console.log('done re-loading data');
            });
        });
    });    
}

function checkError(error,cb){
  if (error) {
    console.error('err: '+error.message);
    if (cb) cb(error);
    return true;
  }
  return false;
}

// we keep using this connection (reconnect...)
var cachedMongoURL=null;
function getMongoURL(){
    if (cachedMongoURL) return cachedMongoURL;
    
    // 2- mongo config
    console.log('cf',JSON.stringify(cf,null,2));
    var mongo = (function(){
      if(cf.cloud){
        var mongo = cf.services['mongodb-1.8'][0]['credentials'];
        return mongo;
      } else{
        var mongo = {
          hostname:'dirac.imetrical.com',      
          db:"parcs"
        };
        return mongo;
      }
    })();
    var mongoURL = (function(obj){
      obj.hostname = obj.hostname || 'localhost';
      obj.port = obj.port || 27017;
      obj.db = obj.db || 'test';
      var auth=(obj.username && obj.password)?(obj.username + ":" + obj.password + "@"):"";
      return "mongodb://" + auth + obj.hostname + ":" + obj.port + "/" + obj.db + "?auto_reconnect=true";
    })(mongo);
    //console.log("mongo",mongo);
    console.log("mongo url",mongoURL);
    cachedMongoURL = mongoURL;
    return mongoURL;
}

var connection=null;
function getConnection(cb) { // cb(err,conn)
  if (connection){
    if (cb) cb(null,connection);    
  } else {
    mongodb.connect(getMongoURL(), function(err, conn){
      if(checkError(err,cb)) return;
      connection=conn;
      if (cb) cb(null,connection);    
    });
  }
}

var collectionName='parcs';
function getCollection(cb) { // cb(err,conn)
  getConnection(function(err,conn){
    if(checkError(err,cb)) return;
    conn.collection(collectionName, function(err, coll){
      if(checkError(err,cb)) return;
      if (cb) cb(err,coll);
    });
  });
}

function save(parc,cb){ // cb(err,doc)
  // console.log('orm.save',parc.name);
  getCollection(function(err,coll){
    if(checkError(err,cb)) return;

    /* Simple object to insert: ip address and date */
    
    /* Insert the object then print in response */
    /* Note the _id has been created */
    coll.save( parc, {safe:true}, function(err,result){
      if(checkError(err,cb)) return;
      
      // could return the _id or something
      if (cb) cb(null,result);
      
      
    }); // save
  }); // collection
}