import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import { SystemNotification, NotificationRead, UserNotification } from "@/lib/types";

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

    const [systemNotificationsCol, readsCol, userNotificationsCol] = await Promise.all([
      getCollection<SystemNotification>("system_notifications"),
      getCollection<NotificationRead>("notification_reads"),
      getCollection<UserNotification>("user_notifications"),
    ]);

    // システム通知：有効期限内のものを取得
    const now = new Date();
    const systemNotifications = await systemNotificationsCol
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

    // ユーザー個別通知を取得
    const userNotifications = await userNotificationsCol
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    // システム通知の既読状態を取得
    const reads = await readsCol.find({ userId }).toArray();
    const readIds = new Set(reads.map((r) => r.notificationId));

    // システム通知に既読状態を付与
    const systemNotificationsWithRead = systemNotifications.map((n) => ({
      notificationId: n.notificationId,
      title: n.title,
      message: n.message,
      type: n.type,
      link: n.link,
      createdAt: n.createdAt,
      isRead: readIds.has(n.notificationId),
      isSystem: true,
    }));

    // ユーザー個別通知をフォーマット
    const userNotificationsFormatted = userNotifications.map((n) => ({
      notificationId: n.notificationId,
      title: n.title,
      message: n.message,
      type: n.type,
      link: n.link,
      createdAt: n.createdAt,
      isRead: n.isRead,
      isSystem: false,
      fromUserName: n.fromUserName,
      agentName: n.agentName,
    }));

    // 全通知を統合して日付順にソート
    const allNotifications = [...systemNotificationsWithRead, ...userNotificationsFormatted]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30);

    // 未読数を計算
    const unreadCount = allNotifications.filter((n) => !n.isRead).length;

    return NextResponse.json({
      notifications: allNotifications,
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
    const { notificationId, markAllRead, isUserNotification } = body;

    const [readsCol, userNotificationsCol] = await Promise.all([
      getCollection<NotificationRead>("notification_reads"),
      getCollection<UserNotification>("user_notifications"),
    ]);

    if (markAllRead) {
      // システム通知を全て既読にする
      const systemNotificationsCol = await getCollection<SystemNotification>("system_notifications");
      const systemNotifications = await systemNotificationsCol.find({}).toArray();

      const operations = systemNotifications.map((n) => ({
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

      // ユーザー個別通知も全て既読にする
      await userNotificationsCol.updateMany(
        { userId, isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
      );
    } else if (notificationId) {
      if (isUserNotification) {
        // ユーザー個別通知を既読にする
        await userNotificationsCol.updateOne(
          { notificationId, userId },
          { $set: { isRead: true, readAt: new Date() } }
        );
      } else {
        // システム通知を既読にする
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
      }
    } else {
      return NextResponse.json({ error: "notificationId or markAllRead is required" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Notifications POST] Error:", error);
    return NextResponse.json({ error: "Failed to mark notification as read" }, { status: 500 });
  }
}
