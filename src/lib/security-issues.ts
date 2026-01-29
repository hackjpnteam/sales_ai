// セキュリティ問題の詳細定義（ホワイトハッカー視点）

export type SecurityIssueDetail = {
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  technicalDetail: string;
  potentialDamage: string;
  recommendation: string;
  references?: string[];
};

export const SECURITY_ISSUE_DETAILS: Record<string, Omit<SecurityIssueDetail, "type">> = {
  https_missing: {
    severity: "critical",
    title: "HTTPS未使用（暗号化通信なし）",
    description:
      "本サイトはHTTPS（SSL/TLS）による暗号化通信を使用していません。すべての通信データが平文で送受信されており、第三者による盗聴が容易な状態です。",
    technicalDetail:
      "HTTP通信はOSI参照モデルのアプリケーション層で平文のまま送信されます。攻撃者は同一ネットワーク上でパケットキャプチャツール（Wireshark等）を使用することで、通信内容をリアルタイムで傍受可能です。また、中間者攻撃（MITM: Man-in-the-Middle Attack）により、通信内容の改ざんも可能となります。",
    potentialDamage:
      "【想定される被害】\n• ユーザーのログイン情報（ID・パスワード）の漏洩\n• クレジットカード情報等の決済情報の窃取\n• 個人情報（氏名、住所、電話番号等）の流出\n• セッションハイジャックによる不正アクセス\n• フィッシングサイトへのリダイレクト\n• SEO評価の低下（GoogleはHTTPSを推奨）\n• ブラウザによる「安全ではない」警告表示によるユーザー離脱",
    recommendation:
      "SSL/TLS証明書を取得し、サイト全体をHTTPS化してください。Let's Encryptを利用すれば無料で証明書を取得できます。また、HTTP Strict Transport Security（HSTS）ヘッダーを設定し、常にHTTPS接続を強制することを推奨します。",
    references: ["https://letsencrypt.org/", "https://developer.mozilla.org/ja/docs/Web/HTTP/Headers/Strict-Transport-Security"],
  },

  http_form: {
    severity: "critical",
    title: "HTTPフォーム送信（非暗号化データ送信）",
    description:
      "フォームのaction属性がHTTP（非暗号化）URLを指定しています。ユーザーが入力したデータが暗号化されずにネットワーク上を流れるため、情報漏洩のリスクが極めて高い状態です。",
    technicalDetail:
      "HTMLフォームのaction属性が「http://」で始まるURLを指定している場合、POSTされるデータはすべて平文で送信されます。特にログインフォーム、会員登録フォーム、お問い合わせフォームなど、機密性の高い情報を扱うフォームが対象の場合、深刻な脆弱性となります。",
    potentialDamage:
      "【想定される被害】\n• フォームに入力された全データの漏洩\n• ユーザー認証情報の窃取によるアカウント乗っ取り\n• 個人情報保護法違反による法的責任\n• 顧客からの信頼失墜\n• GDPR等の国際規制違反による制裁金（最大で全世界売上の4%）",
    recommendation:
      "すべてのフォームのaction属性をHTTPSのURLに変更してください。相対パスを使用するか、プロトコル相対URL（//example.com/path）を使用することで、自動的にページと同じプロトコルが適用されます。",
  },

  mixed_content: {
    severity: "high",
    title: "混合コンテンツ（Mixed Content）",
    description:
      "HTTPSページ内でHTTP経由のリソース（画像、スクリプト、スタイルシート等）が読み込まれています。これにより、暗号化通信のセキュリティが部分的に無効化されています。",
    technicalDetail:
      "混合コンテンツには「パッシブ混合コンテンツ」（画像、動画等）と「アクティブ混合コンテンツ」（スクリプト、スタイルシート等）があります。特にアクティブ混合コンテンツは、攻撃者がスクリプトを改ざんすることでページ全体を制御可能となるため、より深刻な脅威となります。",
    potentialDamage:
      "【想定される被害】\n• 攻撃者によるスクリプト改ざんを通じたXSS攻撃\n• ページコンテンツの不正改ざん\n• ユーザーの行動追跡・監視\n• ブラウザによる警告表示（鍵マークが表示されない）\n• ユーザーの信頼性低下",
    recommendation:
      "すべての外部リソースをHTTPS経由で読み込むように修正してください。Content-Security-Policy（CSP）ヘッダーで「upgrade-insecure-requests」ディレクティブを設定することで、自動的にHTTPリクエストをHTTPSにアップグレードすることも可能です。",
  },

  external_scripts: {
    severity: "info",
    title: "多数の外部スクリプト読み込み",
    description:
      "複数の外部ドメインからJavaScriptが読み込まれています。各スクリプトの信頼性を確認し、必要最小限に抑えることを推奨します。",
    technicalDetail:
      "外部スクリプトはサードパーティのサーバーから配信されるため、そのサーバーが侵害された場合やサプライチェーン攻撃を受けた場合、悪意のあるコードが自サイトに注入される可能性があります。近年、npmパッケージやCDN経由での攻撃が増加しています。",
    potentialDamage:
      "【想定される被害】\n• サプライチェーン攻撃によるマルウェア感染\n• ユーザー情報の外部送信（スキミング）\n• クリプトジャッキング（暗号通貨の不正マイニング）\n• ページパフォーマンスの低下\n• 外部サービス障害時のサイト機能停止",
    recommendation:
      "使用していない外部スクリプトを削除し、必要なスクリプトにはSubresource Integrity（SRI）を設定してください。また、Content-Security-Policyヘッダーで許可するスクリプトソースを明示的に指定することを推奨します。",
  },

  old_jquery: {
    severity: "medium",
    title: "脆弱性のあるjQueryバージョン",
    description:
      "使用されているjQueryのバージョンには既知のセキュリティ脆弱性が存在します。攻撃者はこれらの脆弱性を悪用してクロスサイトスクリプティング（XSS）攻撃を実行する可能性があります。",
    technicalDetail:
      "jQuery 3.5.0未満のバージョンには、CVE-2020-11022およびCVE-2020-11023として報告されているXSS脆弱性が存在します。これらの脆弱性により、悪意のあるHTMLが適切にサニタイズされず、スクリプトが実行される可能性があります。",
    potentialDamage:
      "【想定される被害】\n• XSS攻撃によるセッションCookieの窃取\n• フィッシングコンテンツの注入\n• キーロガーの埋め込みによる入力情報の窃取\n• ユーザーの意図しない操作の実行（CSRF）\n• マルウェア配布サイトへのリダイレクト",
    recommendation:
      "jQueryを最新の安定版（現在3.7.x）にアップデートしてください。また、可能であればjQueryへの依存を減らし、ネイティブのJavaScript APIへの移行を検討してください。",
    references: ["https://nvd.nist.gov/vuln/detail/CVE-2020-11022", "https://jquery.com/upgrade-guide/"],
  },

  cookie_security: {
    severity: "medium",
    title: "Cookie セキュリティ設定の不備",
    description:
      "JavaScriptからアクセス可能なCookieが多数検出されました。セッション管理に使用されるCookieがHttpOnly属性なしで設定されている可能性があり、XSS攻撃によるセッションハイジャックのリスクがあります。",
    technicalDetail:
      "document.cookieからアクセス可能なCookieは、クロスサイトスクリプティング（XSS）攻撃により窃取される可能性があります。HttpOnly属性が設定されたCookieはJavaScriptからアクセスできないため、XSS攻撃の被害を軽減できます。また、Secure属性がないCookieはHTTP通信でも送信されるため、盗聴のリスクがあります。",
    potentialDamage:
      "【想定される被害】\n• セッションハイジャックによる不正ログイン\n• ユーザーになりすましての不正操作\n• 個人情報・機密情報へのアクセス\n• 購入履歴・決済情報の閲覧\n• アカウントの完全な乗っ取り",
    recommendation:
      "セッションCookieには必ずHttpOnly属性とSecure属性を設定してください。また、SameSite属性を「Strict」または「Lax」に設定し、CSRF攻撃を防止してください。",
  },

  password_autocomplete: {
    severity: "low",
    title: "パスワードフィールドのautocomplete設定不備",
    description:
      "パスワード入力フィールドでautocomplete属性が適切に設定されていません。ブラウザによる意図しないパスワード保存や自動入力が発生する可能性があります。",
    technicalDetail:
      "autocomplete属性が未設定または「on」に設定されているパスワードフィールドでは、ブラウザがパスワードを自動保存・自動入力する場合があります。共有PCや公共端末での使用時に、他のユーザーにパスワードが漏洩するリスクがあります。",
    potentialDamage:
      "【想定される被害】\n• 共有端末でのパスワード漏洩\n• 意図しないアカウントへの自動ログイン\n• ブラウザのパスワードマネージャー経由での情報漏洩\n• フォーム自動入力による誤操作",
    recommendation:
      "新規パスワード入力フィールドにはautocomplete=\"new-password\"を、既存パスワード入力フィールドにはautocomplete=\"current-password\"を設定してください。",
  },

  no_frame_protection: {
    severity: "low",
    title: "クリックジャッキング対策の不備",
    description:
      "X-Frame-OptionsヘッダーまたはContent-Security-Policyのframe-ancestorsディレクティブが設定されていない可能性があります。これにより、クリックジャッキング攻撃のリスクがあります。",
    technicalDetail:
      "クリックジャッキングは、透明なiframe内に対象サイトを読み込み、その上に偽装したUIを重ねることで、ユーザーに意図しないクリックをさせる攻撃手法です。X-Frame-OptionsまたはCSPのframe-ancestorsを設定することで、サイトが他のページにフレーム内で読み込まれることを防止できます。",
    potentialDamage:
      "【想定される被害】\n• ユーザーの意図しない操作（いいね、フォロー、購入等）\n• 設定変更やアカウント操作の強制実行\n• 機密情報の意図しない公開\n• 不正送金や決済の実行",
    recommendation:
      "HTTPレスポンスヘッダーに「X-Frame-Options: DENY」または「X-Frame-Options: SAMEORIGIN」を設定してください。より柔軟な制御が必要な場合は、Content-Security-Policyヘッダーで「frame-ancestors 'self'」を指定してください。",
  },
};

// グレードの説明
export const GRADE_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  A: {
    label: "優秀",
    description: "セキュリティ対策が適切に実施されており、現時点で重大な脆弱性は検出されませんでした。引き続き定期的な診断と最新のセキュリティ情報の収集を推奨します。",
  },
  B: {
    label: "良好",
    description: "基本的なセキュリティ対策は実施されていますが、一部改善の余地があります。検出された問題に対処することで、より堅牢なセキュリティ体制を構築できます。",
  },
  C: {
    label: "要改善",
    description: "複数のセキュリティ上の問題が検出されました。早急な対応が必要です。特に重要度の高い問題から優先的に対処することを推奨します。",
  },
  D: {
    label: "危険",
    description: "重大なセキュリティリスクが存在します。攻撃者に悪用される可能性が高く、即座の対応が必要です。専門家への相談を強く推奨します。",
  },
  F: {
    label: "緊急対応必要",
    description: "複数の重大な脆弱性が検出されました。現状では攻撃者による被害発生のリスクが極めて高い状態です。直ちにサイトの公開停止を含む緊急対応を検討してください。",
  },
};
