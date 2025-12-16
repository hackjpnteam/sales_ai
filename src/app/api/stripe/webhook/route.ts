import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getCollection } from "@/lib/mongodb";
import Stripe from "stripe";

// 処理済みイベントの型
interface ProcessedEvent {
  eventId: string;
  processedAt: Date;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 });
  }

  // 重複処理防止: イベントIDが既に処理されているかチェック
  const processedEventsCol = await getCollection<ProcessedEvent>("processed_stripe_events");
  const existingEvent = await processedEventsCol.findOne({ eventId: event.id });
  if (existingEvent) {
    console.log(`[Webhook] Event ${event.id} already processed, skipping`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // イベントを処理済みとして記録
  await processedEventsCol.insertOne({
    eventId: event.id,
    processedAt: new Date(),
  });

  // イベント処理
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = session.metadata?.companyId;
      const plan = session.metadata?.plan as "lite" | "pro" | "max";
      const userId = session.metadata?.userId;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      if (companyId && plan) {
        const companiesCol = await getCollection("companies");
        await companiesCol.updateOne(
          { companyId },
          {
            $set: {
              plan,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              planStartedAt: new Date(),
            },
          },
          { upsert: true }
        );
        console.log(`[Webhook] Company ${companyId} upgraded to ${plan} plan`);

        // Maxプランの場合はユーザーのmaxPlanCountをインクリメント
        if (plan === "max" && userId) {
          const usersCol = await getCollection("users");
          await usersCol.updateOne(
            { userId },
            {
              $addToSet: { companyIds: companyId },
              $inc: { maxPlanCount: 1 }
            }
          );
          console.log(`[Webhook] Incremented maxPlanCount for user ${userId}`);
        } else if (userId) {
          // Link company to user if userId provided (non-max plans)
          const usersCol = await getCollection("users");
          await usersCol.updateOne(
            { userId },
            { $addToSet: { companyIds: companyId } }
          );
          console.log(`[Webhook] Linked company ${companyId} to user ${userId}`);
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const companyId = subscription.metadata?.companyId;

      if (companyId) {
        const companiesCol = await getCollection("companies");
        await companiesCol.updateOne(
          { companyId },
          {
            $set: {
              plan: "free",
              planEndedAt: new Date(),
            },
          }
        );
        console.log(`[Webhook] Company ${companyId} subscription canceled`);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as unknown as { subscription: string }).subscription;

      // サブスクリプションからメタデータを取得
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const companyId = subscription.metadata?.companyId;

        if (companyId) {
          console.log(`[Webhook] Payment failed for company ${companyId}`);
          // 必要に応じてメール通知などを追加
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
