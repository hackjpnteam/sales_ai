// 全アバターを確認
import { MongoClient } from "mongodb";

const MONGODB_URI = "mongodb+srv://hack:hack1204@cluster0.ay4hkb3.mongodb.net/?retryWrites=true&w=majority";
const DB_NAME = "voice_agent";

async function check() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const avatarsCol = db.collection("avatars");
    const allAvatars = await avatarsCol.find({}).toArray();

    console.log(`=== 全アバター: ${allAvatars.length}件 ===\n`);

    for (const avatar of allAvatars) {
      console.log(`avatarId: ${avatar.avatarId}`);
      console.log(`agentId: ${avatar.agentId}`);
      console.log(`companyId: ${avatar.companyId}`);
      console.log(`name: ${avatar.name}`);
      console.log(`dataUrl長さ: ${avatar.dataUrl?.length}`);
      console.log(`createdAt: ${avatar.createdAt}`);
      console.log("---");
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

check();
