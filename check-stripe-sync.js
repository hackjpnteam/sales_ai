require("dotenv").config({ path: ".env.local" });
const Stripe = require("stripe");
const { MongoClient } = require("mongodb");

async function main() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME);

  console.log("=== Stripe課金済み（chatsalesアプリ）===");

  let hasMore = true;
  let startingAfter = undefined;
  const paidSessions = [];

  while (hasMore) {
    const params = { type: "checkout.session.completed", limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;

    const events = await stripe.events.list(params);

    for (const event of events.data) {
      const session = event.data.object;
      if (session.metadata && session.metadata.companyId) {
        paidSessions.push({
          eventId: event.id,
          created: new Date(event.created * 1000),
          companyId: session.metadata.companyId,
          plan: session.metadata.plan,
          userId: session.metadata.userId,
          customerId: session.customer,
          subscriptionId: session.subscription
        });
      }
    }

    hasMore = events.has_more;
    if (events.data.length > 0) {
      startingAfter = events.data[events.data.length - 1].id;
    }
  }

  console.log("Stripe課金セッション数: " + paidSessions.length + "件");
  console.log("");

  console.log("=== DB未反映チェック ===");
  let unmatchedCount = 0;

  for (const session of paidSessions) {
    const company = await db.collection("companies").findOne({
      companyId: session.companyId
    });

    const hasStripeId = company && company.stripeSubscriptionId === session.subscriptionId;
    const planMatch = company && company.plan === session.plan;

    if (!hasStripeId || !planMatch) {
      unmatchedCount++;
      console.log("[未反映] " + session.companyId);
      console.log("  Stripe: plan=" + session.plan + ", subId=" + session.subscriptionId);
      console.log("  DB: plan=" + (company ? company.plan : "N/A") + ", subId=" + (company ? company.stripeSubscriptionId : "N/A"));
      console.log("  userId: " + session.userId);
      console.log("  課金日: " + session.created.toLocaleDateString("ja-JP"));
      console.log("");
    }
  }

  if (unmatchedCount === 0) {
    console.log("全て反映済みです");
  } else {
    console.log("未反映: " + unmatchedCount + "件");
  }

  await client.close();
}

main().catch(console.error);
