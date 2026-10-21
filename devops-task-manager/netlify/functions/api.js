const serverless = require('serverless-http');
const { createPool, initializeDatabase } = require('../../src/db');
const { createApp } = require('../../src/server');

const pool = createPool();
const handler = serverless(createApp(pool));
let databaseInitialization;

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  if (!databaseInitialization) {
    databaseInitialization = initializeDatabase(pool);
  }
  try {
    await databaseInitialization;
  } catch (error) {
    databaseInitialization = undefined;
    throw error;
  }
  return handler(event, context);
};
