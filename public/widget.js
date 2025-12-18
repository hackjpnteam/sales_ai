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

  // data-company-id を使う実装
  function init() {
    var scriptTag = document.currentScript;
    if (!scriptTag) return;

    var companyId = scriptTag.getAttribute("data-company-id");
    var widgetBase =
      scriptTag.getAttribute("data-widget-base-url") ||
      window.NEXT_PUBLIC_WIDGET_BASE_URL ||
      "";

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
    fetch(apiBase + '/api/widget/settings?companyId=' + encodeURIComponent(companyId))
      .then(function(res) { return res.json(); })
      .then(function(settings) {
        // 設定を取得成功
        initWidget({
          companyId: companyId,
          agentName: settings.agentName || "AIコンシェルジュ",
          themeColor: settings.themeColor || "#D86672",
          widgetPosition: settings.widgetPosition || "bottom-right",
          widgetStyle: settings.widgetStyle || "bubble",
          avatarUrl: settings.avatarUrl || null,
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
    var widgetBase = config.widgetBase;
    var apiBase = config.apiBase;
    var visitorId = config.visitorId;
    var sessionId = config.sessionId;

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

    // ツールチップ（5秒後に消える）
    const tooltip = document.createElement("div");
    tooltip.innerHTML = `<span style="font-weight: 500;">AIアシスタントが対応します</span>`;
    Object.assign(tooltip.style, {
      backgroundColor: "#fff",
      color: "#374151",
      padding: "10px 14px",
      borderRadius: "12px",
      fontSize: "13px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      whiteSpace: "nowrap",
      opacity: "1",
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

    // 5秒後にツールチップをフェードアウト
    setTimeout(function() {
      tooltip.style.opacity = "0";
      setTimeout(function() {
        tooltip.style.display = "none";
      }, 300);
    }, 5000);

    // フローティングボタン
    const button = document.createElement("button");
    button.innerHTML = chatIconSvg;
    button.className = "saleschat-pulse";

    // スタイルに応じたボタンデザイン
    if (widgetStyle === "icon") {
      // アイコンスタイル（アバター画像を表示）
      var avatarSrc = avatarUrl || (apiBase + "/agent-avatar.png");
      Object.assign(button.style, {
        width: "56px",
        height: "56px",
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
      // アバター画像を表示
      button.innerHTML = `<img src="${avatarSrc}" alt="AI Assistant" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    } else {
      // バブル（円形背景）- デフォルト
      Object.assign(button.style, {
        width: "56px",
        height: "56px",
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

    if (widgetStyle === "icon") {
      button.onmouseover = function () {
        button.style.transform = "scale(1.1)";
        button.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
      };
      button.onmouseout = function () {
        button.style.transform = "scale(1)";
        button.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)";
      };
    } else {
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
      ...positionStyles.iframe
    });

    const iframe = document.createElement("iframe");
    iframe.src =
      widgetBase +
      "?companyId=" +
      encodeURIComponent(companyId) +
      "&agentName=" +
      encodeURIComponent(agentName) +
      "&themeColor=" +
      encodeURIComponent(themeColor);
    iframe.style.border = "none";
    iframe.style.width = "100%";
    iframe.style.height = "100%";

    iframeWrapper.appendChild(iframe);

    // アイコンスタイル用のアバター画像HTML
    var avatarSrc = avatarUrl || (apiBase + "/agent-avatar.png");
    var avatarHtml = `<img src="${avatarSrc}" alt="AI Assistant" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;

    button.addEventListener("click", function () {
      var isHidden = iframeWrapper.style.display === "none";
      iframeWrapper.style.display = isHidden ? "block" : "none";

      // スタイルに応じてアイコン切り替え
      if (widgetStyle === "icon") {
        // アイコンスタイル: 開くとき閉じるアイコン、閉じるときアバター画像
        button.innerHTML = isHidden ? closeIconSvg : avatarHtml;
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
        Object.assign(iframeWrapper.style, newStyles.iframe);
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
