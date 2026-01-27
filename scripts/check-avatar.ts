// アバターの保存状態を確認
import { MongoClient } from "mongodb";

const MONGODB_URI = "mongodb+srv://hack:hack1204@cluster0.ay4hkb3.mongodb.net/?retryWrites=true&w=majority";
const DB_NAME = "voice_agent";

async function check() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // メインのhackjpn
    const agentsCol = db.collection("agents");
    const agent = await agentsCol.findOne({ companyId: "e2c748ed-b950-4774-8591-06836b2e430c" });

    console.log("=== hackjpn メインエージェント ===");
    console.log(`agentId: ${agent?.agentId}`);
    console.log(`name: ${agent?.name}`);
    console.log(`avatarUrl設定: ${agent?.avatarUrl ? '有り' : '無し'}`);

    if (agent?.avatarUrl) {
      console.log(`avatarUrl長さ: ${agent.avatarUrl.length}文字`);
      console.log(`avatarUrl先頭100文字: ${agent.avatarUrl.substring(0, 100)}...`);

      if (agent.avatarUrl.startsWith("data:image")) {
        console.log(`タイプ: Base64画像`);
      } else if (agent.avatarUrl.startsWith("/")) {
        console.log(`タイプ: ローカルパス`);
      } else if (agent.avatarUrl.startsWith("http")) {
        console.log(`タイプ: 外部URL`);
      }
    } else {
      console.log(`avatarUrl: 未設定（デフォルトが使用される）`);
    }

    // avatarsコレクションも確認
    const avatarsCol = db.collection("avatars");
    const avatars = await avatarsCol.find({ agentId: agent?.agentId }).toArray();
    console.log(`\n=== このエージェントのカスタムアバター: ${avatars.length}件 ===`);
    avatars.forEach((a, i) => {
      console.log(`${i + 1}. avatarId: ${a.avatarId}`);
      console.log(`   dataUrl長さ: ${a.dataUrl?.length}文字`);
    });

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

check();
