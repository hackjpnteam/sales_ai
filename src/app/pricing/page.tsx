"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Check,
  X,
  Sparkles,
  ArrowLeft,
  CreditCard,
  Loader2,
  Crown,
  Zap,
  Building,
  Database,
  MessageSquare,
  Palette,
  BarChart3,
  Users,
  Lock,
  Unlock,
} from "lucide-react";

type PlanType = "free" | "lite" | "pro" | "max";

type PlanFeature = {
  name: string;
  free: boolean | string;
  lite: boolean | string;
  pro: boolean | string;
  max: boolean | string;
};

const features: PlanFeature[] = [
  { name: "AIチャットボット", free: true, lite: true, pro: true, max: true },
  { name: "ウェブサイトスクレイピング", free: true, lite: true, pro: true, max: true },
  { name: "基本デザインカスタマイズ", free: true, lite: true, pro: true, max: true },
  { name: "クイックボタン（3個まで）", free: true, lite: true, pro: true, max: true },
  { name: "埋め込みコード取得", free: false, lite: true, pro: true, max: true },
  { name: "カラーカスタマイズ", free: false, lite: true, pro: true, max: true },
  { name: "クイックボタン（無制限）", free: false, lite: false, pro: true, max: true },
  { name: "カスタムナレッジ追加", free: false, lite: false, pro: true, max: true },
  { name: "システムプロンプト編集", free: false, lite: false, pro: true, max: true },
  { name: "詳細アナリティクス", free: false, lite: false, pro: true, max: true },
  { name: "コンバージョン計測", free: false, lite: false, pro: true, max: true },
  { name: "チーム共有", free: false, lite: false, pro: true, max: true },
  { name: "エージェント数", free: "1", lite: "1", pro: "3", max: "10" },
  { name: "優先サポート", free: false, lite: false, pro: false, max: true },
  { name: "カスタム開発相談", free: false, lite: false, pro: false, max: true },
];

const plans = [
  {
    id: "free" as const,
    name: "Free",
    price: 0,
    description: "まずは試してみたい方に",
    color: "slate",
    icon: Zap,
    popular: false,
  },
  {
    id: "lite" as const,
    name: "Lite",
    price: 500,
    description: "個人サイトや小規模ビジネスに",
    color: "blue",
    icon: Sparkles,
    popular: false,
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: 3000,
    description: "本格的なビジネス活用に",
    color: "purple",
    icon: Crown,
    popular: true,
  },
  {
    id: "max" as const,
    name: "Max",
    price: 10000,
    description: "大規模運用・複数サイトに",
    color: "amber",
    icon: Building,
    popular: false,
  },
];

function PricingContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentPlan, setCurrentPlan] = useState<PlanType>("free");
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const returnTo = searchParams.get("return");
  const feature = searchParams.get("feature");

  // 現在のプランを取得
  useEffect(() => {
    const fetchCurrentPlan = async () => {
      if (status !== "authenticated") {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/user/companies");
        if (res.ok) {
          const data = await res.json();
          // 最高のプランを取得
          const highestPlan = data.companies?.reduce(
            (highest: PlanType, company: { plan?: PlanType }) => {
              const planOrder: Record<PlanType, number> = {
                free: 0,
                lite: 1,
                pro: 2,
                max: 3,
              };
              const current = company.plan || "free";
              return planOrder[current] > planOrder[highest] ? current : highest;
            },
            "free" as PlanType
          );
          setCurrentPlan(highestPlan || "free");
        }
      } catch (error) {
        console.error("Failed to fetch plan:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentPlan();
  }, [status]);

  const handleUpgrade = async (planId: PlanType) => {
    if (planId === "free") return;

    if (status !== "authenticated") {
      router.push(`/login?redirect=/pricing`);
      return;
    }

    setUpgrading(planId);

    try {
      // Get the user's first company
      const companiesRes = await fetch("/api/user/companies");
      const companiesData = await companiesRes.json();
      const company = companiesData.companies?.[0];

      if (!company) {
        alert("まずエージェントを作成してください");
        router.push("/");
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.companyId,
          plan: planId,
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "エラーが発生しました");
      }
    } catch (error) {
      console.error("Upgrade error:", error);
      alert("エラーが発生しました");
    } finally {
      setUpgrading(null);
    }
  };

  const getPlanButtonText = (planId: PlanType) => {
    const planOrder: Record<PlanType, number> = {
      free: 0,
      lite: 1,
      pro: 2,
      max: 3,
    };

    if (planId === "free") return "現在のプラン";
    if (planOrder[planId] <= planOrder[currentPlan]) return "現在のプラン";
    return "アップグレード";
  };

  const isPlanActive = (planId: PlanType) => {
    const planOrder: Record<PlanType, number> = {
      free: 0,
      lite: 1,
      pro: 2,
      max: 3,
    };
    return planOrder[planId] <= planOrder[currentPlan];
  };

  const getColorClasses = (color: string, isPopular: boolean) => {
    const colors: Record<string, { bg: string; text: string; border: string; button: string }> = {
      slate: {
        bg: "bg-slate-50",
        text: "text-slate-600",
        border: "border-slate-200",
        button: "bg-slate-600 hover:bg-slate-700",
      },
      blue: {
        bg: "bg-blue-50",
        text: "text-blue-600",
        border: "border-blue-200",
        button: "bg-blue-600 hover:bg-blue-700",
      },
      purple: {
        bg: "bg-purple-50",
        text: "text-purple-600",
        border: isPopular ? "border-purple-400 ring-2 ring-purple-400" : "border-purple-200",
        button: "bg-purple-600 hover:bg-purple-700",
      },
      amber: {
        bg: "bg-amber-50",
        text: "text-amber-600",
        border: "border-amber-200",
        button: "bg-amber-600 hover:bg-amber-700",
      },
    };
    return colors[color] || colors.slate;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <Link
            href={returnTo || "/dashboard"}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>戻る</span>
          </Link>

          {status === "authenticated" && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>現在のプラン:</span>
              <span className="font-semibold capitalize">{currentPlan}</span>
            </div>
          )}
        </div>

        {/* Feature unlock notice */}
        {feature && (
          <div className="mb-8 p-4 bg-rose-50 border border-rose-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                <Lock className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <p className="font-medium text-rose-800">
                  「{feature}」機能はProプラン以上で利用できます
                </p>
                <p className="text-sm text-rose-600">
                  アップグレードして全ての機能をお使いください
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-4">
            シンプルな料金プラン
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto">
            ビジネスの規模に合わせて最適なプランをお選びください。
            いつでもアップグレード・ダウングレードが可能です。
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {plans.map((plan) => {
            const colorClasses = getColorClasses(plan.color, plan.popular);
            const Icon = plan.icon;
            const isActive = isPlanActive(plan.id);

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 ${colorClasses.border} bg-white overflow-hidden transition-all hover:shadow-lg`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-purple-600 text-white text-xs font-semibold px-3 py-1 rounded-bl-xl">
                    人気
                  </div>
                )}

                <div className={`p-6 ${colorClasses.bg}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className={`w-10 h-10 rounded-xl ${colorClasses.bg} flex items-center justify-center`}
                    >
                      <Icon className={`w-5 h-5 ${colorClasses.text}`} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">{plan.name}</h3>
                  </div>

                  <div className="mb-2">
                    <span className="text-3xl font-bold text-slate-800">
                      ¥{plan.price.toLocaleString()}
                    </span>
                    <span className="text-slate-500">/月</span>
                  </div>

                  <p className="text-sm text-slate-600">{plan.description}</p>
                </div>

                <div className="p-6">
                  <button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={isActive || upgrading === plan.id}
                    className={`w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                      isActive
                        ? "bg-slate-300 cursor-not-allowed"
                        : colorClasses.button
                    }`}
                  >
                    {upgrading === plan.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : isActive ? (
                      <>
                        <Check className="w-5 h-5" />
                        {getPlanButtonText(plan.id)}
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5" />
                        {getPlanButtonText(plan.id)}
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-800">機能比較</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left p-4 font-semibold text-slate-700">機能</th>
                  {plans.map((plan) => (
                    <th
                      key={plan.id}
                      className={`p-4 font-semibold text-center ${
                        plan.popular ? "bg-purple-50 text-purple-700" : "text-slate-700"
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((feature, index) => (
                  <tr
                    key={feature.name}
                    className={index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                  >
                    <td className="p-4 text-slate-700">{feature.name}</td>
                    {(["free", "lite", "pro", "max"] as const).map((planId) => {
                      const value = feature[planId];
                      const plan = plans.find((p) => p.id === planId);

                      return (
                        <td
                          key={planId}
                          className={`p-4 text-center ${
                            plan?.popular ? "bg-purple-50/50" : ""
                          }`}
                        >
                          {typeof value === "boolean" ? (
                            value ? (
                              <Check className="w-5 h-5 text-green-500 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-slate-300 mx-auto" />
                            )
                          ) : (
                            <span className="font-semibold text-slate-700">{value}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-800 text-center mb-8">
            よくある質問
          </h2>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-800 mb-2">
                プランはいつでも変更できますか？
              </h3>
              <p className="text-slate-600">
                はい、いつでもアップグレード・ダウングレードが可能です。
                アップグレードは即時反映され、ダウングレードは次の請求サイクルから適用されます。
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-800 mb-2">
                無料プランに制限はありますか？
              </h3>
              <p className="text-slate-600">
                無料プランでは埋め込みコードの取得ができないため、
                テスト目的でのみご利用いただけます。本番サイトへの導入にはLiteプラン以上が必要です。
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-800 mb-2">
                支払い方法は何がありますか？
              </h3>
              <p className="text-slate-600">
                クレジットカード（Visa, Mastercard, American Express, JCB）に対応しています。
                Stripeによる安全な決済処理を行っています。
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-800 mb-2">
                解約はできますか？
              </h3>
              <p className="text-slate-600">
                はい、いつでも解約可能です。解約後も請求期間の終了まではサービスをご利用いただけます。
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center pb-16">
          <p className="text-slate-600 mb-4">
            ご不明な点がございましたらお気軽にお問い合わせください
          </p>
          <a
            href="mailto:support@hackjpn.com"
            className="inline-flex items-center gap-2 text-rose-600 hover:text-rose-700 font-semibold"
          >
            <MessageSquare className="w-5 h-5" />
            サポートに連絡する
          </a>
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
