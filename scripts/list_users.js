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
    const usersCollection = db.collection('users');
    const matchesCollection = db.collection('buddymatches');

    const matches = await matchesCollection.find({}).toArray();
    console.log("Migrating BuddyMatches to real names...");
    for (const m of matches) {
      if (m.buddyUserId) {
        const buddy = await usersCollection.findOne({ _id: m.buddyUserId });
        if (buddy) {
          const realName = `${buddy.firstName} ${buddy.lastName}`;
          const avatarSeed = realName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
          await matchesCollection.updateOne(
            { _id: m._id },
            { $set: { alias: realName, avatarSeed: avatarSeed } }
          );
          console.log(`- Updated Match ${m._id}: Alias set to "${realName}" (Avatar: ${avatarSeed})`);
        }
      }
    }
    console.log("Migration complete!");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

run();
