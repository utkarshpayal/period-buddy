import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  try {
    if (!MONGODB_URI) {
      throw new Error('Set MONGODB_URI in .env.local before running this script.');
    }
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB.");

    const db = mongoose.connection.db;
    const collection = db.collection('cyclelogs');

    // Find the log
    const log = await collection.findOne({ _id: new mongoose.Types.ObjectId("6a5635eaab3d7d3137be9aa3") });
    if (log) {
      console.log("Found Log:", JSON.stringify(log, null, 2));
      console.log("type of phase:", typeof log.phase);
      console.log("phase === null:", log.phase === null);
      console.log("phase === 'null':", log.phase === 'null');
      console.log("phase === undefined:", log.phase === undefined);
    } else {
      console.log("Log not found by ID.");
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

run();
