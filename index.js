const express = require('express');
const HTMLParser = require('node-html-parser');
const request = require('request');
const { MongoClient } = require('mongodb');
const config = require('./config');
const Handlebars = require('express-handlebars');
const bodyParser = require('body-parser');

function getEarthquakeObject(earthquakeLine){
    let object = {};
    if(typeof earthquakeLine === 'string'){
        let lineArray = earthquakeLine.split(' ');
        lineArray = lineArray.filter(e => e.length !== 0);
        let arrLen = lineArray.length; 
        if( arrLen >= 10){
            if(lineArray[arrLen - 3].startsWith("REVIZE")){
                const cozumNiteligi = lineArray.slice(-3).join(" ");
                lineArray = lineArray.slice(0,-3);
                object["cozumNiteligi"] = cozumNiteligi;
            } else {
                const cozumNiteligi = lineArray.slice(-1).join(" ");
                lineArray = lineArray.slice(0,-1);
                object["cozumNiteligi"] = cozumNiteligi;
            }
            object["date"] = lineArray[0];
            object["time"] = lineArray[1];
            object["enlem"] = lineArray[2];
            object["boylam"] = lineArray[3];
            object["dateAndPlace"] = lineArray.slice(0,4).join("-");
            object["derinlik"] = lineArray[4];
            object["MD"] = parseFloat( lineArray[5] );//.toFixed(1);
            object["ML"] = parseFloat( lineArray[6] );//.toFixed(1);
            object["MW"] = parseFloat( lineArray[7] );//.toFixed(1);
            object["timeAdded"] = Date.now();
            const formattedDate = object.date.replace(/\./g, '-');
            const formattedTime = object.time.replace(/\./g, ':');
            const timeDiffBetweenGMT = "+03:00";
            const dateToBeParsed = formattedDate + "T" + formattedTime + timeDiffBetweenGMT;
            object["timestamp"] = Date.parse(dateToBeParsed);
            arrLen = lineArray.length;
            let yerString = "";
            for(let i = 8; i<lineArray.length; ++i){
                yerString += lineArray[i];
                yerString += " ";
            }
            yerString.trimRight();
            object["yer"] = yerString;
        }
    }
    return object;
}

const parseEarthquakes = function () {
    let promise = new Promise(function (resolve, reject) {
        let filtered = [];
        let parsedEarthquakesObjects = [];
        request('http://www.koeri.boun.edu.tr/scripts/lst0.asp', {}, (err, res, data) => {
            try {
                if (err) { return console.log(err); }
                //console.log(res.body);
                var start = res.body.search("<pre>");
                var end = res.body.search("</pre>");
                if (start > -1 && end > -1) {
                    const importantPart = res.body.substring(start, end);
                    const lineArray = importantPart.split(/\n/);
                    filtered = lineArray.filter(e => e.startsWith("20"));
                    parsedEarthquakesObjects = filtered.map( e => getEarthquakeObject(e));
                    //filtered.forEach(e => console.log(e));
                }
            } catch (e) {
                console.log(e);
            }
            resolve(parsedEarthquakesObjects);
        });
    });
    return promise;
}

async function persistEarthquakes(db, earthquakeArr){
    let promise = new Promise( (resolve, reject) => {
        db.collection('records').insertMany(earthquakeArr, {ordered: false})
        .then( (val) => resolve(true) )
        .catch( (err) => {
            if( err.result.ok === 1){
                resolve(true);
            } else {
                reject(`Failed to insert. Error code: ${err.code}`);
            }
        })
    });
    return promise;
}

async function getLastBiggestEarthquakes(db){
    let result = new Promise( (resolve, reject) =>{
        db.collection('records').find({}, {
            limit: 10,
            sort: {
                "ML" : -1,
                "date": -1,
                "time": -1
            }
        }).toArray()
        .then( result => {
            resolve( result );
        }).catch (err => {
            console.log(err);
            reject(err);
        })
    });
    return result;
}

