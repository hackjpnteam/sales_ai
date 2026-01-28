import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import { SystemNotification } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

const SUPER_ADMIN_EMAILS = ["tomura@hackjpn.com"];

// GET: 全通知を取得（スーパーアドミン用）
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !SUPER_ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const notificationsCol = await getCollection<SystemNotification>("system_notifications");
    const notifications = await notificationsCol
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("[Notifications GET] Error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

// POST: 新規通知を作成（スーパーアドミン用）
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !SUPER_ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, message, type, link, expiresAt } = body;

    if (!title || !message || !type) {
      return NextResponse.json({ error: "title, message, type are required" }, { status: 400 });
    }

    const notificationsCol = await getCollection<SystemNotification>("system_notifications");

    const notification: SystemNotification = {
      notificationId: uuidv4(),
      title,
      message,
      type,
      link: link || undefined,
      createdBy: (session.user as { id?: string }).id || "unknown",
      createdAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    };

    await notificationsCol.insertOne(notification);

    return NextResponse.json({ success: true, notification });
  } catch (error) {
    console.error("[Notifications POST] Error:", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

// DELETE: 通知を削除（スーパーアドミン用）
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !SUPER_ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const notificationId = searchParams.get("notificationId");

    if (!notificationId) {
      return NextResponse.json({ error: "notificationId is required" }, { status: 400 });
    }

    const notificationsCol = await getCollection<SystemNotification>("system_notifications");
    await notificationsCol.deleteOne({ notificationId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Notifications DELETE] Error:", error);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
