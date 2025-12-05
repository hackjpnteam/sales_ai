(function () {
  // data-company-id を使う実装
  function init() {
    const scriptTag = document.currentScript;
    if (!scriptTag) return;

    const companyId = scriptTag.getAttribute("data-company-id");
    const agentName =
      scriptTag.getAttribute("data-agent-name") || "AIコンシェルジュ";
    const themeColor =
      scriptTag.getAttribute("data-theme-color") || "#D86672";
    const widgetPosition =
      scriptTag.getAttribute("data-widget-position") || "bottom-right";
    const widgetBase =
      scriptTag.getAttribute("data-widget-base-url") ||
      window.NEXT_PUBLIC_WIDGET_BASE_URL ||
      "";

    if (!companyId || !widgetBase) {
      console.warn("[AI Widget] companyId or widgetBase is missing.");
      return;
    }

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
      const isHidden = iframeWrapper.style.display === "none";
      iframeWrapper.style.display = isHidden ? "block" : "none";
      button.innerText = isHidden ? "✕ 閉じる" : "AI相談";
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
