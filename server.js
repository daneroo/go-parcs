var connect = require('connect');
var app = connect()
    .use(connect.compress())
    .use(connect.static(__dirname+ '/'))
    .listen(3000);