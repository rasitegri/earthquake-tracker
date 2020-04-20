const user = process.env.MONGODB_EARTHQUAKE_USER;
const password = process.env.MONGODB_EARTHQUAKE_PASSWORD;
const authDb = process.env.MONGODB_EARTHQUAKE_AUTH_DB;
const dbName = authDb;

const databaseUrl = `mongodb://${user}:${password}@localhost:27017/${dbName}?authSource=${authDb}`;

module.exports = {
    databaseUrl
};
