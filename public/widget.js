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
    var agentName =
      scriptTag.getAttribute("data-agent-name") || "AIコンシェルジュ";
    var themeColor =
      scriptTag.getAttribute("data-theme-color") || "#D86672";
    var widgetPosition =
      scriptTag.getAttribute("data-widget-position") || "bottom-right";
    var widgetBase =
      scriptTag.getAttribute("data-widget-base-url") ||
      window.NEXT_PUBLIC_WIDGET_BASE_URL ||
      "";

    if (!companyId || !widgetBase) {
      console.warn("[AI Widget] companyId or widgetBase is missing.");
      return;
    }

    // [Analytics] トラッキング初期化
    var visitorId = getOrCreateVisitorId();
    var sessionId = getOrCreateSessionId();

    // APIベースURLを抽出（widget URLから）
    var apiBase = widgetBase.replace('/widget', '');
    if (apiBase.endsWith('/')) {
      apiBase = apiBase.slice(0, -1);
    }

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

    // 位置に応じたスタイル
    const getPositionStyles = (position) => {
      switch (position) {
        case "bottom-left":
          return {
            button: { left: "16px", right: "auto" },
            iframe: { left: "16px", right: "auto" }
          };
        case "bottom-center":
          return {
            button: { left: "50%", right: "auto", transform: "translateX(-50%)" },
            iframe: { left: "50%", right: "auto", transform: "translateX(-50%)" }
          };
        case "bottom-right":
        default:
          return {
            button: { right: "16px", left: "auto" },
            iframe: { right: "16px", left: "auto" }
          };
      }
    };

    const positionStyles = getPositionStyles(widgetPosition);

    // フローティングボタン
    const button = document.createElement("button");
    button.innerText = "AI相談";
    Object.assign(button.style, {
      position: "fixed",
      bottom: "16px",
      zIndex: 999999,
      borderRadius: "9999px",
      padding: "10px 16px",
      border: "none",
      backgroundColor: themeColor,
      color: "#fff",
      fontSize: "14px",
      fontWeight: "500",
      boxShadow: "0 10px 15px -3px rgba(15,23,42,0.2)",
      cursor: "pointer",
      transition: "all 0.2s ease",
      ...positionStyles.button
    });

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

    button.onmouseover = function () {
      button.style.backgroundColor = darkenColor(themeColor);
      if (widgetPosition !== "bottom-center") {
        button.style.transform = "scale(1.05)";
      } else {
        button.style.transform = "translateX(-50%) scale(1.05)";
      }
    };
    button.onmouseout = function () {
      button.style.backgroundColor = themeColor;
      if (widgetPosition !== "bottom-center") {
        button.style.transform = "scale(1)";
      } else {
        button.style.transform = "translateX(-50%)";
      }
    };

    // iframe コンテナ
    const iframeWrapper = document.createElement("div");
    Object.assign(iframeWrapper.style, {
      position: "fixed",
      bottom: "70px",
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

    button.addEventListener("click", function () {
      var isHidden = iframeWrapper.style.display === "none";
      iframeWrapper.style.display = isHidden ? "block" : "none";
      button.innerText = isHidden ? "✕ 閉じる" : "AI相談";

      // [Analytics] チャット開閉イベント
      if (isHidden) {
        sendTrackingEvent({ type: 'chat_open' }, apiBase, companyId, visitorId, sessionId);
      } else {
        sendTrackingEvent({ type: 'chat_end' }, apiBase, companyId, visitorId, sessionId);
      }
    });

    document.body.appendChild(button);
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
