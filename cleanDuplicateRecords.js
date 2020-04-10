const { MongoClient } = require('mongodb');
const config = require('./config');

MongoClient.connect(config.databaseUrl, { useUnifiedTopology: true }, async (err, client) => {
    if(err){
        throw(err);
    }
    const collection = client.db('earthquake').collection('records');
    const sortQuery = {
		"$sort": {
            "dateAndPlace" : -1,
            "_id": -1
		}
    };
    const groupQuery = {
		"$group":{
			"_id": "$dateAndPlace",
			"lastId": {"$first": "$_id"},
			"count": {"$sum": 1}
		}
	};
    const records = await collection.aggregate(sortQuery, groupQuery).toArray();
    const validIdArray = records.map(entry => entry["_id"]);
    const deleteQuery = {
        "_id": {
            "$nin": validIdArray
        }
    };
    const resultOfDelete = await collection.deleteMany(deleteQuery);
    console.log(`Finished deleting ${resultOfDelete.result.n} documents`);
});

