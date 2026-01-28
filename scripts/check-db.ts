import { MongoClient } from 'mongodb';

async function check() {
  const uri = process.env.MONGODB_URI || 'mongodb+srv://hack:hack1204@cluster0.ay4hkb3.mongodb.net/?appName=Cluster0';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db('voice_agent');

    // Check agents
    const agents = await db.collection('agents').find({}).toArray();
    console.log('=== Agents ===');
    console.log('Total:', agents.length);
    agents.forEach((a: any, i: number) => {
      console.log(`${i + 1}. ${a.name} (${a.agentId?.slice(0, 8)}...)`);
    });

    // Check companies
    const companies = await db.collection('companies').find({}).toArray();
    console.log('\n=== Companies ===');
    console.log('Total:', companies.length);

    // Check documents
    const docs = await db.collection('documents').countDocuments();
    console.log('\n=== Documents ===');
    console.log('Total:', docs);

    // Check chat_logs
    const logs = await db.collection('chat_logs').countDocuments();
    console.log('\n=== Chat Logs ===');
    console.log('Total:', logs);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

check();