async function getBigEarthquakesToday(db, limit = 4.0){
    if(limit && (typeof limit == 'string')){
        limit = parseFloat(limit);
    }
    let result = new Promise( (resolve, reject) =>{
        const today = new Date();
        const day = today.getDate().toString().padStart(2, '0');
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const year = today.getFullYear().toString().padStart(4, '0');
        const wantedDay = `${year}.${month}.${day}`;
        db.collection('records').find({
            date: wantedDay,
            ML: {$gte: limit}
        }, 
        {
            limit: 5,
            sort: {
                "ML" : -1,
                "date" : -1,
                "time" : -1
            }
        }).toArray()
        .then( result => {
            resolve( result );
        }).catch (err => {
            console.log(err);
            reject(err);
        })
    });
    return result;
}

const app = express();

const exphbs = Handlebars.create({
    defaultLayout: 'main',
    helpers: {
        floatToFixed: (floatVal) => {
            return floatVal.toFixed(1);
        }
    }
})

app.engine('handlebars', exphbs.engine);
app.set('view engine', 'handlebars');

app.get('/', (req, res) => {
    parseEarthquakes().then( (earthquakeArray) => {
        persistEarthquakes(res.app.locals.db, earthquakeArray).then( (val) => {
            getLastBiggestEarthquakes(res.app.locals.db)
            .then( (earthquakes) => {
                res.render('index', {
                    title: "Earthquakes",
                    earthquakeList: earthquakes
                })
            })
            .catch( err => {
                res.render('index', {
                    title: "Oh no!"
                })
            })
        })
        .catch( (err) => {
            res.status(400);
            res.json({err});
        });
    })
    .catch( (err) => {
        res.status(400);
        res.json({err});
    });
});

app.get('/today', (req, res) => {
    parseEarthquakes().then( (earthquakeArray) => {
        persistEarthquakes(res.app.locals.db, earthquakeArray).then( (val) => {
            getBigEarthquakesToday(res.app.locals.db)
            .then( (earthquakes) => {
                res.render('index', {
                    title: "Earthquakes",
                    earthquakeList: earthquakes
                })
            })
            .catch( err => {
                res.render('index', {
                    title: "Oh no!"
                })
            })
        })
        .catch( (err) => {
            res.status(400);
            res.json({err});
        });
    })
    .catch( (err) => {
        res.status(400);
        res.json({err});
    });
});

app.get('/test', async (req, res) => {

    try{
        const todayEarthquakes = await getBigEarthquakesToday(res.app.locals.db, 2.5);
        res.render('combined', {
            title: "Earthquakes",
            earthquakeList: todayEarthquakes
        });
    }
    catch( err ){
        res.status(400);
        res.json({err});
    }
    /*parseEarthquakes().then( (earthquakeArray) => {
        persistEarthquakes(res.app.locals.db, earthquakeArray).then( (val) => {
            getBigEarthquakesToday(res.app.locals.db, 2.5)
            .then( (earthquakes) => {
                res.render('combined', {
                    title: "Earthquakes",
                    earthquakeList: earthquakes
                })
            })
            .catch( err => {
                res.render('index', {
                    title: "Oh no!"
                })
            })
        })
        .catch( (err) => {
            res.status(400);
            res.json({err});
        });
    })
    .catch( (err) => {
        res.status(400);
        res.json({err});
    });*/
});

app.use(bodyParser.urlencoded({extended: false}));

app.get('/today/:limit', (req, res) => {
    parseEarthquakes().then( (earthquakeArray) => {
        persistEarthquakes(res.app.locals.db, earthquakeArray).then( (val) => {
            const limit = req.params.limit;
            getBigEarthquakesToday(res.app.locals.db, limit)
            .then( (earthquakes) => {
                res.render('index', {
                    title: "Earthquakes",
                    earthquakeList: earthquakes
                })
            })
            .catch( err => {
                res.render('index', {
                    title: "Oh no!"
                })
            })
        })
        .catch( (err) => {
            res.status(400);
            res.json({err});
        });
    })
    .catch( (err) => {
        res.status(400);
        res.json({err});
    });
});


app.post('/', (req, res) => {
    const filteredEarthquakes = parseEarthquakes();
    res.send();
});

const PORT = process.env.PORT || 5000;

MongoClient.connect(config.databaseUrl, { useUnifiedTopology: true }, (err, client) => {
    if(err){
        throw(err);
    }
    app.locals.db = client.db('earthquake');
    client.db('earthquake').collection('records').createIndex('dateAndPlace', {unique: true})
    .then( val => {
        app.listen(PORT, () => {
            console.log(`Running at ${PORT}`)
        });
    }).catch(err => {
        throw err;
    });
});

