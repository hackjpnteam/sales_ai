(function () {
  // [Analytics] visitorId を localStorage で永続化
  function getOrCreateVisitorId() {
    try {
      var key = 'saleschat_visitor_id';
      var id = localStorage.getItem(key);
      if (!id) {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        localStorage.setItem(key, id);
      }
      return id;
    } catch (e) {
      return 'anon_' + Date.now();
    }
  }

  // [Analytics] sessionId を sessionStorage でタブごとに管理
  function getOrCreateSessionId() {
    try {
      var key = 'saleschat_session_id';
      var id = sessionStorage.getItem(key);
      if (!id) {
        id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch (e) {
      return 'sess_' + Date.now();
    }
  }

  // [Analytics] デバイスタイプ判定
  function detectDeviceType() {
    var ua = navigator.userAgent.toLowerCase();
    if (/ipad|tablet|playbook|silk|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile/i.test(ua)) {
      return 'mobile';
    }
    return 'pc';
  }

  // [Analytics] トラッキングイベント送信
  function sendTrackingEvent(event, apiBase, companyId, visitorId, sessionId) {
    try {
      var payload = Object.assign({}, event, {
        companyId: companyId,
        visitorId: visitorId,
        sessionId: sessionId,
        userAgent: navigator.userAgent,
        url: window.location.href,
        referrer: document.referrer || null,
        deviceType: detectDeviceType()
      });

      fetch(apiBase + '/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(payload)
      }).catch(function() {
        // エラーは握りつぶす（ウィジェット表示を邪魔しない）
      });
    } catch (e) {
      // 無視
    }
  }

  // [Analytics] コンバージョントラッキング用グローバル関数
  var _trackingContext = null;
  var _conversionTracked = {}; // 重複トラッキング防止

  // [Security] セキュリティスキャン実行済みフラグ
  var _securityScanned = false;

  // [Security] セキュリティスキャン関数
  function runSecurityScan(apiBase, companyId, sessionId) {
    // セッション毎に1回のみ実行
    var scanKey = 'saleschat_security_scanned_' + sessionId;
    try {
      if (sessionStorage.getItem(scanKey)) {
        return;
      }
      sessionStorage.setItem(scanKey, 'true');
    } catch (e) {
      if (_securityScanned) return;
      _securityScanned = true;
    }

    var issues = [];
    var meta = {
      protocol: window.location.protocol,
      hasHttpForms: false,
      hasMixedContent: false,
      externalScripts: [],
      jqueryVersion: null,
      cookieFlags: { total: 0, httpOnly: 0, secure: 0 }
    };

    // 1. HTTPS未使用チェック
    if (window.location.protocol !== 'https:') {
      issues.push({
        id: 'https_missing',
        type: 'https_missing',
        severity: 'critical',
        title: 'HTTPS未使用',
        description: 'サイトがHTTPSを使用していません。通信が暗号化されておらず、中間者攻撃のリスクがあります。',
        recommendation: 'SSL/TLS証明書を導入し、サイト全体をHTTPS化してください。'
      });
    }

    // 2. HTTPフォーム送信チェック
    try {
      var forms = document.querySelectorAll('form[action^="http:"]');
      if (forms.length > 0) {
        meta.hasHttpForms = true;
        issues.push({
          id: 'http_form',
          type: 'http_form',
          severity: 'critical',
          title: 'HTTPフォーム送信',
          description: forms.length + '個のフォームがHTTP（非暗号化）で送信される設定になっています。',
          recommendation: 'フォームのaction属性をHTTPSのURLに変更してください。',
          details: '対象フォーム数: ' + forms.length
        });
      }
    } catch (e) {}

    // 3. 混合コンテンツチェック
    try {
      var mixedResources = [];
      // images
      document.querySelectorAll('img[src^="http:"]').forEach(function(el) {
        mixedResources.push(el.src);
      });
      // scripts
      document.querySelectorAll('script[src^="http:"]').forEach(function(el) {
        mixedResources.push(el.src);
      });
      // stylesheets
      document.querySelectorAll('link[href^="http:"]').forEach(function(el) {
        mixedResources.push(el.href);
      });

      if (mixedResources.length > 0 && window.location.protocol === 'https:') {
        meta.hasMixedContent = true;
        issues.push({
          id: 'mixed_content',
          type: 'mixed_content',
          severity: 'high',
          title: '混合コンテンツ',
          description: mixedResources.length + '個のリソースがHTTPで読み込まれています。',
          recommendation: 'すべてのリソースをHTTPS経由で読み込むようにしてください。',
          details: mixedResources.slice(0, 5).join(', ') + (mixedResources.length > 5 ? '...' : '')
        });
      }
    } catch (e) {}

    // 4. 外部スクリプトチェック
    try {
      var currentHost = window.location.hostname;
      var externalScripts = [];
      document.querySelectorAll('script[src]').forEach(function(el) {
        try {
          var url = new URL(el.src);
          if (url.hostname !== currentHost && !url.hostname.includes('cdn') && !url.hostname.includes('cloudflare')) {
            externalScripts.push(url.hostname);
          }
        } catch (e) {}
      });

      meta.externalScripts = externalScripts;
      if (externalScripts.length > 5) {
        issues.push({
          id: 'external_scripts',
          type: 'external_scripts',
          severity: 'info',
          title: '多数の外部スクリプト',
          description: externalScripts.length + '個の外部ドメインからスクリプトが読み込まれています。',
          recommendation: '必要のないスクリプトを削除し、信頼できるソースのみを使用してください。',
          details: externalScripts.slice(0, 5).join(', ')
        });
      }
    } catch (e) {}

    // 5. 古いjQueryチェック
    try {
      if (typeof jQuery !== 'undefined' && jQuery.fn && jQuery.fn.jquery) {
        var version = jQuery.fn.jquery;
        meta.jqueryVersion = version;
        var parts = version.split('.');
        var major = parseInt(parts[0], 10);
        var minor = parseInt(parts[1], 10);

        // jQuery 3.5.0未満は脆弱性あり
        if (major < 3 || (major === 3 && minor < 5)) {
          issues.push({
            id: 'old_jquery',
            type: 'old_jquery',
            severity: 'medium',
            title: '古いjQueryバージョン',
            description: 'jQuery ' + version + 'が使用されています。セキュリティ脆弱性が存在する可能性があります。',
            recommendation: 'jQueryを最新バージョンにアップデートしてください。',
            details: '現在のバージョン: ' + version
          });
        }
      }
    } catch (e) {}

    // 6. クッキーのセキュリティフラグチェック
    try {
      var cookies = document.cookie.split(';');
      meta.cookieFlags.total = cookies.filter(function(c) { return c.trim().length > 0; }).length;
      // document.cookieからはHttpOnlyクッキーは見えないので、
      // HttpOnlyでないクッキーが多い場合は警告
      if (meta.cookieFlags.total > 3) {
        issues.push({
          id: 'cookie_security',
          type: 'cookie_security',
          severity: 'medium',
          title: 'JavaScriptからアクセス可能なCookie',
          description: meta.cookieFlags.total + '個のCookieがJavaScriptからアクセス可能です。',
          recommendation: 'セッションCookieにはHttpOnly属性を設定し、重要なCookieにはSecure属性を追加してください。',
          details: 'アクセス可能なCookie数: ' + meta.cookieFlags.total
        });
      }
    } catch (e) {}

    // 7. パスワードフィールドのautocompleteチェック
    try {
      var passwordFields = document.querySelectorAll('input[type="password"]');
      var insecurePasswords = [];
      passwordFields.forEach(function(el) {
        var autocomplete = el.getAttribute('autocomplete');
        if (!autocomplete || autocomplete === 'on') {
          insecurePasswords.push(el);
        }
      });

      if (insecurePasswords.length > 0) {
        issues.push({
          id: 'password_autocomplete',
          type: 'password_autocomplete',
          severity: 'low',
          title: 'パスワードフィールドのautocomplete',
          description: insecurePasswords.length + '個のパスワードフィールドでautocompleteが適切に設定されていません。',
          recommendation: 'パスワードフィールドにはautocomplete="new-password"または"current-password"を設定してください。'
        });
      }
    } catch (e) {}

    // スキャン結果を送信
    try {
      fetch(apiBase + '/api/security/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          companyId: companyId,
          sessionId: sessionId,
          pageUrl: window.location.href,
          issues: issues,
          meta: meta,
          userAgent: navigator.userAgent
        })
      }).catch(function() {
        // エラーは握りつぶす（ウィジェット表示を邪魔しない）
      });
    } catch (e) {
      // 無視
    }
  }

  window.saleschatTrackConversion = function(conversionType, conversionValue) {
    if (_trackingContext) {
      sendTrackingEvent(
        {
          type: 'conversion',
          conversionType: conversionType || 'custom',
          conversionValue: typeof conversionValue === 'number' ? conversionValue : undefined
        },
        _trackingContext.apiBase,
        _trackingContext.companyId,
        _trackingContext.visitorId,
        _trackingContext.sessionId
      );
    }
  };

  // [Analytics] HTMLをCSSセレクタに変換
  function htmlToSelector(input) {
    if (!input || typeof input !== 'string') return input;

    // HTMLっぽくなければそのまま返す
    var trimmed = input.trim();
    if (!trimmed.startsWith('<')) return input;

    try {
      // 簡易パース: <tag attr="value" attr2="value2">
      var match = trimmed.match(/^<(\w+)([^>]*)>/);
      if (!match) return input;

      var tagName = match[1].toLowerCase();
      var attrsStr = match[2];
      var selector = tagName;

      // 属性を抽出
      var attrRegex = /(\w+)=["']([^"']*)["']/g;
      var attrMatch;
      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
        var attrName = attrMatch[1];
        var attrValue = attrMatch[2];
        // id属性は#で、class属性は.で、その他は[]で
        if (attrName === 'id') {
          selector += '#' + attrValue;
        } else if (attrName === 'class') {
          selector += '.' + attrValue.split(/\s+/).join('.');
        } else {
          selector += '[' + attrName + '="' + attrValue + '"]';
        }
      }

      return selector;
    } catch (e) {
      return input;
    }
  }

  // [Analytics] 自動コンバージョントラッキングの設定
  function setupConversionTracking(settings, trackingContext) {
    console.log('[CV Debug] setupConversionTracking called with:', settings);
    if (!settings || !settings.triggers || !Array.isArray(settings.triggers)) {
      console.log('[CV Debug] No settings or triggers found');
      return;
    }

    var enabledTriggers = settings.triggers.filter(function(t) { return t.enabled; });
    console.log('[CV Debug] Enabled triggers:', enabledTriggers.length);
    if (enabledTriggers.length === 0) return;

    // URLベースのコンバージョンチェック
    function checkUrlConversion() {
      var currentUrl = window.location.href;
      var currentPath = window.location.pathname + window.location.search;

      enabledTriggers.forEach(function(trigger) {
        if (trigger.type !== 'url' || !trigger.urlPattern) return;
        if (_conversionTracked[trigger.id]) return; // 既にトラッキング済み

        var matched = false;
        var matchType = trigger.urlMatchType || 'contains';
        var pattern = trigger.urlPattern;

        if (matchType === 'contains') {
          matched = currentUrl.indexOf(pattern) !== -1 || currentPath.indexOf(pattern) !== -1;
        } else if (matchType === 'exact') {
          matched = currentUrl === pattern || currentPath === pattern;
        } else if (matchType === 'regex') {
          try {
            var regex = new RegExp(pattern);
            matched = regex.test(currentUrl) || regex.test(currentPath);
          } catch (e) {
            console.warn('[AI Widget] Invalid regex pattern:', pattern);
          }
        }

        if (matched) {
          _conversionTracked[trigger.id] = true;
          sendTrackingEvent(
            {
              type: 'conversion',
              conversionType: trigger.name || 'url_match',
              conversionValue: trigger.value,
              triggerId: trigger.id
            },
            trackingContext.apiBase,
            trackingContext.companyId,
            trackingContext.visitorId,
            trackingContext.sessionId
          );
        }
      });
    }

    // クリックベースのコンバージョン
    function setupClickTracking() {
      var clickTriggers = enabledTriggers.filter(function(t) {
        return t.type === 'click' && (t.clickSelector || t.clickText);
      });
      console.log('[CV Debug] Click triggers:', clickTriggers.length, clickTriggers);
      if (clickTriggers.length === 0) return;

      document.addEventListener('click', function(e) {
        console.log('[CV Debug] Click detected on:', e.target.tagName, e.target.textContent?.slice(0, 50));
        clickTriggers.forEach(function(trigger) {
          if (_conversionTracked[trigger.id]) {
            console.log('[CV Debug] Already tracked:', trigger.id);
            return;
          }

          try {
            var targetEl = e.target;
            var matched = false;

            // テキストマッチング（優先）
            if (trigger.clickText) {
              console.log('[CV Debug] Checking text match for:', trigger.clickText);
              while (targetEl && targetEl !== document) {
                var elText = (targetEl.textContent || targetEl.innerText || '').trim();
                var buttonText = trigger.clickText.trim();
                console.log('[CV Debug] Element:', targetEl.tagName, 'Text:', elText.slice(0, 50));
                // 部分一致でマッチ
                if (elText.indexOf(buttonText) !== -1 || buttonText.indexOf(elText) !== -1) {
                  // ボタン/リンク/inputのみ対象
                  var tagName = targetEl.tagName && targetEl.tagName.toLowerCase();
                  console.log('[CV Debug] Text matched! Tag:', tagName);
                  if (tagName === 'button' || tagName === 'a' || tagName === 'input') {
                    matched = true;
                    console.log('[CV Debug] ✅ MATCH FOUND!');
                    break;
                  }
                }
                targetEl = targetEl.parentElement;
              }
            }
            // セレクタマッチング
            else if (trigger.clickSelector) {
              var selector = htmlToSelector(trigger.clickSelector);
              console.log('[CV Debug] Checking selector:', selector);
              while (targetEl && targetEl !== document) {
                if (targetEl.matches && targetEl.matches(selector)) {
                  matched = true;
                  console.log('[CV Debug] ✅ Selector MATCH FOUND!');
                  break;
                }
                targetEl = targetEl.parentElement;
              }
            }

            if (matched) {
              console.log('[CV Debug] 🎯 Sending conversion event for:', trigger.name);
              _conversionTracked[trigger.id] = true;
              sendTrackingEvent(
                {
                  type: 'conversion',
                  conversionType: trigger.name || 'click',
                  conversionValue: trigger.value,
                  triggerId: trigger.id
                },
                trackingContext.apiBase,
                trackingContext.companyId,
                trackingContext.visitorId,
                trackingContext.sessionId
              );
            }
          } catch (err) {
            console.error('[CV Debug] Error:', err);
          }
        });
      }, true);
    }

    // フォーム送信ベースのコンバージョン
    function setupFormTracking() {
      var formTriggers = enabledTriggers.filter(function(t) { return t.type === 'form'; });
      if (formTriggers.length === 0) return;

      document.addEventListener('submit', function(e) {
        formTriggers.forEach(function(trigger) {
          if (_conversionTracked[trigger.id]) return;

          var formEl = e.target;
          var shouldTrack = false;

          // 送信ボタンのテキストでマッチ（優先）
          if (trigger.formButtonText) {
            var submitButtons = formEl.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])');
            for (var i = 0; i < submitButtons.length; i++) {
              var btn = submitButtons[i];
              var btnText = (btn.textContent || btn.innerText || btn.value || '').trim();
              if (btnText.indexOf(trigger.formButtonText.trim()) !== -1) {
                shouldTrack = true;
                break;
              }
            }
          }
          // セレクタでマッチ
          else if (trigger.formSelector) {
            try {
              var selector = htmlToSelector(trigger.formSelector);
              shouldTrack = formEl.matches && formEl.matches(selector);
            } catch (e) {
              // セレクタエラーは無視
            }
          }
          // 指定なし = すべてのフォーム
          else {
            shouldTrack = true;
          }

          if (shouldTrack) {
            _conversionTracked[trigger.id] = true;
            sendTrackingEvent(
              {
                type: 'conversion',
                conversionType: trigger.name || 'form_submit',
                conversionValue: trigger.value,
                triggerId: trigger.id
              },
              trackingContext.apiBase,
              trackingContext.companyId,
              trackingContext.visitorId,
              trackingContext.sessionId
            );
          }
        });
      }, true);
    }

    // 初期チェック（ページ読み込み時）
    checkUrlConversion();

    // SPAのURL変更を監視
    if (typeof window.history !== 'undefined' && window.history.pushState) {
      var originalPushState = window.history.pushState;
      window.history.pushState = function() {
        originalPushState.apply(window.history, arguments);
        setTimeout(checkUrlConversion, 100);
      };

      window.addEventListener('popstate', function() {
        setTimeout(checkUrlConversion, 100);
      });
    }

    // クリック・フォーム監視を設定
    setupClickTracking();
    setupFormTracking();
  }

  // data-company-id を使う実装
  function init() {
    var scriptTag = document.currentScript;

    // Next.js等で動的読み込みされた場合、currentScriptがnullになる
    // その場合はdata-company-id属性を持つscriptタグを探す
    if (!scriptTag) {
      var scripts = document.querySelectorAll('script[data-company-id]');
      if (scripts.length > 0) {
        scriptTag = scripts[scripts.length - 1]; // 最後のものを使用
      }
    }

    if (!scriptTag) {
      console.warn('[AI Widget] Script tag not found');
      return;
    }

    var companyId = scriptTag.getAttribute("data-company-id");
    var widgetBase =
      scriptTag.getAttribute("data-widget-base-url") ||
      window.NEXT_PUBLIC_WIDGET_BASE_URL ||
      "";

    console.log('[AI Widget] Init - companyId:', companyId, 'widgetBase:', widgetBase);

    if (!companyId || !widgetBase) {
      console.warn("[AI Widget] companyId or widgetBase is missing.");
      return;
    }

    // APIベースURLを抽出（widget URLから）
    var apiBase = widgetBase.replace('/widget', '');
    if (apiBase.endsWith('/')) {
      apiBase = apiBase.slice(0, -1);
    }

    // [Analytics] トラッキング初期化
    var visitorId = getOrCreateVisitorId();
    var sessionId = getOrCreateSessionId();

    // グローバルコンテキストを設定
    _trackingContext = {
      companyId: companyId,
      visitorId: visitorId,
      sessionId: sessionId,
      apiBase: apiBase
    };

    // セッション開始イベント
    sendTrackingEvent({ type: 'session_start' }, apiBase, companyId, visitorId, sessionId);

    // ページビューイベント
    sendTrackingEvent({ type: 'page_view' }, apiBase, companyId, visitorId, sessionId);

    // サーバーから設定を取得して初期化
    console.log('[AI Widget] Fetching settings from:', apiBase + '/api/widget/settings?companyId=' + companyId);
    fetch(apiBase + '/api/widget/settings?companyId=' + encodeURIComponent(companyId))
      .then(function(res) { return res.json(); })
      .then(function(settings) {
        console.log('[AI Widget] Settings received, conversionSettings:', settings.conversionSettings);
        // コンバージョントラッキングを設定（Pro機能）
        if (settings.conversionSettings && settings.conversionSettings.enabled) {
          setupConversionTracking(settings.conversionSettings, _trackingContext);
        } else {
          console.log('[AI Widget] Conversion tracking not enabled or no settings');
        }

        // セキュリティスキャンを実行（Pro機能、設定で有効な場合）
        if (settings.securityScanEnabled) {
          // 少し遅延させてページ読み込み完了後に実行
          setTimeout(function() {
            runSecurityScan(apiBase, companyId, sessionId);
          }, 3000);
        }

        // 設定を取得成功
        initWidget({
          companyId: companyId,
          agentName: settings.agentName || "AIコンシェルジュ",
          themeColor: settings.themeColor || "#D86672",
          widgetPosition: settings.widgetPosition || "bottom-right",
          widgetStyle: settings.widgetStyle || "bubble",
          avatarUrl: settings.avatarUrl || null,
          iconVideoUrl: settings.iconVideoUrl || null,
          iconSize: settings.iconSize || "medium",
          tooltipText: settings.tooltipText || "AIアシスタントが対応します",
          tooltipDuration: typeof settings.tooltipDuration === 'number' ? settings.tooltipDuration : 5,
          widgetBase: widgetBase,
          apiBase: apiBase,
          visitorId: visitorId,
          sessionId: sessionId
        });
      })
      .catch(function(err) {
        console.warn("[AI Widget] Failed to fetch settings, using defaults:", err);
        // フォールバック: data属性または デフォルト値を使用
        initWidget({
          companyId: companyId,
          agentName: scriptTag.getAttribute("data-agent-name") || "AIコンシェルジュ",
          themeColor: scriptTag.getAttribute("data-theme-color") || "#D86672",
          widgetPosition: scriptTag.getAttribute("data-widget-position") || "bottom-right",
          widgetStyle: scriptTag.getAttribute("data-widget-style") || "bubble",
          avatarUrl: scriptTag.getAttribute("data-avatar-url") || null,
          iconVideoUrl: scriptTag.getAttribute("data-icon-video-url") || null,
          iconSize: scriptTag.getAttribute("data-icon-size") || "medium",
          tooltipText: scriptTag.getAttribute("data-tooltip-text") || "AIアシスタントが対応します",
          tooltipDuration: parseInt(scriptTag.getAttribute("data-tooltip-duration") || "5", 10),
          widgetBase: widgetBase,
          apiBase: apiBase,
          visitorId: visitorId,
          sessionId: sessionId
        });
      });
  }

  // ウィジェットを初期化
  function initWidget(config) {
    var companyId = config.companyId;
    var agentName = config.agentName;
    var themeColor = config.themeColor;
    var widgetPosition = config.widgetPosition;
    var widgetStyle = config.widgetStyle || "bubble"; // "bubble" or "icon"
    var avatarUrl = config.avatarUrl; // アバター画像URL
    var iconVideoUrl = config.iconVideoUrl; // アイコン動画URL（5秒以内、ループ）
    var iconSize = config.iconSize || "medium"; // "medium", "large", "xlarge"
    var tooltipText = config.tooltipText || "AIアシスタントが対応します";
    var tooltipDuration = typeof config.tooltipDuration === 'number' ? config.tooltipDuration : 5; // 秒（0=非表示, -1=常に表示）
    var widgetBase = config.widgetBase;
    var apiBase = config.apiBase;
    var visitorId = config.visitorId;
    var sessionId = config.sessionId;

    // サイズに応じたピクセル値を取得
    var iconSizeMap = {
      "medium": 56,
      "large": 70,
      "xlarge": 84
    };
    var buttonSize = iconSizeMap[iconSize] || 56;

    // SPA対応：履歴変更を検知
    var lastUrl = window.location.href;
    function checkUrlChange() {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        sendTrackingEvent({ type: 'page_view' }, apiBase, companyId, visitorId, sessionId);
      }
    }
    // popstateイベント
    window.addEventListener('popstate', checkUrlChange);
    // History API のラップ
    var originalPushState = history.pushState;
    history.pushState = function() {
      originalPushState.apply(this, arguments);
      checkUrlChange();
    };
    var originalReplaceState = history.replaceState;
    history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      checkUrlChange();
    };

    // モバイル判定
    const isMobile = () => window.innerWidth <= 768;

    // 位置に応じたスタイル（モバイルフレンドリー）
    const getPositionStyles = (position) => {
      // モバイルでは中央配置は下部に変換
      const mobile = isMobile();

      switch (position) {
        case "bottom-left":
          return {
            button: { bottom: "16px", left: "16px", right: "auto", top: "auto" },
            iframe: { bottom: "70px", left: "16px", right: "auto", top: "auto" }
          };
        case "bottom-center":
          return {
            button: { bottom: "16px", left: "50%", right: "auto", top: "auto", transform: "translateX(-50%)" },
            iframe: { bottom: "70px", left: "50%", right: "auto", top: "auto", transform: "translateX(-50%)" }
          };
        case "middle-left":
          // モバイルでは左下に配置
          if (mobile) {
            return {
              button: { bottom: "16px", left: "16px", right: "auto", top: "auto" },
              iframe: { bottom: "70px", left: "16px", right: "auto", top: "auto" }
            };
          }
          return {
            button: { top: "50%", left: "16px", right: "auto", bottom: "auto", transform: "translateY(-50%)" },
            iframe: { top: "50%", left: "16px", right: "auto", bottom: "auto", transform: "translateY(-50%)" }
          };
        case "middle-right":
          // モバイルでは右下に配置
          if (mobile) {
            return {
              button: { bottom: "16px", right: "16px", left: "auto", top: "auto" },
              iframe: { bottom: "70px", right: "16px", left: "auto", top: "auto" }
            };
          }
          return {
            button: { top: "50%", right: "16px", left: "auto", bottom: "auto", transform: "translateY(-50%)" },
            iframe: { top: "50%", right: "16px", left: "auto", bottom: "auto", transform: "translateY(-50%)" }
          };
        case "bottom-right":
        default:
          return {
            button: { bottom: "16px", right: "16px", left: "auto", top: "auto" },
            iframe: { bottom: "70px", right: "16px", left: "auto", top: "auto" }
          };
      }
    };

    const positionStyles = getPositionStyles(widgetPosition);

    // パルスアニメーション用スタイルを追加
    const styleId = 'saleschat-widget-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes saleschat-pulse {
          0% { box-shadow: 0 4px 14px rgba(0,0,0,0.25); }
          50% { box-shadow: 0 4px 20px rgba(0,0,0,0.35), 0 0 0 8px rgba(0,0,0,0.05); }
          100% { box-shadow: 0 4px 14px rgba(0,0,0,0.25); }
        }
        .saleschat-pulse {
          animation: saleschat-pulse 2s ease-in-out infinite;
        }
      `;
      document.head.appendChild(style);
    }

    // チャットアイコンSVG
    const chatIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    const closeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    // ボタンコンテナ（ボタンとツールチップをまとめる）
    const buttonContainer = document.createElement("div");
    Object.assign(buttonContainer.style, {
      position: "fixed",
      zIndex: 999999,
      display: "flex",
      flexDirection: "column",
      alignItems: widgetPosition.includes("left") ? "flex-start" : "flex-end",
      gap: "8px",
      ...positionStyles.button
    });

    // ツールチップ（設定に応じて表示/非表示）
    const tooltip = document.createElement("div");
    tooltip.innerHTML = `<span style="font-weight: 500;">${tooltipText}</span>`;
    Object.assign(tooltip.style, {
      backgroundColor: "#fff",
      color: "#374151",
      padding: "10px 14px",
      borderRadius: "12px",
      fontSize: "13px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      whiteSpace: "nowrap",
      opacity: tooltipDuration === 0 ? "0" : "1",
      display: tooltipDuration === 0 ? "none" : "block",
      transition: "opacity 0.3s ease",
      position: "relative"
    });

    // ツールチップの矢印
    const tooltipArrow = document.createElement("div");
    Object.assign(tooltipArrow.style, {
      position: "absolute",
      bottom: "-6px",
      [widgetPosition.includes("left") ? "left" : "right"]: "20px",
      width: "12px",
      height: "12px",
      backgroundColor: "#fff",
      transform: "rotate(45deg)",
      boxShadow: "2px 2px 4px rgba(0,0,0,0.1)"
    });
    tooltip.appendChild(tooltipArrow);

    // 指定秒後にツールチップをフェードアウト（-1の場合は常に表示、0の場合は非表示）
    if (tooltipDuration > 0) {
      setTimeout(function() {
        tooltip.style.opacity = "0";
        setTimeout(function() {
          tooltip.style.display = "none";
        }, 300);
      }, tooltipDuration * 1000);
    }

    // フローティングボタン
    const button = document.createElement("button");
    button.innerHTML = chatIconSvg;
    button.className = "saleschat-pulse";

    // スタイルに応じたボタンデザイン
    var avatarSrc = avatarUrl || (apiBase + "/agent-avatar.png");

    if (iconVideoUrl) {
      // 動画がある場合は動画を表示（widgetStyleに関わらず）
      Object.assign(button.style, {
        width: buttonSize + "px",
        height: buttonSize + "px",
        borderRadius: "50%",
        border: "3px solid #fff",
        backgroundColor: "#fff",
        padding: "0",
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden"
      });
      button.innerHTML = `<video src="${iconVideoUrl}" autoplay loop muted playsinline style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;"></video>`;
    } else if (widgetStyle === "icon") {
      // アイコンスタイル（アバター画像を表示）
      Object.assign(button.style, {
        width: buttonSize + "px",
        height: buttonSize + "px",
        borderRadius: "50%",
        border: "3px solid #fff",
        backgroundColor: "#fff",
        padding: "0",
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden"
      });
      button.innerHTML = `<img src="${avatarSrc}" alt="AI Assistant" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    } else {
      // バブル（円形背景）- デフォルト
      Object.assign(button.style, {
        width: buttonSize + "px",
        height: buttonSize + "px",
        borderRadius: "50%",
        border: "none",
        backgroundColor: themeColor,
        color: "#fff",
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      });
    }

    // ホバーで少し暗くする
    const darkenColor = (color) => {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      const darkerR = Math.max(0, r - 30);
      const darkerG = Math.max(0, g - 30);
      const darkerB = Math.max(0, b - 30);
      return `rgb(${darkerR}, ${darkerG}, ${darkerB})`;
    };

    if (iconVideoUrl || widgetStyle === "icon") {
      // 動画またはアイコンスタイルの場合
      button.onmouseover = function () {
        button.style.transform = "scale(1.1)";
        button.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
      };
      button.onmouseout = function () {
        button.style.transform = "scale(1)";
        button.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)";
      };
    } else {
      // バブルスタイルの場合
      button.onmouseover = function () {
        button.style.backgroundColor = darkenColor(themeColor);
        button.style.transform = "scale(1.1)";
      };
      button.onmouseout = function () {
        button.style.backgroundColor = themeColor;
        button.style.transform = "scale(1)";
      };
    }

    // コンテナに追加
    buttonContainer.appendChild(tooltip);
    buttonContainer.appendChild(button);

    // iframe コンテナ
    const iframeWrapper = document.createElement("div");
    // iframeの位置をボタンサイズに応じて調整（ボタン下端から14pxの余白）
    var iframeBottomOffset = buttonSize + 14;
    var iframePositionStyle = Object.assign({}, positionStyles.iframe);
    if (iframePositionStyle.bottom) {
      iframePositionStyle.bottom = iframeBottomOffset + "px";
    }
    Object.assign(iframeWrapper.style, {
      position: "fixed",
      width: "360px",
      height: "520px",
      maxWidth: "95vw",
      maxHeight: "80vh",
      zIndex: 999998,
      boxShadow: "0 25px 50px -12px rgba(15,23,42,0.45)",
      borderRadius: "18px",
      overflow: "hidden",
      display: "none",
      transition: "all 0.3s ease",
      ...iframePositionStyle
    });

    const iframe = document.createElement("iframe");
    iframe.src =
      widgetBase +
      "?companyId=" +
      encodeURIComponent(companyId) +
      "&agentName=" +
      encodeURIComponent(agentName) +
      "&themeColor=" +
      encodeURIComponent(themeColor) +
      "&sessionId=" +
      encodeURIComponent(sessionId) +
      "&visitorId=" +
      encodeURIComponent(visitorId) +
      "&pageUrl=" +
      encodeURIComponent(window.location.href);
    iframe.style.border = "none";
    iframe.style.width = "100%";
    iframe.style.height = "100%";

    iframeWrapper.appendChild(iframe);

    // アイコンスタイル用のHTML（動画またはアバター画像）
    var avatarSrc = avatarUrl || (apiBase + "/agent-avatar.png");
    var iconHtml = iconVideoUrl
      ? `<video src="${iconVideoUrl}" autoplay loop muted playsinline style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;"></video>`
      : `<img src="${avatarSrc}" alt="AI Assistant" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;

    button.addEventListener("click", function () {
      var isHidden = iframeWrapper.style.display === "none";
      iframeWrapper.style.display = isHidden ? "block" : "none";

      // スタイルに応じてアイコン切り替え
      if (iconVideoUrl || widgetStyle === "icon") {
        // 動画またはアイコンスタイル: 開くとき閉じるアイコン、閉じるとき動画/アバター
        button.innerHTML = isHidden ? closeIconSvg : iconHtml;
      } else {
        // バブルスタイル: 開くとき閉じるアイコン、閉じるときチャットアイコン
        button.innerHTML = isHidden ? closeIconSvg : chatIconSvg;
      }

      // チャット開いたらツールチップを非表示 & パルスアニメーション停止
      if (isHidden) {
        tooltip.style.display = "none";
        button.className = "";
      }

      // [Analytics] チャット開閉イベント
      if (isHidden) {
        sendTrackingEvent({ type: 'chat_open' }, apiBase, companyId, visitorId, sessionId);
      } else {
        sendTrackingEvent({ type: 'chat_end' }, apiBase, companyId, visitorId, sessionId);
      }
    });

    // 画面リサイズ時に位置を再計算（モバイル↔デスクトップ切り替え対応）
    var resizeTimeout;
    window.addEventListener("resize", function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function() {
        var newStyles = getPositionStyles(widgetPosition);
        Object.assign(buttonContainer.style, newStyles.button);
        // iframeの位置をボタンサイズに応じて調整
        var newIframeStyle = Object.assign({}, newStyles.iframe);
        if (newIframeStyle.bottom) {
          newIframeStyle.bottom = (buttonSize + 14) + "px";
        }
        Object.assign(iframeWrapper.style, newIframeStyle);
      }, 100);
    });

    document.body.appendChild(buttonContainer);
    document.body.appendChild(iframeWrapper);
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
