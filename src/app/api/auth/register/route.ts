import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getCollection } from "@/lib/mongodb";
import type { User } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: "メールアドレスとパスワードは必須です" },
        { status: 400 }
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "有効なメールアドレスを入力してください" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "パスワードは8文字以上で入力してください" },
        { status: 400 }
      );
    }

    const usersCol = await getCollection<User>("users");

    // Check if user exists
    const existingUser = await usersCol.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "このメールアドレスは既に登録されています" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    const user: User = {
      userId: randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      name: name || undefined,
      companyIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await usersCol.insertOne(user);

    return NextResponse.json({
      success: true,
      userId: user.userId,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "登録に失敗しました。もう一度お試しください。" },
      { status: 500 }
    );
  }
}
