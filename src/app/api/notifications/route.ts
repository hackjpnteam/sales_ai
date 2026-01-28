import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import { SystemNotification, NotificationRead } from "@/lib/types";

// GET: ユーザー向け通知を取得（未読/既読状態付き）
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ error: "User ID not found" }, { status: 401 });
    }

    const [notificationsCol, readsCol] = await Promise.all([
      getCollection<SystemNotification>("system_notifications"),
      getCollection<NotificationRead>("notification_reads"),
    ]);

    // 有効期限内の通知を取得（expiresAtがない、null、または未来の日付）
    const now = new Date();
    const notifications = await notificationsCol
      .find({
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $eq: null } },
          { expiresAt: { $gt: now } },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    // ユーザーの既読状態を取得
    const reads = await readsCol.find({ userId }).toArray();
    const readIds = new Set(reads.map((r) => r.notificationId));

    // 未読数を計算
    const unreadCount = notifications.filter((n) => !readIds.has(n.notificationId)).length;

    // 通知に既読状態を付与
    const notificationsWithRead = notifications.map((n) => ({
      ...n,
      isRead: readIds.has(n.notificationId),
    }));

    return NextResponse.json({
      notifications: notificationsWithRead,
      unreadCount,
    });
  } catch (error) {
    console.error("[Notifications GET] Error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

// POST: 通知を既読にする
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ error: "User ID not found" }, { status: 401 });
    }

    const body = await req.json();
    const { notificationId, markAllRead } = body;

    const readsCol = await getCollection<NotificationRead>("notification_reads");

    if (markAllRead) {
      // 全て既読にする
      const notificationsCol = await getCollection<SystemNotification>("system_notifications");
      const notifications = await notificationsCol.find({}).toArray();

      const operations = notifications.map((n) => ({
        updateOne: {
          filter: { userId, notificationId: n.notificationId },
          update: {
            $setOnInsert: {
              userId,
              notificationId: n.notificationId,
              readAt: new Date(),
            },
          },
          upsert: true,
        },
      }));

      if (operations.length > 0) {
        await readsCol.bulkWrite(operations);
      }
    } else if (notificationId) {
      // 特定の通知を既読にする
      await readsCol.updateOne(
        { userId, notificationId },
        {
          $setOnInsert: {
            userId,
            notificationId,
            readAt: new Date(),
          },
        },
        { upsert: true }
      );
    } else {
      return NextResponse.json({ error: "notificationId or markAllRead is required" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Notifications POST] Error:", error);
    return NextResponse.json({ error: "Failed to mark notification as read" }, { status: 500 });
  }
}
